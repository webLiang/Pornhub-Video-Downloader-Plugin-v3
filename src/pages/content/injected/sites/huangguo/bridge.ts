export const HUANGGUO_REQUEST_EVENT = 'video-downloader:huangguo:request';
export const HUANGGUO_RESPONSE_EVENT = 'video-downloader:huangguo:response';

/** Encrypted handshake plus playback POST; aligned with the site client timeout. */
export const HUANGGUO_PLAYBACK_TIMEOUT_MS = 12000;

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export interface HuangguoPlaybackRequest {
  requestId: string;
  pageUrl: string;
  id: string;
  episode: number;
}

export interface HuangguoPlaybackResult {
  requestId: string;
  pageUrl: string;
  videoUrl?: string;
  headers?: Record<string, string>;
}

export interface HuangguoPlaybackMedia {
  videoUrl: string;
  headers?: Record<string, string>;
}

/** Accept numeric media ids the playback API will route, and reject path injection. */
export function isHuangguoMediaId(value: string, maxLength: number): boolean {
  if (!/^[1-9]\d*$/.test(value) || value.length > maxLength) return false;
  return !(value.length === 19 && value > '9223372036854775807');
}

/** Preserve signed HTTP playlists and files; reject scripts and non-media URLs. */
export function normalizeHuangguoMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && /\.(?:m3u8|mp4)(?:$|[?#])/i.test(url.href) ? url.href : null;
  } catch {
    return null;
  }
}

/** Keep CDN auth headers the player attaches, and drop names that could break the request. */
export function huangguoCdnHeaders(cdn: unknown): Record<string, string> | undefined {
  if (!cdn || typeof cdn !== 'object') return undefined;
  const row = cdn as Record<string, unknown>;
  if (row.m3u8Enabled !== true && row.otherEnabled !== true) return undefined;
  if (typeof row.authKey !== 'string' || !HEADER_NAME.test(row.authKey)) return undefined;
  if (typeof row.authValue !== 'string' || !isHeaderValue(row.authValue)) return undefined;
  if (typeof row.app !== 'string' || !isHeaderValue(row.app)) return undefined;
  return {
    [row.authKey]: row.authValue,
    'x-cdn-app': row.app,
  };
}

/** Re-check headers crossing from the page so a bad value cannot be forwarded into downloads. */
export function sanitizeHuangguoHeaders(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const headers: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(value)) {
    if (!HEADER_NAME.test(name) || !isHeaderValue(headerValue)) return undefined;
    headers[name] = headerValue;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Read the decrypted playback JSON.
 * Public HTML no longer contains a playable URL; only this response is trusted.
 */
export function readHuangguoPlayback(body: unknown, id: string, episode: number): HuangguoPlaybackMedia | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as { status?: unknown; code?: unknown; data?: unknown };
  const accepted = record.status === 1 || (record.status == null && record.code === 200);
  if (!accepted || !record.data || typeof record.data !== 'object') return null;
  const data = record.data as {
    id?: unknown;
    ep?: unknown;
    manifest_method?: unknown;
    streams?: { main?: unknown };
    cdn?: unknown;
  };
  if (data.manifest_method !== 'GET') return null;
  if (String(data.id ?? '') !== id || Number(data.ep) !== episode) return null;
  const videoUrl = normalizeHuangguoMediaUrl(data.streams?.main);
  if (!videoUrl) return null;
  const headers = huangguoCdnHeaders(data.cdn);
  return headers ? { videoUrl, headers } : { videoUrl };
}

/** Header values are short tokens; reject CR/LF so they cannot split the download request. */
function isHeaderValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\r\n\0]/.test(value);
}
