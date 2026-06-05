export const M3U8_URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i;

export function normalizeM3u8Url(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed || !/\.m3u8(\?|$)/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}
