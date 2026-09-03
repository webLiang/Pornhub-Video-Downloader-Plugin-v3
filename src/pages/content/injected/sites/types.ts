/** Sniff result shape shared by popup and background */
export interface SiteVideoInfo {
  quality: string;
  videoUrl: string;
  format: 'm3u8' | 'mp4' | 'webm';
  title: string;
  /**
   * Optional Origin/Referer overrides for CDN fetches.
   * Merged on top of popup headers built from the tab URL.
   */
  headers?: Record<string, string>;
}

export type SiteGetUrls = () => Promise<SiteVideoInfo[]>;
