import type { SiteVideoInfo } from '../types';
import { waitForDomReady, sanitizeFileName } from '../shared/dom';
import { fetchTextPreferPage } from '../shared/extFetch';

interface HuangguoInitialData {
  id?: string | number;
  title?: string;
  ep?: number;
  videoSrc?: string;
  epPlaySrcs?: Record<string, string>;
}

/** Read the current episode rather than caching the initial SSR episode after navigation. */
export function getHuangguoEpisode(url: URL, initial: HuangguoInitialData, doc: Document): number {
  const active = doc.querySelector('.hg-web-play__ep.is-active[data-ep-id], .hg-play__ep-item.is-active[data-ep-id]');
  const episode = Number(
    active?.getAttribute('data-ep-id') ||
      url.pathname.match(/\/ep-(\d+)\/?$/)?.[1] ||
      url.searchParams.get('ep') ||
      initial.ep ||
      1,
  );
  return Number.isSafeInteger(episode) && episode > 0 ? episode : 1;
}

/** Accept only real HTTP media URLs while preserving the complete CDN signature. */
export function getHuangguoMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && /\.(?:m3u8|mp4)(?:$|[?#])/i.test(url.href) ? url.href : null;
  } catch {
    return null;
  }
}

/** Refresh the site's signed playback URL on each sniff and use SSR data only on transport failure. */
export async function getHuangguoUrls(): Promise<SiteVideoInfo[]> {
  await waitForDomReady();
  const match = location.pathname.match(/^\/(?:video|detail)\/(\d+)(?:\/ep-\d+)?\/?$/);
  if (!match) return [];
  let initial: HuangguoInitialData;
  try {
    initial = JSON.parse(document.getElementById('videoInitialData')?.textContent || '{}');
    if (!initial || typeof initial !== 'object' || Array.isArray(initial)) return [];
  } catch {
    return [];
  }
  const pageUrl = location.href;
  const episode = getHuangguoEpisode(new URL(pageUrl), initial, document);
  let videoUrl: string | null = null;
  try {
    const apiUrl = new URL(`/api/videos/${match[1]}/play`, location.origin);
    apiUrl.searchParams.set('ep', String(episode));
    const response = JSON.parse(await fetchTextPreferPage(apiUrl.href));
    if (response.status !== 1 && response.code !== 200) return [];
    if (response.data?.ep_num != null && Number(response.data.ep_num) !== episode) return [];
    videoUrl = getHuangguoMediaUrl(response.data?.video_url);
  } catch {
    if (String(initial.id) === match[1]) {
      videoUrl = getHuangguoMediaUrl(
        initial.epPlaySrcs?.[String(episode)] || (Number(initial.ep || 1) === episode ? initial.videoSrc : undefined),
      );
    }
  }
  if (!videoUrl || location.href !== pageUrl || getHuangguoEpisode(new URL(pageUrl), initial, document) !== episode)
    return [];
  const title = sanitizeFileName(
    typeof initial.title === 'string'
      ? initial.title
      : document.querySelector('h1')?.textContent || `黄果短剧 ${match[1]}`,
  );
  return [
    {
      quality: 'default',
      videoUrl,
      format: /\.mp4(?:$|[?#])/i.test(videoUrl) ? 'mp4' : 'm3u8',
      title: `${title} 第${String(episode).padStart(2, '0')}集`,
    },
  ];
}
