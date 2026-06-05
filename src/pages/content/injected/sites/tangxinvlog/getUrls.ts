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

  // 嗅探阶段直接用媒体 m3u8，不在 content script 里 fetch CDN（避免 CORS / 卡住）
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
