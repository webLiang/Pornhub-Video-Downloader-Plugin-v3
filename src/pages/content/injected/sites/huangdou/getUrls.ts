import type { SiteVideoInfo } from '../types';
import { sanitizeFileName } from '../shared/dom';
import {
  HUANGDOU_REQUEST_EVENT,
  HUANGDOU_RESPONSE_EVENT,
  normalizeHuangdouMediaUrl,
  type HuangdouPlayback,
} from './bridge';

/** Ask the main-world bridge for a fresh active slot even when Flutter keeps the same page URL. */
export function getHuangdouUrls(): Promise<SiteVideoInfo[]> {
  const pageUrl = location.href;
  return new Promise(resolve => {
    const timeout = setTimeout(() => finish([]), 1000);
    /** Remove the response listener and deadline after each sniff. */
    function finish(videos: SiteVideoInfo[]): void {
      clearTimeout(timeout);
      document.removeEventListener(HUANGDOU_RESPONSE_EVENT, receive);
      resolve(videos);
    }
    /** Validate the untrusted page response before returning any downloadable media. */
    function receive(event: Event): void {
      try {
        const playback = JSON.parse((event as CustomEvent<string>).detail) as HuangdouPlayback | null;
        const videoUrl = normalizeHuangdouMediaUrl(playback?.videoUrl);
        if (!videoUrl || playback?.pageUrl !== pageUrl || location.href !== pageUrl) return finish([]);
        finish([
          {
            quality: 'default',
            videoUrl,
            format: /\.mp4(?:$|[?#])/i.test(videoUrl) ? 'mp4' : 'm3u8',
            title: sanitizeFileName(typeof playback.title === 'string' ? playback.title : document.title),
          },
        ]);
      } catch {
        finish([]);
      }
    }
    document.addEventListener(HUANGDOU_RESPONSE_EVENT, receive);
    document.dispatchEvent(new Event(HUANGDOU_REQUEST_EVENT));
  });
}
