import type { SiteVideoInfo } from '../types';
import { createCachedGetter } from '../shared/createCachedGetter';
import { waitForDomReady } from '../shared/dom';
import { buildAv123FileName, resolveAv123VideosFromEmbed, waitForJavplayerEmbed } from './resolveVideos';

/**
 * Sniff 123av.com watch pages through the current player iframe and its /stream endpoint.
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
  try {
    return await resolveAv123VideosFromEmbed(embed, buildAv123FileName());
  } catch (error) {
    console.warn('[123av] player resolution failed, retry on the next sniff', error);
    return [];
  }
}

export const getAv123Urls = createCachedGetter(resolveAv123Urls);
