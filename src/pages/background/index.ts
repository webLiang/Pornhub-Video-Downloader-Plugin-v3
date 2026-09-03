/* eslint-disable @typescript-eslint/no-explicit-any */
import reloadOnUpdate from 'virtual:reload-on-update-in-background-script';
import 'webextension-polyfill';
import M3U8Downloader from './utils/dist/m3u8-downloader-core.obf';
import MP4Downloader from './utils/dist/mp4-downloader.obf';
import { opfsFileExists, removeOpfsFileByName } from './utils/video-download-core/opfs-task-cache';
import m3u8DownloadStorage from '@src/shared/storages/m3u8DownloadStorage';
import downloadHistoryStorage from '@src/shared/storages/downloadHistoryStorage';
import downloadQueueStorage, {
  type DownloadTask,
  type DownloadTaskFormat,
} from '@src/shared/storages/downloadQueueStorage';
import { getDownloadSubdir, withDownloadSubdir } from '@src/shared/storages/downloadSettingsStorage';
import { DownloadSpeedTracker } from '@src/shared/utils/formatDownloadSpeed';
import { buildSanitizedDownloadFilenameWithExtension } from '@src/shared/utils/sanitizeDownloadFilename';
import {
  bindPendingDownloadId,
  clearPendingBlobFilename,
  setPendingBlobFilename,
} from '@src/shared/utils/downloadFilenameFix';
reloadOnUpdate('pages/background');

/**
 * Extension reloading is necessary because the browser automatically caches the css.
 * If you do not use the css of the content script, please delete it.
 */
// reloadOnUpdate('pages/content/style.scss');

console.log('background loaded');

/** Resolve source page URL from task fields (pageUrl first, then Referer header). */
function resolveTaskPageUrl(task: DownloadTask): string | undefined {
  const pageUrl = task.pageUrl?.trim();
  if (pageUrl) return pageUrl;
  const referer = task.headers?.Referer?.trim();
  return referer || undefined;
}

/** Persist a completed download in history, including source page when available. */
function addHistoryRecord(task: DownloadTask, finalName: string): void {
  void downloadHistoryStorage.addRecord(finalName, task.url, resolveTaskPageUrl(task));
}

// ---------------------------------------------------------------------------
// Multi-task download manager (max 6 concurrent + persistent wait queue)
// ---------------------------------------------------------------------------

const MAX_ACTIVE_TASKS = 6;

type ActiveRunner = { kind: 'm3u8'; instance: any } | { kind: 'mp4'; instance: MP4Downloader };

const activeRunners = new Map<string, ActiveRunner>();
/** Paused tasks keep downloader instances until resume or delete */
const pausedRunners = new Map<string, ActiveRunner>();
/** SW-restart recovery for tasks stuck in Save As / chrome.downloads write phase */
const awaitingSaveRecoveries = new Map<string, { listener: (delta: chrome.downloads.DownloadDelta) => void }>();
let scheduling = false;
const downloadSpeedTracker = new DownloadSpeedTracker();

/** True when the task is waiting on chrome.downloads (incl. Save As), not fetching media. */
function isAwaitingSave(task: DownloadTask): boolean {
  return !!task.isFileDownloading || typeof task.chromeDownloadId === 'number';
}

type ProgressPatchInput = {
  taskId: string;
  patch: Partial<DownloadTask>;
  fetchedBytes?: number;
  hideSpeed?: boolean;
};

/** Merge progress fields with computed download speed (VDH-style byte delta / elapsed time). */
function buildProgressPatch(input: ProgressPatchInput): Partial<DownloadTask> {
  const { taskId, patch, fetchedBytes = 0, hideSpeed = false } = input;
  const downloadSpeed = downloadSpeedTracker.update(taskId, fetchedBytes, hideSpeed);
  return {
    ...patch,
    fetchedBytes,
    downloadSpeed,
  };
}

