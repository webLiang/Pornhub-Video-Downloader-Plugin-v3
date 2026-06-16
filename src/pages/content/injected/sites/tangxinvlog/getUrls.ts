import type { SiteVideoInfo } from '../types';
import { createCachedGetter } from '../shared/createCachedGetter';
import { waitForDomReady } from '../shared/dom';
import { buildTangxinVlogFileName, getTangxinVideoObject } from './buildFileName';
import { extractTangxinM3u8Url } from './extractM3u8';

async function resolveTangxinVlogUrls(): Promise<SiteVideoInfo[]> {
  await waitForDomReady();

  const m3u8Url = extractTangxinM3u8Url();
  if (!m3u8Url) {
    console.warn('[tangxinvlog] m3u8 url not found on page');
    return [];
  }

  const fileName = buildTangxinVlogFileName(getTangxinVideoObject());

  // Use media m3u8 directly at sniff time; do not fetch CDN from content script (CORS / hang)
  return [
    {
      quality: 'default',
      videoUrl: m3u8Url,
      format: 'm3u8',
      title: fileName,
    },
  ];
}

export const getTangxinVlogUrls = createCachedGetter(resolveTangxinVlogUrls);
