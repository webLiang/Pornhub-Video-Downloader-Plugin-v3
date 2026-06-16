import { normalizeM3u8Url } from './m3u8';

export type VideoObjectLdJson = {
  name?: string;
  contentUrl?: string;
  creator?: { name?: string };
};

function isSchemaVideoObject(obj: Record<string, unknown>): boolean {
  const schemaType = obj['@type'];
  if (typeof schemaType === 'string') {
    return schemaType === 'VideoObject';
  }
  if (Array.isArray(schemaType)) {
    return schemaType.includes('VideoObject');
  }
  return false;
}

/** Read schema.org VideoObject from application/ld+json */
export function parseVideoObjectLdJson(): VideoObjectLdJson | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    const text = script.textContent?.trim();
    if (!text) continue;
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      const candidates: unknown[] = [];
      if (Array.isArray(data)) {
        candidates.push(...data);
      } else {
        candidates.push(data);
        const graph = data['@graph'];
        if (Array.isArray(graph)) {
          candidates.push(...graph);
        }
      }
      for (const item of candidates) {
        const obj = item as VideoObjectLdJson & Record<string, unknown>;
        if (isSchemaVideoObject(obj) && obj.contentUrl) {
          return obj;
        }
      }
    } catch {
      // ignore invalid JSON blocks
    }
  }
  return null;
}

export function getM3u8FromVideoObjectLdJson(): string | null {
  return normalizeM3u8Url(parseVideoObjectLdJson()?.contentUrl);
}
