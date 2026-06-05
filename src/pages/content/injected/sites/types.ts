/** popup / background 共用的嗅探结果结构 */
export interface SiteVideoInfo {
  quality: string;
  videoUrl: string;
  format: 'm3u8' | 'mp4' | 'webm';
  title: string;
}

export type SiteGetUrls = () => Promise<SiteVideoInfo[]>;
