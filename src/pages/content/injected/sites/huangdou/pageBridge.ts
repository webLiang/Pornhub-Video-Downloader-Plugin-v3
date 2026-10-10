import {
  HUANGDOU_REQUEST_EVENT,
  HUANGDOU_RESPONSE_EVENT,
  normalizeHuangdouMediaUrl,
  type HuangdouPlayback,
} from './bridge';

interface HuangdouSlot {
  source?: string;
  video?: HTMLVideoElement;
  released?: boolean;
  preloading?: boolean;
}

/** Read the visible GPPlayer slot, excluding pooled, released, and preloaded episodes. */
export function readHuangdouPlayback(doc: Document, pageUrl: string, slots: HuangdouSlot[]): HuangdouPlayback | null {
  const candidates = slots.filter(slot => {
    const video = slot?.video;
    if (!video?.isConnected || slot.released || slot.preloading || !video.id.startsWith('__global_video_player__'))
      return false;
    const bounds = video.getBoundingClientRect();
    const view = doc.defaultView;
    const style = view?.getComputedStyle(video);
    return (
      bounds.width > 1 &&
      bounds.height > 1 &&
      bounds.bottom > 0 &&
      bounds.right > 0 &&
      bounds.top < (view?.innerHeight || 0) &&
      bounds.left < (view?.innerWidth || 0) &&
      style?.display !== 'none' &&
      style?.visibility !== 'hidden' &&
      style?.opacity !== '0'
    );
  });
  const slot = candidates.find(candidate => !candidate.video.paused) || candidates[0];
  const videoUrl = normalizeHuangdouMediaUrl(slot?.source);
  if (!videoUrl) return null;
  const path = new URL(videoUrl).pathname.match(/\/drama\/hls\/([^/]+)\/(\d+)\/play\.m3u8$/);
  const root = doc.querySelector('flt-glass-pane')?.shadowRoot;
  const paragraphs = Array.from(root?.querySelectorAll('flt-paragraph') || [])
    .map(element => element.textContent?.trim() || '')
    .filter(Boolean);
  const episodeIndex = paragraphs.findIndex(text => /^第\d+集[丨|｜]/.test(text));
  const captionEpisode = paragraphs[episodeIndex]?.match(/^第(\d+)集/)?.[1];
  if (path?.[2] && captionEpisode && Number(path[2]) !== Number(captionEpisode)) return null;
  const episode = path?.[2] || captionEpisode;
  const seriesTitle = episodeIndex > 0 ? paragraphs[episodeIndex - 1] : '';
  const title = seriesTitle || `黄豆短剧 ${path?.[1] || 'video'}`;
  return { pageUrl, videoUrl, title: episode ? `${title} 第${episode.padStart(2, '0')}集` : title };
}

/** Expose only the current public playback URL to the isolated extension content script. */
export function installHuangdouBridge(): void {
  document.addEventListener(HUANGDOU_REQUEST_EVENT, () => {
    const player = (window as Window & { GPPlayer?: { _slots?: HuangdouSlot[] } }).GPPlayer;
    const playback = readHuangdouPlayback(document, location.href, player?._slots || []);
    document.dispatchEvent(new CustomEvent(HUANGDOU_RESPONSE_EVENT, { detail: JSON.stringify(playback) }));
  });
}
