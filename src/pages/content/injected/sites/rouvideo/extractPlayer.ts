export interface RouvideoPlayback {
  videoUrl: string;
  thumbVTTUrl?: string;
}

const EVENT_RE = /ev\s*:\s*\$R\[\d+\]\s*=\s*\{\s*d\s*:\s*["']([^"']+)["']\s*,\s*k\s*:\s*(\d+)/i;

function decodePlayback(encoded: string, key: number): RouvideoPlayback | null {
  try {
    const shifted = atob(encoded)
      .split('')
      .map(character => String.fromCharCode(character.charCodeAt(0) - key))
      .join('');
    const parsed = JSON.parse(shifted) as Partial<RouvideoPlayback>;
    if (typeof parsed.videoUrl !== 'string' || !parsed.videoUrl.trim()) return null;
    return {
      videoUrl: parsed.videoUrl.trim(),
      ...(typeof parsed.thumbVTTUrl === 'string' ? { thumbVTTUrl: parsed.thumbVTTUrl.trim() } : {}),
    };
  } catch {
    return null;
  }
}

export function extractRouvideoPlayback(html: string): RouvideoPlayback | null {
  const match = html.match(EVENT_RE);
  if (!match) return null;
  return decodePlayback(match[1], Number(match[2]));
}