// Read current download state
async function getDownloadState() {
  return await m3u8DownloadStorage.get();
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[background] Received message:', message);

  // Queue mode
  if (message.type === 'download-queue-enqueue') {
    handleQueueEnqueue(message, sendResponse);
    return true;
  } else if (message.type === 'download-queue-cancel' || message.type === 'download-queue-delete') {
    handleQueueDelete(message, sendResponse);
    return true;
  } else if (message.type === 'download-queue-pause') {
    handleQueuePause(message, sendResponse);
    return true;
  } else if (message.type === 'download-queue-resume') {
    handleQueueResume(message, sendResponse);
    return true;
  } else if (message.type === 'download-queue-clear-queued') {
    downloadQueueStorage.clearQueued().then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'download-queue-clear-errors') {
    downloadQueueStorage.clearErrors().then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'download-queue-snapshot') {
    downloadQueueStorage.get().then(state => sendResponse({ success: true, state }));
    return true;
  }

  // Legacy M3U8 download messages
  if (message.type === 'm3u8-download-start') {
    // Legacy path: enqueue (no longer single-task limited)
    handleQueueEnqueue(
      {
        type: 'download-queue-enqueue',
        url: message.url,
        fileName: message.fileName,
        format: 'm3u8',
        headers: message.headers,
      },
      sendResponse,
    );
    return true; // keep channel open for async sendResponse
  } else if (message.type === 'm3u8-download-cancel') {
    // Legacy cancel: stop all active m3u8 tasks
    cancelAllByKind('m3u8').then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'm3u8-download-status') {
    getDownloadState().then(state => {
      sendResponse(state);
    });
    return true; // keep channel open for async sendResponse
  } else if (message.type === 'mp4-download-start') {
    handleQueueEnqueue(
      {
        type: 'download-queue-enqueue',
        url: message.url,
        fileName: message.fileName,
        format: 'mp4',
        headers: message.headers,
      },
      sendResponse,
    );
    return true;
  } else if (message.type === 'mp4-download-cancel') {
    cancelAllByKind('mp4').then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'open-downloads-folder') {
    chrome.downloads.showDefaultFolder();
    sendResponse({ success: true });
    return false;
  } else if (message.type === 'open-download-item') {
    openDownloadItem(message, sendResponse);
    return true;
  } else if (message.type === 'ext-fetch-text') {
    handleExtFetchText(message, sendResponse);
    return true;
  }

  return false;
});

const EXT_FETCH_TIMEOUT_MS = 20000;

/** Headers fetch() cannot set in a service worker; attach them with a session DNR rule. */
const EXT_FETCH_DNR_HEADERS = /^(origin|referer)$/i;

/**
 * Content-script helper: fetch a URL from the SW (bypasses page CORS).
 * Only http(s) is allowed. Origin/Referer are applied via declarativeNetRequest.
 */
function handleExtFetchText(
  message: { url?: string; headers?: Record<string, string> },
  sendResponse: (response: unknown) => void,
): void {
  const url = typeof message.url === 'string' ? message.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) {
    sendResponse({ ok: false, error: 'invalid url' });
    return;
  }

  const headers = new Headers();
  const dnrHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [];
  if (message.headers && typeof message.headers === 'object') {
    for (const [key, value] of Object.entries(message.headers)) {
      if (typeof value !== 'string' || !value) continue;
      if (EXT_FETCH_DNR_HEADERS.test(key)) {
        dnrHeaders.push({
          operation: chrome.declarativeNetRequest.HeaderOperation.SET,
          header: key,
          value,
        });
      } else {
        headers.set(key, value);
      }
    }
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), EXT_FETCH_TIMEOUT_MS);
  const ruleId = dnrHeaders.length ? Math.ceil(Math.random() * 1e8) : 0;

  void (async () => {
    try {
      if (ruleId) {
        await chrome.declarativeNetRequest.updateSessionRules({
          addRules: [
            {
              id: ruleId,
              priority: 1,
              action: {
                type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
                requestHeaders: dnrHeaders,
              },
              condition: { urlFilter: url },
            },
          ],
        });
      }
      const response = await fetch(url, { headers, signal: abort.signal });
      const text = await response.text();
      sendResponse({ ok: response.ok, status: response.status, text });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      clearTimeout(timer);
      if (ruleId) {
        try {
          await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
        } catch {
          // rule may already be gone
        }
      }
    }
  })();
}

