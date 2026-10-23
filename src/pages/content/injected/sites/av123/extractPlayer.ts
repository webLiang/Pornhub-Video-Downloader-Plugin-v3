/** Legacy player origin, retained for older 123av pages. */
export const JAVPLAYER_ORIGIN = 'https://javplayer.cc';

export type JavplayerEmbed = {
  id: string;
  embedUrl: string;
  streamUrl: string;
};

/**
 * Parse a player iframe URL without hard-coding the site's rotating embed domain.
 */
export function parseJavplayerEmbedId(input: string): string | null {
  try {
    const url = new URL(input);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.pathname.match(/^\/e\/([A-Za-z0-9_]+)\/?$/)?.[1] || null;
  } catch {
    return null;
  }
}

/**
 * Mirror the player's /stream request, preserving embed query parameters and its current origin.
 */
export function buildJavplayerStreamUrl(id: string, poster?: string, embedUrl = JAVPLAYER_ORIGIN): string {
  const url = new URL('/stream', embedUrl);
  new URL(embedUrl).searchParams.forEach((value, key) => url.searchParams.set(key, value));
  url.searchParams.set('id', id);
  if (poster) url.searchParams.set('poster', poster);
  return url.href;
}

/**
 * Read stream URL from javplayer /stream JSON: { status, media: { stream, vtt } }.
 */
export function parseJavplayerStreamJson(text: string): string | null {
  try {
    const data = JSON.parse(text) as {
      status?: string;
      media?: { stream?: string };
      stream?: string;
    };
    const stream = data?.media?.stream || data?.stream;
    if (typeof stream === 'string' && /\.m3u8(\?|$)/i.test(stream.trim())) {
      return stream.trim();
    }
  } catch {
    // not JSON — fall through to regex
  }
  const match = text.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
  return match?.[0] || null;
}

/**
 * Prefer the site's designated player frame; restrict legacy fallbacks to javplayer embeds.
 */
export function extractJavplayerEmbedFromDocument(doc: Document = document): JavplayerEmbed | null {
  const iframes = [
    ...doc.querySelectorAll<HTMLIFrameElement>('iframe.player__frame'),
    ...doc.querySelectorAll<HTMLIFrameElement>('iframe[src*="javplayer.cc"]'),
  ];
  for (const iframe of iframes) {
    const src = iframe.src || iframe.getAttribute('src') || '';
    const id = parseJavplayerEmbedId(src);
    if (!id) continue;
    return {
      id,
      embedUrl: src,
      streamUrl: buildJavplayerStreamUrl(id, undefined, src),
    };
  }

  const embedUrl = doc.documentElement?.innerHTML.match(/https?:\/\/javplayer\.cc\/e\/[^\s"'<>]+/i)?.[0];
  if (!embedUrl) return null;
  const htmlId = parseJavplayerEmbedId(embedUrl);
  if (!htmlId) return null;
  return {
    id: htmlId,
    embedUrl,
    streamUrl: buildJavplayerStreamUrl(htmlId, undefined, embedUrl),
  };
}
