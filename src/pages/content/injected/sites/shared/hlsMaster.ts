import type { SiteVideoInfo } from '../types';

export type HlsVariant = {
  quality: string;
  url: string;
};

/**
 * Resolve a playlist URI against the master playlist URL (relative, absolute, or protocol-relative).
 */
export function resolvePlaylistUri(masterUrl: string, uri: string): string {
  return new URL(uri.trim(), masterUrl).href;
}

/**
 * Parse #EXT-X-STREAM-INF variants from an HLS master playlist.
 * Returns [] when the text is a media playlist (no variants).
 */
export function parseHlsMasterVariants(text: string, masterUrl: string): HlsVariant[] {
  const lines = String(text || '').split(/\r?\n/);
  const variants: HlsVariant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.toUpperCase().startsWith('#EXT-X-STREAM-INF:')) continue;

    const next = lines[i + 1]?.trim();
    if (!next || next.startsWith('#')) continue;

    const height = line.match(/RESOLUTION=\d+x(\d+)/i)?.[1];
    const name = line.match(/(?:^|,)NAME="?([^",]+)"?/i)?.[1]?.trim();
    const quality = name || (height ? `${height}p` : 'default');

    variants.push({
      quality,
      url: resolvePlaylistUri(masterUrl, next),
    });
  }

  return variants;
}

/**
 * Map a master (or media) playlist URL + body into sniff results.
 * Falls back to a single "default" item when no variants are listed.
 */
export function variantsToSiteVideos(
  masterUrl: string,
  text: string,
  title: string,
  extra?: Pick<SiteVideoInfo, 'headers'>,
): SiteVideoInfo[] {
  const variants = parseHlsMasterVariants(text, masterUrl);
  const items = variants.length
    ? variants
    : [{ quality: 'default', url: masterUrl }];

  return items.map(item => ({
    quality: item.quality,
    videoUrl: item.url,
    format: 'm3u8',
    title,
    ...(extra?.headers ? { headers: extra.headers } : {}),
  }));
}