// Resume wait queue when background SW wakes or restarts
schedule();

async function cancelAllByKind(kind: ActiveRunner['kind']) {
  const ids = [...activeRunners.entries()].filter(([, r]) => r.kind === kind).map(([id]) => id);
  await Promise.allSettled(ids.map(id => deleteTaskAndPurge(id)));
}

/** Detach Save As recovery listener if one is registered for this task. */
function clearAwaitingSaveRecovery(taskId: string): void {
  const entry = awaitingSaveRecoveries.get(taskId);
  if (!entry) return;
  try {
    chrome.downloads.onChanged.removeListener(entry.listener);
  } catch {
    // ignore
  }
  awaitingSaveRecoveries.delete(taskId);
}

async function deleteTaskAndPurge(taskId: string) {
  clearAwaitingSaveRecovery(taskId);
  const runner = activeRunners.get(taskId) || pausedRunners.get(taskId);
  if (runner) {
    try {
      if (runner.kind === 'm3u8') {
        (runner.instance as any).destroy(true);
      } else {
        runner.instance.destroy(true);
      }
    } catch {
      // ignore
    }
    activeRunners.delete(taskId);
    pausedRunners.delete(taskId);
  }
  const state = await downloadQueueStorage.get();
  const task = state.tasks.find(t => t.id === taskId);
  if (task?.opfsCacheFileName) {
    await removeOpfsFileByName(task.opfsCacheFileName);
  }
  await downloadQueueStorage.removeTask(taskId);
  downloadSpeedTracker.clear(taskId);
  schedule();
}

async function handleQueueEnqueue(message: any, sendResponse: (response?: any) => void) {
  try {
    const url = (message.url || '').trim();
    const format: DownloadTaskFormat = message.format || 'm3u8';
    const fileName = (message.fileName || '').trim() || 'video';
    const headers = message.headers;
    const quality = typeof message.quality === 'string' ? message.quality.trim() : undefined;
    const pageUrl =
      (typeof message.pageUrl === 'string' ? message.pageUrl.trim() : undefined) ||
      (typeof headers?.Referer === 'string' ? headers.Referer.trim() : undefined);

    if (!url) {
      sendResponse({ success: false, error: 'URL 不能为空' });
      return;
    }

    const id = await downloadQueueStorage.enqueue({ url, fileName, format, quality, pageUrl, headers });
    schedule();
    sendResponse({ success: true, id });
  } catch (e: any) {
    sendResponse({ success: false, error: e?.message || '入队失败' });
  }
}

async function handleQueueDelete(message: any, sendResponse: (response?: any) => void) {
  try {
    const taskId = message.taskId;
    if (!taskId) {
      sendResponse({ success: false, error: 'taskId is required' });
      return;
    }
    await deleteTaskAndPurge(taskId);
    sendResponse({ success: true });
  } catch (e: any) {
    sendResponse({ success: false, error: e?.message || 'delete failed' });
  }
}

async function handleQueuePause(message: any, sendResponse: (response?: any) => void) {
  try {
    const taskId = message.taskId;
    if (!taskId) {
      sendResponse({ success: false, error: 'taskId is required' });
      return;
    }
    const runner = activeRunners.get(taskId);
    if (!runner) {
      console.warn('[background] pause: no runner for taskId (Map out of sync?)', taskId, 'active:', [
        ...activeRunners.keys(),
      ]);
      sendResponse({ success: false, error: 'Task is not active (internal runner missing)' });
      return;
    }
    if (runner.kind === 'm3u8') {
      await (runner.instance as any).pauseSoft();
    } else {
      runner.instance.pauseSoft();
      await new Promise(r => setTimeout(r, 80));
    }
    activeRunners.delete(taskId);
    pausedRunners.set(taskId, runner);
    const bytes = runner.kind === 'mp4' ? runner.instance.getBytesReceived() : undefined;
    await downloadQueueStorage.updateTask(taskId, {
      status: 'paused',
      cachedBytes: bytes,
      downloadSpeed: undefined,
    });
    downloadSpeedTracker.clear(taskId);
    sendResponse({ success: true });
    schedule();
  } catch (e: any) {
    sendResponse({ success: false, error: e?.message || 'pause failed' });
  }
}

