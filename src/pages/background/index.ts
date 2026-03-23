/* eslint-disable @typescript-eslint/no-explicit-any */
import reloadOnUpdate from 'virtual:reload-on-update-in-background-script';
import 'webextension-polyfill';
import M3U8Downloader from './utils/dist/m3u8-downloader-core.obf';
import MP4Downloader from './utils/dist/mp4-downloader.obf';
import { removeOpfsFileByName } from './utils/video-download-core/opfs-task-cache';
import m3u8DownloadStorage from '@src/shared/storages/m3u8DownloadStorage';
import downloadHistoryStorage from '@src/shared/storages/downloadHistoryStorage';
import downloadQueueStorage, {
  type DownloadTask,
  type DownloadTaskFormat,
} from '@src/shared/storages/downloadQueueStorage';
import { registerDownloadFilenameListener } from '@src/shared/utils/downloadFilenameFix';

reloadOnUpdate('pages/background');

registerDownloadFilenameListener();

/**
 * Extension reloading is necessary because the browser automatically caches the css.
 * If you do not use the css of the content script, please delete it.
 */
// reloadOnUpdate('pages/content/style.scss');

console.log('background loaded');

// ---------------------------------------------------------------------------
// 多任务下载管理（并发<=6 + 等待队列持久化）
// ---------------------------------------------------------------------------

const MAX_ACTIVE_TASKS = 6;

type ActiveRunner = { kind: 'm3u8'; instance: any } | { kind: 'mp4'; instance: MP4Downloader };

const activeRunners = new Map<string, ActiveRunner>();
/** Paused tasks keep downloader instances until resume or delete */
const pausedRunners = new Map<string, ActiveRunner>();
let scheduling = false;

// 获取当前下载状态
async function getDownloadState() {
  return await m3u8DownloadStorage.get();
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[background] Received message:', message);

  // 新：队列模式
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

  // 处理 M3U8 下载相关消息
  if (message.type === 'm3u8-download-start') {
    // 兼容旧逻辑：走队列（不会再限制单任务）
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
    return true; // 保持消息通道打开以支持异步响应
  } else if (message.type === 'm3u8-download-cancel') {
    // 兼容旧取消：取消所有 active 的 m3u8 任务
    cancelAllByKind('m3u8').then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'm3u8-download-status') {
    getDownloadState().then(state => {
      sendResponse(state);
    });
    return true; // 保持消息通道打开以支持异步响应
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
  }

  return false;
});

// background 被唤醒/重启时，自动续跑等待队列
schedule();

async function cancelAllByKind(kind: ActiveRunner['kind']) {
  const ids = [...activeRunners.entries()].filter(([, r]) => r.kind === kind).map(([id]) => id);
  await Promise.allSettled(ids.map(id => deleteTaskAndPurge(id)));
}

async function deleteTaskAndPurge(taskId: string) {
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
  schedule();
}

