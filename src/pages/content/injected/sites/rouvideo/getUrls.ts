import type { SiteVideoInfo } from '../types';
import { createCachedGetter } from '../shared/createCachedGetter';
import { waitForDomReady, getPageTitleFallback, sanitizeFileName } from '../shared/dom';

const ROUVIDEO_PATH_RE = /^\/v\/([^/]+)\/?$/i;

export function buildRouvideoPlaybackUrl(pathname: string, origin: string): string | null {
  const match = pathname.match(ROUVIDEO_PATH_RE);
  if (!match) return null;

  return new URL(`/api/hls/${encodeURIComponent(match[1])}`, origin).href;
}

function buildRouvideoFileName(): string {
  const h1 = document.querySelector('h1')?.textContent?.trim();
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim();
  return sanitizeFileName(h1 || og || getPageTitleFallback()) || getPageTitleFallback();
}

async function resolveRouvideoUrls(): Promise<SiteVideoInfo[]> {
  const videoUrl = buildRouvideoPlaybackUrl(location.pathname, location.origin);
  if (!videoUrl) {
    return [];
  }

  await waitForDomReady();
  return [
    {
      quality: 'default',
      videoUrl,
      format: 'm3u8',
      title: buildRouvideoFileName(),
    },
  ];
}

export const getRouvideoUrls = createCachedGetter(resolveRouvideoUrls);