async function handleQueueResume(message: any, sendResponse: (response?: any) => void) {
  try {
    const taskId = message.taskId;
    if (!taskId) {
      sendResponse({ success: false, error: 'taskId is required' });
      return;
    }
    const state = await downloadQueueStorage.get();
    const task = state.tasks.find(t => t.id === taskId);
    if (!task || task.status !== 'paused') {
      sendResponse({ success: false, error: 'Task is not paused' });
      return;
    }
    const runner = pausedRunners.get(taskId);
    if (!runner) {
      sendResponse({ success: false, error: 'Resume unavailable (reload clears in-memory runners)' });
      return;
    }
    pausedRunners.delete(taskId);
    await downloadQueueStorage.updateTask(taskId, { status: 'downloading', error: undefined });
    activeRunners.set(taskId, runner);

    if (runner.kind === 'm3u8') {
      (runner.instance as any).resume();
    } else {
      const downloadSubdir = await getDownloadSubdir();
      void runner.instance.start({
        url: task.url,
        fileName: task.fileName || 'video',
        headers: task.headers,
        opfsFileName: task.opfsCacheFileName,
        resumeFromByte: task.cachedBytes || 0,
        downloadSubdir,
        onProgress: (data: any) => {
          const progress = data.progress >= 0 ? data.progress : 0;
          const patch: Partial<DownloadTask> = {
            progress,
            finishNum: data.isFileDownloading ? 1 : 0,
            targetSegment: 1,
            errorNum: 0,
            isFileDownloading: data.isFileDownloading,
            fileDownloadProgress: data.isFileDownloading ? data.progress : undefined,
            cachedBytes: data.bytesReceived,
          };
          if (typeof data.chromeDownloadId === 'number') {
            patch.chromeDownloadId = data.chromeDownloadId;
          }
          downloadQueueStorage.updateTask(
            task.id,
            buildProgressPatch({
              taskId: task.id,
              fetchedBytes: data.bytesReceived || 0,
              hideSpeed: data.isFileDownloading,
              patch,
            }),
          );
        },
        onComplete: (data: any) => {
          clearAwaitingSaveRecovery(task.id);
          const finalName = data.fileName || task.fileName || 'video';
          addHistoryRecord(task, finalName);
          downloadQueueStorage.removeTask(task.id);
          activeRunners.delete(task.id);
          pausedRunners.delete(task.id);
          chrome.runtime
            .sendMessage({ type: 'download-task-complete', taskId: task.id, fileName: finalName })
            .catch(() => {});
          schedule();
        },
        onError: (error: string) => {
          clearAwaitingSaveRecovery(task.id);
          downloadQueueStorage.updateTask(task.id, {
            status: 'error',
            error,
            isFileDownloading: false,
            chromeDownloadId: undefined,
          });
          activeRunners.delete(task.id);
          pausedRunners.delete(task.id);
          chrome.runtime.sendMessage({ type: 'download-task-error', taskId: task.id, error }).catch(() => {});
          schedule();
        },
      });
    }
    sendResponse({ success: true });
    schedule();
  } catch (e: any) {
    sendResponse({ success: false, error: e?.message || 'resume failed' });
  }
}

/**
 * Resolve chrome.downloads id for an awaiting-save task (stored id, else in_progress filename match).
 */
async function resolveChromeDownloadId(task: DownloadTask): Promise<number | undefined> {
  if (typeof task.chromeDownloadId === 'number') {
    return task.chromeDownloadId;
  }
  try {
    const items = await chrome.downloads.search({ state: 'in_progress' });
    const base = (task.fileName || '').replace(/\.(mp4|ts|webm)$/i, '').trim();
    if (!base) return undefined;
    const match = items.find(i => {
      const name = `${i.filename || ''} ${i.finalUrl || ''}`;
      return name.includes(base);
    });
    return match?.id;
  } catch {
    return undefined;
  }
}

