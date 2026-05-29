/**
 * 解决 blob: URL 下载时 Chrome 忽略 download() 的 filename 参数的问题。
 *
 * 重要（Chrome downloads API 行为）：
 * - onDeterminingFilename 会收到浏览器内**所有**下载，必须用 DownloadItem.byExtensionId 限定本扩展。
 * - 若扩展一直挂着 listener，会与其他下载扩展冲突（对方 suggest 时 Chrome 报「已被命名」）。
 * - 参考 Video DownloadHelper：仅在有 pending 下载时 addListener，空闲时 removeListener。
 *
 * - item.finalUrl 在 onDeterminingFilename 里经常是 ""，不能用 finalUrl ?? url。
 * - pending Map 必须挂在 globalThis，避免 obf 包与 background 各一份闭包。
 */

const GLOBAL_KEY = '__phDownloadBlobFilenamePending_v2';
const LISTENER_ATTACHED_KEY = '__phDownloadBlobFilenameListenerAttached_v1';
const HANDLER_KEY = '__phDownloadBlobFilenameHandler_v1';

type FilenameHandler = (
  item: chrome.downloads.DownloadItem,
  suggest: (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void,
) => void;

type PendingMaps = {
  /** blobUrl → filename，download() 前写入 */
  byUrl: Map<string, string>;
  /** downloadId → filename，download() 回调拿到 id 后写入（最可靠） */
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

/** blob 是否由本扩展创建 */
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

/** 选出真正的 blob URL：finalUrl 可能为 "" */
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

/** 仅处理本扩展发起的下载；其他扩展/网页下载必须 suggest() 放行且不改名 */
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

  // 优先用 downloadId（与 blob 无关，不会误伤其他扩展的同 uuid blob）
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

  // download() 回调尚未返回 id 时的兜底（race）
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

/** 在 chrome.downloads.download(blobUrl, filename) 前调用 */
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

/** download() 回调拿到 id 后调用，绑定本扩展 downloadId → filename */
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

/** 下载启动失败/超时/中断时清理 pending，避免残留影响后续下载 */
export function clearPendingBlobFilename(blobUrl: string): void {
  consumePendingBlob(blobUrl);
  removeFilenameListenerIfIdle();
}

/**
 * @deprecated 不再在 SW 启动时永久注册 listener；setPendingBlobFilename 会按需 attach。
 */
export function registerDownloadFilenameListener(): void {
  /* intentionally empty */
}
