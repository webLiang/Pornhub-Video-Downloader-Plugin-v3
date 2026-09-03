/** javplayer.cc embed used by 123av.com watch pages. */
export const JAVPLAYER_ORIGIN = 'https://javplayer.cc';

/** CDN fetches 403 without the player origin as Referer. */
export const JAVPLAYER_DOWNLOAD_HEADERS: Record<string, string> = {
  Origin: JAVPLAYER_ORIGIN,
  Referer: `${JAVPLAYER_ORIGIN}/`,
};

const EMBED_ID_RE = /javplayer\.cc\/e\/([A-Za-z0-9]+)/i;

export type JavplayerEmbed = {
  id: string;
  embedUrl: string;
  streamUrl: string;
};

/**
 * Parse a javplayer embed id from an iframe src or page HTML.
 */
export function parseJavplayerEmbedId(input: string): string | null {
  const match = input.match(EMBED_ID_RE);
  return match?.[1] || null;
}

/**
 * Build the JSON stream endpoint observed as GET /stream?id={id}.
 */
export function buildJavplayerStreamUrl(id: string, poster?: string): string {
  const url = new URL(`${JAVPLAYER_ORIGIN}/stream`);
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
 * Find the 123av player iframe (class player__frame) or any javplayer.cc embed.
 */
export function extractJavplayerEmbedFromDocument(doc: Document = document): JavplayerEmbed | null {
  const iframes = [
    ...doc.querySelectorAll<HTMLIFrameElement>('iframe.player__frame, iframe[src*="javplayer.cc"]'),
  ];
  for (const iframe of iframes) {
    const src = iframe.src || iframe.getAttribute('src') || '';
    const id = parseJavplayerEmbedId(src);
    if (!id) continue;
    let poster: string | undefined;
    try {
      poster = new URL(src).searchParams.get('poster') || undefined;
    } catch {
      poster = undefined;
    }
    return {
      id,
      embedUrl: src,
      streamUrl: buildJavplayerStreamUrl(id, poster),
    };
  }

  const htmlId = parseJavplayerEmbedId(doc.documentElement?.innerHTML || '');
  if (!htmlId) return null;
  const embedUrl = `${JAVPLAYER_ORIGIN}/e/${htmlId}`;
  return {
    id: htmlId,
    embedUrl,
    streamUrl: buildJavplayerStreamUrl(htmlId),
  };
}
