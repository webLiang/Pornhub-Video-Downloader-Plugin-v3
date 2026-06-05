import { getM3u8FromVideoObjectLdJson } from '../shared/ldJson';
import { M3U8_URL_IN_TEXT_RE, normalizeM3u8Url } from '../shared/m3u8';

/**
 * tangxinvlog.app 播放页 m3u8 提取（Astro SSR）：
 * JSON-LD → #player → 内联 bootstrap → og:image → /v/{id}/
 */
export function extractTangxinM3u8Url(): string | null {
  const fromLd = getM3u8FromVideoObjectLdJson();
  if (fromLd) return fromLd;

  const player = document.querySelector<HTMLVideoElement>('video#player, #player');
  const fromPlayer = normalizeM3u8Url(player?.currentSrc || player?.src);
  if (fromPlayer) return fromPlayer;

  const sourceEl = document.querySelector<HTMLSourceElement>('video#player source[src], #player source[src]');
  const fromSource = normalizeM3u8Url(sourceEl?.src);
  if (fromSource) return fromSource;

  for (const script of document.scripts) {
    const text = script.textContent || '';
    if (!text.includes('.m3u8')) continue;

    const assignMatch = text.match(/(?:const|let|var)\s+m3u8\s*=\s*["']([^"']+\.m3u8[^"']*)["']/i);
    if (assignMatch?.[1]) {
      const fromInline = normalizeM3u8Url(assignMatch[1]);
      if (fromInline) return fromInline;
    }

    const anyMatch = text.match(M3U8_URL_IN_TEXT_RE);
    if (anyMatch?.[0]) {
      const fromText = normalizeM3u8Url(anyMatch[0]);
      if (fromText) return fromText;
    }
  }

  const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content?.trim();
  if (ogImage) {
    const coverMatch = ogImage.match(/^(https?:\/\/[^/]+\/videos\/\d+)\/cover\.jpg/i);
    if (coverMatch?.[1]) {
      return `${coverMatch[1]}/index.m3u8`;
    }
  }

  const pathMatch = location.pathname.match(/\/v\/(\d+)\/?/i);
  if (pathMatch?.[1] && ogImage) {
    const cdnOrigin = ogImage.match(/^(https?:\/\/[^/]+)/)?.[1];
    if (cdnOrigin) {
      return `${cdnOrigin}/videos/${pathMatch[1]}/index.m3u8`;
    }
  }

  return null;
}
