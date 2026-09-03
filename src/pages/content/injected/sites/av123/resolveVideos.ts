import { getPageTitleFallback, sanitizeFileName } from '../shared/dom';
import type { SiteVideoInfo } from '../types';
import { fetchTextPreferPage, fetchTextViaExtension } from '../shared/extFetch';
import { variantsToSiteVideos } from '../shared/hlsMaster';
import {
  extractJavplayerEmbedFromDocument,
  JAVPLAYER_DOWNLOAD_HEADERS,
  parseJavplayerStreamJson,
  type JavplayerEmbed,
} from './extractPlayer';

const IFRAME_WAIT_MS = 8000;
const IFRAME_POLL_MS = 250;

/** Poll until the javplayer iframe is in the DOM (player hydrates after first paint). */
export async function waitForJavplayerEmbed(timeoutMs = IFRAME_WAIT_MS): Promise<JavplayerEmbed | null> {
  const deadline = Date.now() + timeoutMs;
  let embed = extractJavplayerEmbedFromDocument();
  while (!embed && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, IFRAME_POLL_MS));
    embed = extractJavplayerEmbedFromDocument();
  }
  return embed;
}

/** Build a filesystem-safe title from the 123av watch page. */
export function buildAv123FileName(): string {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim();
  const h1 = document.querySelector('h1, main h1')?.textContent?.trim();
  return sanitizeFileName(og || h1 || getPageTitleFallback()) || getPageTitleFallback();
}

/**
 * Resolve 123av watch-page HLS via javplayer.cc/stream JSON, then expand the master playlist.
 */
export async function resolveAv123VideosFromEmbed(
  embed: JavplayerEmbed,
  title: string,
): Promise<SiteVideoInfo[]> {
  const streamJson = await fetchTextViaExtension(embed.streamUrl, {
    Referer: embed.embedUrl || `${embed.streamUrl}`,
    Origin: JAVPLAYER_DOWNLOAD_HEADERS.Origin,
    Accept: 'application/json,*/*',
  });
  const masterUrl = parseJavplayerStreamJson(streamJson);
  if (!masterUrl) {
    console.warn('[123av] javplayer stream JSON had no m3u8');
    return [];
  }

  let playlistText = '';
  try {
    playlistText = await fetchTextPreferPage(masterUrl, JAVPLAYER_DOWNLOAD_HEADERS);
  } catch (error) {
    console.warn('[123av] master playlist fetch failed, using stream URL as-is', error);
  }

  const items = variantsToSiteVideos(masterUrl, playlistText, title, {
    headers: JAVPLAYER_DOWNLOAD_HEADERS,
  });
  return items;
}
