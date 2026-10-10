export const HUANGDOU_REQUEST_EVENT = 'video-downloader:huangdou:request';
export const HUANGDOU_RESPONSE_EVENT = 'video-downloader:huangdou:response';

export interface HuangdouPlayback {
  pageUrl: string;
  videoUrl: string;
  title: string;
}

/** Preserve signed HTTP media URLs and reject blob sources or non-media resources. */
export function normalizeHuangdouMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && /\.(?:m3u8|mp4)(?:$|[?#])/i.test(url.href) ? url.href : null;
  } catch {
    return null;
  }
}