/** Finish a task whose chrome.downloads item already completed after SW restart. */
async function finishAwaitingSaveTask(task: DownloadTask): Promise<void> {
  clearAwaitingSaveRecovery(task.id);
  if (task.opfsCacheFileName) {
    await removeOpfsFileByName(task.opfsCacheFileName);
  }
  const finalName = task.fileName || 'video';
  addHistoryRecord(task, finalName);
  await downloadQueueStorage.removeTask(task.id);
  downloadSpeedTracker.clear(task.id);
  chrome.runtime.sendMessage({ type: 'download-task-complete', taskId: task.id, fileName: finalName }).catch(() => {});
  schedule();
}

/** Mark task error when Save As recovery cannot continue. */
async function failAwaitingSaveTask(task: DownloadTask, error: string): Promise<void> {
  clearAwaitingSaveRecovery(task.id);
  await downloadQueueStorage.updateTask(task.id, {
    status: 'error',
    error,
    isFileDownloading: false,
    chromeDownloadId: undefined,
  });
  downloadSpeedTracker.clear(task.id);
  chrome.runtime.sendMessage({ type: 'download-task-error', taskId: task.id, error }).catch(() => {});
  schedule();
}

/** Re-attach onChanged for an in-progress chrome.downloads item (e.g. open Save As dialog). */
function attachAwaitingSaveListener(task: DownloadTask, chromeDownloadId: number): void {
  if (awaitingSaveRecoveries.has(task.id)) return;

  const listener = (delta: chrome.downloads.DownloadDelta) => {
    if (delta.id !== chromeDownloadId) return;

    if (delta.state?.current === 'complete') {
      void finishAwaitingSaveTask(task);
      return;
    }
    if (delta.state?.current === 'interrupted') {
      void (async () => {
        clearAwaitingSaveRecovery(task.id);
        // Prefer OPFS re-export over hard fail when cache still exists
        if (task.opfsCacheFileName && (await opfsFileExists(task.opfsCacheFileName))) {
          await reExportFromOpfs(task);
          return;
        }
        await failAwaitingSaveTask(task, delta.error?.current || 'Download interrupted');
      })();
    }
  };

  awaitingSaveRecoveries.set(task.id, { listener });
  chrome.downloads.onChanged.addListener(listener);
  void downloadQueueStorage.updateTask(task.id, {
    status: 'downloading',
    isFileDownloading: true,
    chromeDownloadId,
    progress: Math.max(task.progress || 0, 90),
  });
  console.log('[background] recoverAwaitingSave: re-attached listener', {
    taskId: task.id,
    chromeDownloadId,
  });
}

/** Ensure offscreen document exists for OPFS → blob URL. */
async function ensureOffscreenForOpfsExport(): Promise<void> {
  if (!chrome.offscreen) throw new Error('chrome.offscreen API not available');
  const OFFSCREEN_PATH = 'src/pages/offscreen/index.html';
  try {
    const globalScope = self as any;
    const clients = await globalScope.clients?.matchAll();
    if (clients?.some((c: any) => c.url?.includes(OFFSCREEN_PATH))) return;
  } catch {
    // fall through
  }
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'Create blob URL from OPFS for download recovery',
    });
  } catch (err: any) {
    if (err?.message?.includes('already exists')) return;
    throw err;
  }
}

/**
 * Re-run only OPFS → blob → chrome.downloads (no media re-fetch).
 * Used when the previous chrome.downloads item was lost/interrupted after SW restart.
 */
