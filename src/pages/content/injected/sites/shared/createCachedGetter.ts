import type { SiteGetUrls, SiteVideoInfo } from '../types';

/**
 * 站点嗅探通用包装：内存缓存 + 并发去重，空结果不缓存便于 DOM 就绪后重试。
 */
export function createCachedGetter(resolveUrls: () => Promise<SiteVideoInfo[]>): SiteGetUrls {
  let cached: SiteVideoInfo[] | null = null;
  let pending: Promise<SiteVideoInfo[]> | null = null;

  return () => {
    if (cached?.length) {
      return Promise.resolve(cached);
    }
    if (!pending) {
      pending = resolveUrls()
        .then(result => {
          if (result.length) {
            cached = result;
          }
          return result;
        })
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  };
}
