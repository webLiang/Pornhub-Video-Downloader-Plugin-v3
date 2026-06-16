/** Sniff result shape shared by popup and background */
export interface SiteVideoInfo {
  quality: string;
  videoUrl: string;
  format: 'm3u8' | 'mp4' | 'webm';
  title: string;
}

export type SiteGetUrls = () => Promise<SiteVideoInfo[]>;