async function reExportFromOpfs(task: DownloadTask): Promise<void> {
  if (awaitingSaveRecoveries.has(task.id)) return;
  const opfsName = task.opfsCacheFileName;
  if (!opfsName || !(await opfsFileExists(opfsName))) {
    await failAwaitingSaveTask(task, 'Save interrupted; cached file missing');
    return;
  }

  // chrome.downloads recovery uses mp4/ts only (webm treated as mp4 container name)
  const ext: 'mp4' | 'ts' = task.format === 'm3u8' ? 'ts' : 'mp4';
  const mimeType = ext === 'ts' ? 'video/MP2T' : 'video/mp4';
  const downloadSubdir = await getDownloadSubdir();
  const downloadFileName = withDownloadSubdir(
    buildSanitizedDownloadFilenameWithExtension(task.fileName || 'video', ext),
    downloadSubdir,
  );

  await downloadQueueStorage.updateTask(task.id, {
    status: 'downloading',
    isFileDownloading: true,
    progress: Math.max(task.progress || 0, 90),
    error: undefined,
  });

  try {
    await ensureOffscreenForOpfsExport();
    const response = await chrome.runtime.sendMessage({
      type: 'OPFS_TO_BLOB_URL',
      filename: opfsName,
      mimeType,
      downloadId: `recover-${task.id}-${Date.now()}`,
    });
    if (!response?.ok || !response?.blobUrl) {
      throw new Error(response?.error || 'Failed to create blob URL from OPFS');
    }
    const blobUrl = response.blobUrl as string;

    await new Promise<void>((resolve, reject) => {
      let chromeDownloadId: number | null = null;
      const listener = (delta: chrome.downloads.DownloadDelta) => {
        if (chromeDownloadId == null || delta.id !== chromeDownloadId) return;
        if (delta.state?.current === 'complete') {
          chrome.downloads.onChanged.removeListener(listener);
          awaitingSaveRecoveries.delete(task.id);
          void finishAwaitingSaveTask(task).then(() => resolve());
        } else if (delta.state?.current === 'interrupted') {
          chrome.downloads.onChanged.removeListener(listener);
          awaitingSaveRecoveries.delete(task.id);
          reject(new Error(delta.error?.current || 'Download interrupted'));
        }
      };
      // Placeholder entry so schedule() won't start a second recovery
      awaitingSaveRecoveries.set(task.id, { listener });
      chrome.downloads.onChanged.addListener(listener);
      setPendingBlobFilename(blobUrl, downloadFileName);
      chrome.downloads.download(
        { url: blobUrl, filename: downloadFileName, saveAs: false, conflictAction: 'uniquify' },
        id => {
          if (chrome.runtime.lastError) {
            clearPendingBlobFilename(blobUrl);
            chrome.downloads.onChanged.removeListener(listener);
            awaitingSaveRecoveries.delete(task.id);
            reject(new Error(chrome.runtime.lastError.message || 'Download failed'));
            return;
          }
          chromeDownloadId = id;
          bindPendingDownloadId(id, blobUrl);
          void downloadQueueStorage.updateTask(task.id, {
            chromeDownloadId: id,
            isFileDownloading: true,
          });
        },
      );
    });
  } catch (err: any) {
    clearAwaitingSaveRecovery(task.id);
    await failAwaitingSaveTask(task, err?.message || 'Failed to re-export cached file');
  }
}

/**
 * After SW restart: finish/complete chrome.downloads wait, or re-export from OPFS.
 * Never re-queues a full media download for awaiting-save tasks.
 */
async function recoverAwaitingSave(task: DownloadTask): Promise<void> {
  if (activeRunners.has(task.id) || pausedRunners.has(task.id) || awaitingSaveRecoveries.has(task.id)) {
    return;
  }

  const downloadId = await resolveChromeDownloadId(task);
  if (typeof downloadId === 'number') {
    try {
      const results = await chrome.downloads.search({ id: downloadId });
      const item = results?.[0];
      if (item?.state === 'complete') {
        await finishAwaitingSaveTask(task);
        return;
      }
      if (item?.state === 'in_progress') {
        attachAwaitingSaveListener(task, downloadId);
        return;
      }
      // interrupted / missing → try OPFS re-export below
    } catch (err) {
      console.warn('[background] recoverAwaitingSave search failed', task.id, err);
    }
  }

  if (task.opfsCacheFileName && (await opfsFileExists(task.opfsCacheFileName))) {
    await reExportFromOpfs(task);
    return;
  }

  await failAwaitingSaveTask(task, 'Save interrupted; cached file missing');
}

