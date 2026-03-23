/**
 * 解决 blob: URL 下载时 Chrome 忽略 download() 的 filename、或他扩展注册了 onDeterminingFilename 导致落盘名异常的问题。
 *
 * 注意：
 * - item.finalUrl 在 onDeterminingFilename 里经常是空字符串 ""，不能用 `finalUrl ?? url`（?? 不会把 "" 当成缺省）。
 * - 【关键】esbuild 会把本模块打进 m3u8/mp4 的 obf 包里，与 background/index 里 import 的副本不是同一闭包，模块级 Map 会分裂成两份。
 *   setPending 写在 obf 里、监听器在 index 里读，永远对不上。故 pending 必须挂在 globalThis 上全 SW 共享。
 */

const GLOBAL_KEY = '__phDownloadBlobFilenamePending_v1';
const LISTENER_KEY = '__phDownloadBlobFilenameListenerRegistered_v1';

type PendingMaps = { byUrl: Map<string, string>; byUuid: Map<string, string> };

function getPendingMaps(): PendingMaps {
  const g = globalThis as typeof globalThis & Record<string, PendingMaps | undefined>;
  let m = g[GLOBAL_KEY];
  if (!m) {
    m = { byUrl: new Map(), byUuid: new Map() };
    g[GLOBAL_KEY] = m;
  }
  return m;
}

function swGlobal(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

function isListenerRegistered(): boolean {
  return Boolean(swGlobal()[LISTENER_KEY]);
}

function setListenerRegistered(): void {
  swGlobal()[LISTENER_KEY] = true;
}

/** 从 blob:chrome-extension://id/<uuid> 取出 uuid 段 */
function extractBlobPathId(blobUrl: string): string | null {
  const m = /^blob:chrome-extension:\/\/[^/]+\/(.+)$/.exec((blobUrl || '').trim());
  return m ? m[1] : null;
}

function rememberPending(blobUrl: string, filename: string): void {
  const { byUrl, byUuid } = getPendingMaps();
  const key = (blobUrl || '').trim();
  byUrl.set(key, filename);
  const pathId = extractBlobPathId(key);
  if (pathId) {
    byUuid.set(pathId, filename);
  }
}

function consumePending(blobUrl: string): void {
  const { byUrl, byUuid } = getPendingMaps();
  const key = (blobUrl || '').trim();
  byUrl.delete(key);
  const pathId = extractBlobPathId(key);
  if (pathId) {
    byUuid.delete(pathId);
  }
}

function findPendingFilename(item: chrome.downloads.DownloadItem): string | undefined {
  const { byUrl, byUuid } = getPendingMaps();
  const urls = [item.finalUrl, item.url].filter(Boolean) as string[];
  for (const u of urls) {
    const trimmed = u.trim();
    if (!trimmed) continue;
    const direct = byUrl.get(trimmed);
    if (direct != null) return direct;
    const pathId = extractBlobPathId(trimmed);
    if (pathId && byUuid.has(pathId)) {
      return byUuid.get(pathId);
    }
  }
  return undefined;
}

/** 选出真正的 blob URL：finalUrl 可能为 ""，必须优先看谁以 blob: 开头 */
function pickBlobUrlFromItem(item: chrome.downloads.DownloadItem): string {
  const f = String(item.finalUrl ?? '').trim();
  const u = String(item.url ?? '').trim();
  if (f.startsWith('blob:')) return f;
  if (u.startsWith('blob:')) return u;
  return f || u;
}

/** 在调用 chrome.downloads.download(blobUrl, filename) 前调用，供后续 onDeterminingFilename suggest */
export function setPendingBlobFilename(blobUrl: string, filename: string): void {
  rememberPending(blobUrl, filename);
  const { byUrl, byUuid } = getPendingMaps();
  console.log('[downloadFilenameFix] setPending', {
    filenameLen: filename.length,
    pathId: extractBlobPathId(blobUrl),
    blobPreview: (blobUrl || '').slice(0, 96),
    sharedMapUrlSize: byUrl.size,
    sharedMapUuidSize: byUuid.size,
  });
}

/**
 * 在 background service worker 启动时调用一次。
 */
export function registerDownloadFilenameListener(): void {
  if (isListenerRegistered()) return;
  if (typeof chrome?.downloads?.onDeterminingFilename?.addListener !== 'function') return;

  setListenerRegistered();
  const extensionId = chrome.runtime.id;

  chrome.downloads.onDeterminingFilename.addListener(
    (
      item: chrome.downloads.DownloadItem,
      suggest: (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void,
    ) => {
      const blobRef = pickBlobUrlFromItem(item);
      const rawFinal = item.finalUrl;
      const rawUrl = item.url;

      if (!blobRef.startsWith('blob:')) {
        return;
      }

      const wanted = findPendingFilename(item);
      const { byUrl, byUuid } = getPendingMaps();
      if (wanted == null) {
        console.warn('[downloadFilenameFix] onDeterminingFilename 未命中 pending', {
          blobRef: blobRef.slice(0, 120),
          rawFinalLen: String(rawFinal ?? '').length,
          rawUrlLen: String(rawUrl ?? '').length,
          rawFinalPreview: String(rawFinal ?? '').slice(0, 96),
          rawUrlPreview: String(rawUrl ?? '').slice(0, 96),
          sharedMapUrlSize: byUrl.size,
          sharedMapUuidSize: byUuid.size,
        });
        return;
      }

      consumePending(blobRef);
      if (rawUrl && rawUrl !== blobRef) consumePending(rawUrl);
      if (rawFinal && rawFinal !== blobRef && rawFinal.startsWith('blob:')) consumePending(rawFinal);

      const byExt = (item as { byExtensionId?: string }).byExtensionId;
      console.log('[downloadFilenameFix] onDeterminingFilename suggest OK', {
        wantedLen: wanted.length,
        wantedTail: wanted.slice(-48),
        byExtensionId: byExt ?? '(empty)',
        selfExtensionId: extensionId,
        blobRefPreview: blobRef.slice(0, 96),
      });

      suggest({ filename: wanted, conflictAction: 'uniquify' });
    },
  );
}
