import type { SiteVideoInfo } from '../types';
import { createCachedGetter } from '../shared/createCachedGetter';
import { waitForDomReady } from '../shared/dom';
import { buildMissavFileName, resolveMissavVideosFromHtml } from './resolveVideos';

/**
 * Sniff MissAV watch pages: packed player JS → surrit.com HLS master → quality list.
 */
async function resolveMissavUrls(): Promise<SiteVideoInfo[]> {
  await waitForDomReady();
  const html = document.documentElement?.innerHTML || document.documentElement?.outerHTML || '';
  const title = buildMissavFileName();
  const items = await resolveMissavVideosFromHtml(html, title);
  if (!items.length) {
    console.warn('[missav] packed HLS playlist not found on page');
  }
  return items;
}

export const getMissavUrls = createCachedGetter(resolveMissavUrls);