function schedule() {
  if (scheduling) return;
  scheduling = true;
  Promise.resolve()
    .then(async () => {
      const state = await downloadQueueStorage.get();
      const tasks = state.tasks || [];

      const taskIds = new Set(tasks.map(t => t.id));
      for (const id of pausedRunners.keys()) {
        if (!taskIds.has(id)) pausedRunners.delete(id);
      }
      for (const id of awaitingSaveRecoveries.keys()) {
        if (!taskIds.has(id)) clearAwaitingSaveRecovery(id);
      }

      // SW restart: tasks in Save As / write phase must NOT be requeued as full downloads
      const awaitingSaveOrphans = tasks.filter(
        t =>
          t.status === 'downloading' &&
          isAwaitingSave(t) &&
          !activeRunners.has(t.id) &&
          !pausedRunners.has(t.id) &&
          !awaitingSaveRecoveries.has(t.id),
      );
      for (const t of awaitingSaveOrphans) {
        recoverAwaitingSave(t).catch(err => {
          console.error('[background] recoverAwaitingSave error:', err);
        });
      }

      // SW restart drops in-memory runners for downloading tasks in storage
      // Revert orphan "downloading" rows (fetch phase only) to queued so the queue does not stall
      const staleDownloading = tasks.filter(
        t => t.status === 'downloading' && !isAwaitingSave(t) && !activeRunners.has(t.id) && !pausedRunners.has(t.id),
      );

      if (staleDownloading.length) {
        await Promise.allSettled(
          staleDownloading.map(t =>
            downloadQueueStorage.updateTask(t.id, {
              status: 'queued',
              startedAt: undefined,
              isFileDownloading: false,
              fileDownloadProgress: undefined,
              chromeDownloadId: undefined,
            }),
          ),
        );
      }

      const refreshed = (await downloadQueueStorage.get()).tasks || [];
      const downloading = refreshed.filter(t => t.status === 'downloading');
      const queued = refreshed
        .filter(t => t.status === 'queued')
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      // Do not delete activeRunners based on storage downloading list alone.
      // Storage and memory can briefly diverge; premature delete breaks pause/delete runner lookup
      // while M3U8Downloader still runs. Release runners in onComplete/onError/pause/delete.

      let activeCount = downloading.length;
      for (const task of queued) {
        if (activeCount >= MAX_ACTIVE_TASKS) break;
        activeCount += 1;
        startTask(task).catch(err => {
          console.error('[background] startTask error:', err);
        });
      }
    })
    .finally(() => {
      scheduling = false;
    });
}

async function startTask(task: DownloadTask) {
  // Guard: skip if already running
  if (activeRunners.has(task.id)) return;

  downloadSpeedTracker.clear(task.id);
  await downloadQueueStorage.updateTask(task.id, {
    status: 'downloading',
    startedAt: Date.now(),
    error: undefined,
    isFileDownloading: false,
    chromeDownloadId: undefined,
  });

  if (task.format === 'm3u8') {
    await startM3u8Task(task);
  } else {
    await startMp4Task(task);
  }
}

async function startM3u8Task(task: DownloadTask) {
  const downloadSubdir = await getDownloadSubdir();
  const downloader = new M3U8Downloader({
    maxConcurrent: 10,
    retryInterval: 2000,
    timeout: 15000,
    dataTimeout: 600000,
    onProgress: (data: any) => {
      const patch: Partial<DownloadTask> = {
        progress: data.progress,
        finishNum: data.finishNum,
        errorNum: data.errorNum,
        targetSegment: data.targetSegment,
        fileDownloadProgress: data.fileDownloadProgress,
        isFileDownloading: data.isFileDownloading,
      };
      if (typeof data.chromeDownloadId === 'number') {
        patch.chromeDownloadId = data.chromeDownloadId;
      }
      downloadQueueStorage.updateTask(
        task.id,
        buildProgressPatch({
          taskId: task.id,
          fetchedBytes: data.bytesReceived || 0,
          hideSpeed: !!data.isFileDownloading,
          patch,
        }),
      );
    },
    onError: (error: string) => {
      clearAwaitingSaveRecovery(task.id);
      downloadQueueStorage.updateTask(task.id, {
        status: 'error',
        error,
        isFileDownloading: false,
        chromeDownloadId: undefined,
      });
      try {
        downloader.destroy();
      } catch {
        // ignore
      }
      activeRunners.delete(task.id);
      chrome.runtime.sendMessage({ type: 'download-task-error', taskId: task.id, error }).catch(() => {});
      schedule();
    },
    onComplete: (data: any) => {
      clearAwaitingSaveRecovery(task.id);
      const finalName = data.fileName || task.fileName || 'video';
      addHistoryRecord(task, finalName);
      downloadQueueStorage.removeTask(task.id);
      try {
        downloader.destroy();
      } catch {
        // ignore
      }
      activeRunners.delete(task.id);
      chrome.runtime
        .sendMessage({ type: 'download-task-complete', taskId: task.id, fileName: finalName })
        .catch(() => {});
      schedule();
    },
  });

  activeRunners.set(task.id, { kind: 'm3u8', instance: downloader });

  downloader.start(task.url, {
    isGetMP4: false,
    fileName: task.fileName || '',
    headers: task.headers || undefined,
    opfsFileName: task.opfsCacheFileName,
    downloadSubdir,
  });
}

