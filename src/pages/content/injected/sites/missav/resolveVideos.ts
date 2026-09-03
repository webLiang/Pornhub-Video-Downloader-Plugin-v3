import { getPageTitleFallback, sanitizeFileName } from '../shared/dom';
import type { SiteVideoInfo } from '../types';
import { fetchTextPreferPage } from '../shared/extFetch';
import { variantsToSiteVideos } from '../shared/hlsMaster';
import {
  buildSurritQualityUrls,
  extractPackedQualityLabels,
  extractSurritPlaylistFromPackedHtml,
  uuidFromSurritPlaylistUrl,
} from './extractPacked';

/** Build a filesystem-safe title from the MissAV watch page. */
export function buildMissavFileName(): string {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim();
  const h1 = document.querySelector('h1')?.textContent?.trim();
  return sanitizeFileName(og || h1 || getPageTitleFallback()) || getPageTitleFallback();
}

/**
 * Expand a surrit master playlist into quality rows.
 * Falls back to packed 1080p/720p media URLs when the CDN fetch fails.
 */
export async function resolveMissavVideosFromHtml(html: string, title: string): Promise<SiteVideoInfo[]> {
  const masterUrl = extractSurritPlaylistFromPackedHtml(html);
  if (!masterUrl) return [];

  try {
    const text = await fetchTextPreferPage(masterUrl);
    const items = variantsToSiteVideos(masterUrl, text, title);
    if (items.length) return items;
  } catch (error) {
    console.warn('[missav] master playlist fetch failed, using packed qualities', error);
  }

  const uuid = uuidFromSurritPlaylistUrl(masterUrl);
  const qualities = extractPackedQualityLabels(html);
  if (uuid && qualities.length) {
    return buildSurritQualityUrls(uuid, qualities).map((videoUrl, index) => ({
      quality: qualities[index],
      videoUrl,
      format: 'm3u8' as const,
      title,
    }));
  }

  return [
    {
      quality: 'default',
      videoUrl: masterUrl,
      format: 'm3u8',
      title,
    },
  ];
}
