import type { SiteVideoInfo } from '../types';
import { waitForDomReady, sanitizeFileName } from '../shared/dom';
import {
  HUANGGUO_PLAYBACK_TIMEOUT_MS,
  HUANGGUO_REQUEST_EVENT,
  HUANGGUO_RESPONSE_EVENT,
  isHuangguoMediaId,
  normalizeHuangguoMediaUrl,
  sanitizeHuangguoHeaders,
  type HuangguoPlaybackRequest,
  type HuangguoPlaybackResult,
} from './bridge';

interface HuangguoInitialData {
  title?: string;
  ep?: number;
}

let playbackRequestSeq = 0;

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
  return Number.isSafeInteger(episode) && episode > 0 && episode <= 2147483647 ? episode : 1;
}

/**
 * Refresh the signed playlist through the page's encrypted playback API.
 * SSR `videoSrc` is empty on current watch pages and is not a fallback.
 */
export async function getHuangguoUrls(): Promise<SiteVideoInfo[]> {
  await waitForDomReady();
  const match = location.pathname.match(/^\/(?:video|detail)\/(\d+)(?:\/ep-\d+)?\/?$/);
  if (!match || !isHuangguoMediaId(match[1], 19)) return [];
  let initial: HuangguoInitialData;
  try {
    initial = JSON.parse(document.getElementById('videoInitialData')?.textContent || '{}');
    if (!initial || typeof initial !== 'object' || Array.isArray(initial)) return [];
  } catch (error) {
    console.warn('[huangguo] initial data parse failed', error);
    return [];
  }
  const pageUrl = location.href;
  const episode = getHuangguoEpisode(new URL(pageUrl), initial, document);
  const playback = await requestHuangguoPlayback({
    requestId: `hg-${(playbackRequestSeq += 1)}`,
    pageUrl,
    id: match[1],
    episode,
  });
  const videoUrl = normalizeHuangguoMediaUrl(playback?.videoUrl);
  if (
    !videoUrl ||
    playback?.pageUrl !== pageUrl ||
    location.href !== pageUrl ||
    getHuangguoEpisode(new URL(pageUrl), initial, document) !== episode
  ) {
    return [];
  }
  const title = sanitizeFileName(
    typeof initial.title === 'string' && initial.title
      ? initial.title
      : document.querySelector('h1')?.textContent || `黄果短剧 ${match[1]}`,
  );
  const headers = sanitizeHuangguoHeaders(playback?.headers);
  const info: SiteVideoInfo = {
    quality: 'default',
    videoUrl,
    format: /\.mp4(?:$|[?#])/i.test(videoUrl) ? 'mp4' : 'm3u8',
    title: `${title} 第${String(episode).padStart(2, '0')}集`,
  };
  if (headers) info.headers = headers;
  return [info];
}

/** Ask the MAIN-world bridge and ignore responses that belong to another sniff. */
function requestHuangguoPlayback(request: HuangguoPlaybackRequest): Promise<HuangguoPlaybackResult | null> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => finish(null), HUANGGUO_PLAYBACK_TIMEOUT_MS);
    /** Stop listening after the matching response or the deadline. */
    function finish(result: HuangguoPlaybackResult | null): void {
      clearTimeout(timeout);
      document.removeEventListener(HUANGGUO_RESPONSE_EVENT, receive);
      resolve(result);
    }
    /** Accept only the JSON payload for this request id. */
    function receive(event: Event): void {
      try {
        const result = JSON.parse((event as CustomEvent<string>).detail) as HuangguoPlaybackResult;
        if (result?.requestId !== request.requestId) return;
        finish(result);
      } catch (error) {
        console.warn('[huangguo] playback response parse failed', error);
        finish(null);
      }
    }
    document.addEventListener(HUANGGUO_RESPONSE_EVENT, receive);
    document.dispatchEvent(new CustomEvent(HUANGGUO_REQUEST_EVENT, { detail: JSON.stringify(request) }));
  });
}
