import type { SiteVideoInfo } from '../types';
import { createCachedGetter } from '../shared/createCachedGetter';
import { waitForDomReady } from '../shared/dom';
import { buildAv123FileName, resolveAv123VideosFromEmbed, waitForJavplayerEmbed } from './resolveVideos';

/**
 * Sniff 123av.com watch pages: javplayer iframe → /stream JSON → wowstream HLS.
 */
async function resolveAv123Urls(): Promise<SiteVideoInfo[]> {
  await waitForDomReady();
  // Listing / search pages have no player iframe; skip the embed poll.
  if (!/\/v\/[^/]+/i.test(location.pathname)) {
    return [];
  }
  const embed = await waitForJavplayerEmbed();
  if (!embed) {
    console.warn('[123av] javplayer embed not found on page');
    return [];
  }
  return resolveAv123VideosFromEmbed(embed, buildAv123FileName());
}

export const getAv123Urls = createCachedGetter(resolveAv123Urls);
