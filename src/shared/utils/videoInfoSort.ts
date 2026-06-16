/**
 * Video list item shape for sorting (Popup VideoInfo and similar types qualify).
 */
export type VideoInfoLike = {
  quality: string;
};

/**
 * Parse comparable vertical resolution from quality label (higher = sharper).
 * Handles 1080p, 720, 4K, 2160, digits in name; returns 0 when unknown (sorted last).
 */
export function parseQualityHeight(quality: string): number {
  const q = (quality || '').trim().toLowerCase();
  if (!q) return 0;
  if (/\b8k\b/.test(q)) return 4320;
  if (/\b4k\b|\buhd\b|3840|2160/.test(q)) return 2160;
  const withP = q.match(/(\d{3,4})\s*p\b/i);
  if (withP) {
    const n = parseInt(withP[1], 10);
    if (n >= 200 && n <= 5000) return n;
  }
  const anyNum = q.match(/\b(\d{3,4})\b/);
  if (anyNum) {
    const n = parseInt(anyNum[1], 10);
    if (n >= 200 && n <= 5000) return n;
  }
  return 0;
}

/** Sort by quality descending; stable order for equal scores */
export function sortVideoInfosByQualityDesc<T extends VideoInfoLike>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const da = parseQualityHeight(a.item.quality);
      const db = parseQualityHeight(b.item.quality);
      if (db !== da) return db - da;
      return a.index - b.index;
    })
    .map(x => x.item);
}
