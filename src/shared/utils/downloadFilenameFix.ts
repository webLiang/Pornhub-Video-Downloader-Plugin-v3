/**
 * Fix Chrome ignoring the filename argument on blob: URL downloads.
 *
 * Important (Chrome downloads API behavior):
 * - onDeterminingFilename receives **all** browser downloads; scope with DownloadItem.byExtensionId.
 * - A permanently attached listener conflicts with other download extensions ("already named" on suggest).
 * - Video DownloadHelper pattern: addListener only while pending downloads exist; remove when idle.
 *
 * - item.finalUrl is often "" in onDeterminingFilename; do not rely on finalUrl ?? url.
 * - Pending Map must live on globalThis so obf bundle and background share one closure.
 */

const GLOBAL_KEY = '__phDownloadBlobFilenamePending_v2';
const LISTENER_ATTACHED_KEY = '__phDownloadBlobFilenameListenerAttached_v1';
const HANDLER_KEY = '__phDownloadBlobFilenameHandler_v1';

type FilenameHandler = (
  item: chrome.downloads.DownloadItem,
  suggest: (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void,
) => void;

type PendingMaps = {
  /** blobUrl → filename, written before download() */
  byUrl: Map<string, string>;
  /** downloadId → filename, written after download() callback returns id (most reliable) */
  byDownloadId: Map<number, string>;
};

function getPendingMaps(): PendingMaps {
  const g = globalThis as typeof globalThis & Record<string, PendingMaps | undefined>;
  let m = g[GLOBAL_KEY];
  if (!m) {
    m = { byUrl: new Map(), byDownloadId: new Map() };
    g[GLOBAL_KEY] = m;
  }
  return m;
}

function swGlobal(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

function isListenerAttached(): boolean {
  return Boolean(swGlobal()[LISTENER_ATTACHED_KEY]);
}

function setListenerAttached(attached: boolean): void {
  swGlobal()[LISTENER_ATTACHED_KEY] = attached;
}

function hasPendingWork(): boolean {
  const { byUrl, byDownloadId } = getPendingMaps();
  return byUrl.size > 0 || byDownloadId.size > 0;
}

/** Whether the blob URL was created by this extension */
function isOwnExtensionBlob(blobUrl: string, extensionId: string): boolean {
  const trimmed = (blobUrl || '').trim();
  if (!trimmed.startsWith('blob:')) return false;
  return trimmed.includes(`chrome-extension://${extensionId}/`);
}

function rememberPending(blobUrl: string, filename: string): void {
  const { byUrl } = getPendingMaps();
  byUrl.set((blobUrl || '').trim(), filename);
}

function consumePendingBlob(blobUrl: string): void {
  const { byUrl } = getPendingMaps();
  byUrl.delete((blobUrl || '').trim());
}

/** Pick the real blob URL; finalUrl may be "" */
function pickBlobUrlFromItem(item: chrome.downloads.DownloadItem): string {
  const f = String(item.finalUrl ?? '').trim();
  const u = String(item.url ?? '').trim();
  if (f.startsWith('blob:')) return f;
  if (u.startsWith('blob:')) return u;
  return f || u;
}

function consumePendingForItem(item: chrome.downloads.DownloadItem): void {
  const blobRef = pickBlobUrlFromItem(item);
  if (blobRef) consumePendingBlob(blobRef);
  const rawUrl = String(item.url ?? '').trim();
  if (rawUrl && rawUrl !== blobRef) consumePendingBlob(rawUrl);
  const rawFinal = String(item.finalUrl ?? '').trim();
  if (rawFinal && rawFinal !== blobRef && rawFinal.startsWith('blob:')) {
    consumePendingBlob(rawFinal);
  }
}

function removeFilenameListenerIfIdle(): void {
  if (!isListenerAttached()) return;
  if (hasPendingWork()) return;
  if (typeof chrome?.downloads?.onDeterminingFilename?.removeListener !== 'function') return;
  chrome.downloads.onDeterminingFilename.removeListener(getSharedFilenameHandler());
  setListenerAttached(false);
  console.log('[downloadFilenameFix] listener removed (idle)');
}

function getSharedFilenameHandler(): FilenameHandler {
  const g = swGlobal();
  let handler = g[HANDLER_KEY] as FilenameHandler | undefined;
  if (!handler) {
    handler = onDeterminingFilenameHandler;
    g[HANDLER_KEY] = handler;
  }
  return handler;
}

function ensureFilenameListener(): void {
  if (isListenerAttached()) return;
  if (typeof chrome?.downloads?.onDeterminingFilename?.addListener !== 'function') return;
  chrome.downloads.onDeterminingFilename.addListener(getSharedFilenameHandler());
  setListenerAttached(true);
  console.log('[downloadFilenameFix] listener attached');
}

/** Only handle downloads from this extension; pass through others unchanged */
function onDeterminingFilenameHandler(
  item: chrome.downloads.DownloadItem,
  suggest: (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void,
): void {
  const extensionId = chrome.runtime.id;

  if (item.byExtensionId !== extensionId) {
    suggest();
    return;
  }

  const { byUrl, byDownloadId } = getPendingMaps();

  // Prefer downloadId (independent of blob; avoids colliding with other extensions' blob UUIDs)
  const byIdFilename = byDownloadId.get(item.id);
  if (byIdFilename != null) {
    byDownloadId.delete(item.id);
    consumePendingForItem(item);
    console.log('[downloadFilenameFix] suggest by downloadId', {
      downloadId: item.id,
      wantedTail: byIdFilename.slice(-48),
    });
    suggest({ filename: byIdFilename, conflictAction: 'uniquify' });
    removeFilenameListenerIfIdle();
    return;
  }

  const blobRef = pickBlobUrlFromItem(item);

  if (!blobRef.startsWith('blob:') || !isOwnExtensionBlob(blobRef, extensionId)) {
    suggest();
    return;
  }

  // Fallback when download() callback has not returned id yet (race)
  let wanted = byUrl.get(blobRef);
  if (wanted == null && item.url) {
    wanted = byUrl.get(String(item.url).trim());
  }

  if (wanted == null) {
    console.warn('[downloadFilenameFix] own blob download but no pending filename', {
      downloadId: item.id,
      blobRefPreview: blobRef.slice(0, 96),
      byUrlSize: byUrl.size,
      byDownloadIdSize: byDownloadId.size,
    });
    suggest();
    removeFilenameListenerIfIdle();
    return;
  }

  consumePendingForItem(item);
  console.log('[downloadFilenameFix] suggest by blobUrl (race fallback)', {
    downloadId: item.id,
    wantedTail: wanted.slice(-48),
  });
  suggest({ filename: wanted, conflictAction: 'uniquify' });
  removeFilenameListenerIfIdle();
}

/** Call before chrome.downloads.download(blobUrl, filename) */
export function setPendingBlobFilename(blobUrl: string, filename: string): void {
  rememberPending(blobUrl, filename);
  ensureFilenameListener();
  const { byUrl, byDownloadId } = getPendingMaps();
  console.log('[downloadFilenameFix] setPending', {
    filenameLen: filename.length,
    blobPreview: (blobUrl || '').slice(0, 96),
    byUrlSize: byUrl.size,
    byDownloadIdSize: byDownloadId.size,
  });
}

/** Call after download() callback returns id; bind downloadId → filename */
export function bindPendingDownloadId(downloadId: number, blobUrl: string): void {
  const { byUrl, byDownloadId } = getPendingMaps();
  const key = (blobUrl || '').trim();
  const filename = byUrl.get(key);
  if (filename == null) {
    console.warn('[downloadFilenameFix] bindPendingDownloadId: no byUrl entry', {
      downloadId,
      blobPreview: key.slice(0, 96),
    });
    return;
  }
  byDownloadId.set(downloadId, filename);
  ensureFilenameListener();
  console.log('[downloadFilenameFix] bindPendingDownloadId', {
    downloadId,
    filenameLen: filename.length,
  });
}

/** Clear pending entry on start failure / timeout / interrupt */
export function clearPendingBlobFilename(blobUrl: string): void {
  consumePendingBlob(blobUrl);
  removeFilenameListenerIfIdle();
}

/**
 * @deprecated Do not register listener permanently at SW startup; setPendingBlobFilename attaches on demand.
 */
export function registerDownloadFilenameListener(): void {
  /* intentionally empty */
}
