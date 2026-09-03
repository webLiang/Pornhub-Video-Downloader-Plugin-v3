import { describe, expect, it } from 'vitest';
import {
  buildJavplayerStreamUrl,
  parseJavplayerEmbedId,
  parseJavplayerStreamJson,
  extractJavplayerEmbedFromDocument,
} from './extractPlayer';

describe('123av javplayer embed extraction', () => {
  it('parses embed id from iframe src', () => {
    expect(
      parseJavplayerEmbedId(
        'https://javplayer.cc/e/55MMJZ?poster=https://icdn.123av.me/img2/s500/db/mive-001/cover.jpg',
      ),
    ).toBe('55MMJZ');
  });

  it('builds /stream?id= with optional poster', () => {
    expect(buildJavplayerStreamUrl('55MMJZ')).toBe('https://javplayer.cc/stream?id=55MMJZ');
    expect(buildJavplayerStreamUrl('55MMJZ', 'https://cdn.example/cover.jpg')).toBe(
      'https://javplayer.cc/stream?id=55MMJZ&poster=https%3A%2F%2Fcdn.example%2Fcover.jpg',
    );
  });

  it('parses live /stream JSON', () => {
    const json = JSON.stringify({
      status: 'ok',
      media: {
        stream: 'https://cache-xx29.wowstream2.cloud/blah4/token/video.m3u8?v=a2',
        vtt: 'https://cache-xx29.wowstream2.cloud/blah4/token/preview.vtt',
      },
    });
    expect(parseJavplayerStreamJson(json)).toBe(
      'https://cache-xx29.wowstream2.cloud/blah4/token/video.m3u8?v=a2',
    );
  });

  it('returns null for non-stream JSON', () => {
    expect(parseJavplayerStreamJson('{"status":"ok"}')).toBeNull();
    expect(parseJavplayerStreamJson('not-json')).toBeNull();
  });

  it('finds iframe.player__frame in a document', () => {
    document.body.innerHTML = `
      <iframe class="player__frame" src="https://javplayer.cc/e/55MMJZ?poster=https://cdn.example/a.jpg"></iframe>
    `;
    const embed = extractJavplayerEmbedFromDocument(document);
    expect(embed?.id).toBe('55MMJZ');
    expect(embed?.streamUrl).toContain('id=55MMJZ');
    expect(embed?.streamUrl).toContain('poster=');
  });
});