async function startMp4Task(task: DownloadTask) {
  const downloadSubdir = await getDownloadSubdir();
  const downloader = new MP4Downloader();
  activeRunners.set(task.id, { kind: 'mp4', instance: downloader });

  downloader.start({
    url: task.url,
    fileName: task.fileName || 'video',
    headers: task.headers,
    opfsFileName: task.opfsCacheFileName,
    resumeFromByte: 0,
    downloadSubdir,
    onProgress: (data: any) => {
      const progress = data.progress >= 0 ? data.progress : 0;
      const patch: Partial<DownloadTask> = {
        progress,
        finishNum: data.isFileDownloading ? 1 : 0,
        targetSegment: 1,
        errorNum: 0,
        isFileDownloading: data.isFileDownloading,
        fileDownloadProgress: data.isFileDownloading ? data.progress : undefined,
        cachedBytes: data.bytesReceived,
      };
      if (typeof data.chromeDownloadId === 'number') {
        patch.chromeDownloadId = data.chromeDownloadId;
      }
      downloadQueueStorage.updateTask(
        task.id,
        buildProgressPatch({
          taskId: task.id,
          fetchedBytes: data.bytesReceived || 0,
          hideSpeed: !!data.isFileDownloading,
          patch,
        }),
      );
    },
    onComplete: (data: any) => {
      clearAwaitingSaveRecovery(task.id);
      const finalName = data.fileName || task.fileName || 'video';
      addHistoryRecord(task, finalName);
      downloadQueueStorage.removeTask(task.id);
      activeRunners.delete(task.id);
      chrome.runtime
        .sendMessage({ type: 'download-task-complete', taskId: task.id, fileName: finalName })
        .catch(() => {});
      schedule();
    },
    onError: (error: string) => {
      clearAwaitingSaveRecovery(task.id);
      downloadQueueStorage.updateTask(task.id, {
        status: 'error',
        error,
        isFileDownloading: false,
        chromeDownloadId: undefined,
      });
      activeRunners.delete(task.id);
      chrome.runtime.sendMessage({ type: 'download-task-error', taskId: task.id, error }).catch(() => {});
      schedule();
    },
  });
}

// ---------------------------------------------------------------------------
// MP4 direct download (fetch + DNR + OPFS, same pipeline as m3u8)
// ---------------------------------------------------------------------------

async function openDownloadItem(message: any, sendResponse: (response?: any) => void) {
  try {
    const { url, fileName } = message;
    let items: chrome.downloads.DownloadItem[] = [];

    if (url) {
      items = await chrome.downloads.search({ url });
    }

    if (!items.length && fileName) {
      items = await chrome.downloads.search({ query: [fileName] });
    }

    if (!items.length) {
      sendResponse({ success: false, error: '未找到对应的下载记录' });
      return;
    }

    chrome.downloads.show(items[0].id);
    sendResponse({ success: true });
  } catch (error: any) {
    console.error('[background] openDownloadItem error:', error);
    sendResponse({ success: false, error: error?.message || '打开下载记录失败' });
  }
}
