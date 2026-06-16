import type { SiteGetUrls, SiteVideoInfo } from '../types';

/**
 * Site sniff wrapper: in-memory cache + in-flight dedupe; empty results not cached for DOM retry.
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