async function handleQueueEnqueue(message: any, sendResponse: (response?: any) => void) {
  try {
    const url = (message.url || '').trim();
    const format: DownloadTaskFormat = message.format || 'm3u8';
    const fileName = (message.fileName || '').trim() || 'video';
    const headers = message.headers;

    if (!url) {
      sendResponse({ success: false, error: 'URL 不能为空' });
      return;
    }

    const id = await downloadQueueStorage.enqueue({ url, fileName, format, headers });
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
    });
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
      void runner.instance.start({
        url: task.url,
        fileName: task.fileName || 'video',
        headers: task.headers,
        opfsFileName: task.opfsCacheFileName,
        resumeFromByte: task.cachedBytes || 0,
        onProgress: (data: any) => {
          const progress = data.progress >= 0 ? data.progress : 0;
          downloadQueueStorage.updateTask(task.id, {
            progress,
            finishNum: data.isFileDownloading ? 1 : 0,
            targetSegment: 1,
            errorNum: 0,
            isFileDownloading: data.isFileDownloading,
            fileDownloadProgress: data.isFileDownloading ? data.progress : undefined,
            cachedBytes: data.bytesReceived,
          });
        },
        onComplete: (data: any) => {
          const finalName = data.fileName || task.fileName || 'video';
          downloadHistoryStorage.addRecord(finalName, task.url);
          downloadQueueStorage.removeTask(task.id);
          activeRunners.delete(task.id);
          pausedRunners.delete(task.id);
          chrome.runtime
            .sendMessage({ type: 'download-task-complete', taskId: task.id, fileName: finalName })
            .catch(() => {});
          schedule();
        },
        onError: (error: string) => {
          downloadQueueStorage.updateTask(task.id, { status: 'error', error });
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

function schedule() {
  if (scheduling) return;
  scheduling = true;
  Promise.resolve()
    .then(async () => {
      const state = await downloadQueueStorage.get();
      const tasks = state.tasks || [];

      // background/service worker 可能被重启：storage 里的 downloading 任务会失去 runner
      // 这里把“没有 runner 的 downloading”回退到 queued，避免队列卡死
      const staleDownloading = tasks.filter(
        t => t.status === 'downloading' && !activeRunners.has(t.id) && !pausedRunners.has(t.id),
      );

      const taskIds = new Set(tasks.map(t => t.id));
      for (const id of pausedRunners.keys()) {
        if (!taskIds.has(id)) pausedRunners.delete(id);
      }
      if (staleDownloading.length) {
        await Promise.allSettled(
          staleDownloading.map(t =>
            downloadQueueStorage.updateTask(t.id, {
              status: 'queued',
              startedAt: undefined,
              isFileDownloading: false,
              fileDownloadProgress: undefined,
            }),
          ),
        );
      }

      const refreshed = (await downloadQueueStorage.get()).tasks || [];
      const downloading = refreshed.filter(t => t.status === 'downloading');
      const queued = refreshed
        .filter(t => t.status === 'queued')
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      // 不要根据「当前 storage 里的 downloading 列表」去删 activeRunners。
      // storage 与内存可能短暂不一致（并发 update），误删会导致 pause/delete 找不到 runner，
      // 而旧的 M3U8Downloader 仍在跑。runner 应在 onComplete/onError/pause/delete 里显式释放。

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
  // 双保险：已经在跑就不重复启动
  if (activeRunners.has(task.id)) return;

  await downloadQueueStorage.updateTask(task.id, { status: 'downloading', startedAt: Date.now(), error: undefined });

  if (task.format === 'm3u8') {
    startM3u8Task(task);
  } else {
    startMp4Task(task);
  }
}

function startM3u8Task(task: DownloadTask) {
  const downloader = new M3U8Downloader({
    maxConcurrent: 10,
    retryInterval: 2000,
    timeout: 15000,
    dataTimeout: 600000,
    onProgress: (data: any) => {
      downloadQueueStorage.updateTask(task.id, {
        progress: data.progress,
        finishNum: data.finishNum,
        errorNum: data.errorNum,
        targetSegment: data.targetSegment,
        fileDownloadProgress: data.fileDownloadProgress,
        isFileDownloading: data.isFileDownloading,
      });
    },
    onError: (error: string) => {
      downloadQueueStorage.updateTask(task.id, { status: 'error', error });
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
      const finalName = data.fileName || task.fileName || 'video';
      downloadHistoryStorage.addRecord(finalName, task.url);
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
  });
}

function startMp4Task(task: DownloadTask) {
  const downloader = new MP4Downloader();
  activeRunners.set(task.id, { kind: 'mp4', instance: downloader });

  downloader.start({
    url: task.url,
    fileName: task.fileName || 'video',
    headers: task.headers,
    opfsFileName: task.opfsCacheFileName,
    resumeFromByte: 0,
    onProgress: (data: any) => {
      const progress = data.progress >= 0 ? data.progress : 0;
      downloadQueueStorage.updateTask(task.id, {
        progress,
        finishNum: data.isFileDownloading ? 1 : 0,
        targetSegment: 1,
        errorNum: 0,
        isFileDownloading: data.isFileDownloading,
        fileDownloadProgress: data.isFileDownloading ? data.progress : undefined,
        cachedBytes: data.bytesReceived,
      });
    },
    onComplete: (data: any) => {
      const finalName = data.fileName || task.fileName || 'video';
      downloadHistoryStorage.addRecord(finalName, task.url);
      downloadQueueStorage.removeTask(task.id);
      activeRunners.delete(task.id);
      chrome.runtime
        .sendMessage({ type: 'download-task-complete', taskId: task.id, fileName: finalName })
        .catch(() => {});
      schedule();
    },
    onError: (error: string) => {
      downloadQueueStorage.updateTask(task.id, { status: 'error', error });
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
