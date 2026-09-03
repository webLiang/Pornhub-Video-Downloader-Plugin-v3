/** MissAV HLS CDN used by packed player config (yt-dlp / miyuki). */
export const SURRIT_CDN_ORIGIN = 'https://surrit.com';

const PACKED_SURRIT_UUID_RE = /m3u8\|([a-f0-9\|]+)\|com\|surrit\|https\|video/i;
const SURRIT_PLAYLIST_RE = /https?:\/\/surrit\.com\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/playlist\.m3u8/i;
const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
const PACKED_QUALITY_RE = /(\d{3,4})p/gi;

/**
 * Join reversed packed hex fragments into a UUID (miyuki MATCH_UUID_PATTERN).
 * "2bed68c3749a|81e6|4a6a|e051|5163478c" → "5163478c-e051-4a6a-81e6-2bed68c3749a"
 */
export function uuidFromPackedHexParts(packedHex: string): string | null {
  const parts = packedHex
    .split('|')
    .map(part => part.trim().toLowerCase())
    .filter(part => /^[a-f0-9]+$/.test(part));
  if (parts.length < 5) return null;
  const uuid = parts.reverse().join('-');
  return UUID_RE.test(uuid) ? uuid : null;
}

/**
 * Reconstruct https://surrit.com/{uuid}/playlist.m3u8 from packed Dean Edwards JS.
 */
export function extractSurritPlaylistFromPackedHtml(html: string): string | null {
  const direct = html.match(SURRIT_PLAYLIST_RE);
  if (direct?.[0]) return direct[0];

  const packed = html.match(PACKED_SURRIT_UUID_RE);
  if (packed?.[1]) {
    const uuid = uuidFromPackedHexParts(packed[1]);
    if (uuid) return `${SURRIT_CDN_ORIGIN}/${uuid}/playlist.m3u8`;
  }

  // yt-dlp-plugin-missav: m3u8|{parts}|playlist|source
  const pipeBlock = html.split('m3u8|')[1]?.split('|playlist|source')[0];
  if (pipeBlock) {
    const uuid = uuidFromPackedHexParts(pipeBlock.split('|com|')[0] || pipeBlock);
    if (uuid) return `${SURRIT_CDN_ORIGIN}/${uuid}/playlist.m3u8`;
  }

  return null;
}

/**
 * Quality labels embedded next to the packed source list (1080p, 720p, ...).
 * Used only when the master playlist cannot be fetched.
 */
export function extractPackedQualityLabels(html: string): string[] {
  const block = html.split('m3u8|')[1]?.split('|playlist|source')[0] || html;
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const match of block.matchAll(PACKED_QUALITY_RE)) {
    const label = `${match[1]}p`;
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

/**
 * Build per-quality media playlist URLs from a known UUID when master fetch fails.
 */
export function buildSurritQualityUrls(uuid: string, qualities: string[]): string[] {
  return qualities.map(q => `${SURRIT_CDN_ORIGIN}/${uuid}/${q}/video.m3u8`);
}

/** Strip UUID from a surrit playlist URL. */
export function uuidFromSurritPlaylistUrl(url: string): string | null {
  const match = url.match(SURRIT_PLAYLIST_RE);
  return match?.[1]?.toLowerCase() || null;
}
