/**
 * 视频列表项：至少需要 quality 字段用于排序（Popup 的 VideoInfo 等均可满足）
 */
export type VideoInfoLike = {
  quality: string;
};

/**
 * 从 quality 文案里抽出可比较的「垂直分辨率」数值，越大表示越清晰。
 * 兼容 1080p、720、4K、2160、NAME 里带数字等情况；无法识别时返回 0（排在最后）。
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

/** 按清晰度从高到低排序；同分保持原有顺序 */
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
