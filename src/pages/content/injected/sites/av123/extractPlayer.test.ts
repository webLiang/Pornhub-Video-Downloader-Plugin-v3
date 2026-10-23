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
    expect(parseJavplayerStreamJson(json)).toBe('https://cache-xx29.wowstream2.cloud/blah4/token/video.m3u8?v=a2');
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

  it('uses the current player origin and preserves its query parameters', () => {
    document.body.innerHTML = `
      <iframe src="https://ads.example/e/advertisement"></iframe>
      <iframe class="player__frame" src="https://sadie-shop.site/e/1RW9XD?poster=https%3A%2F%2Fcdn.example%2Fa.jpg&amp;token=a%2Bb&amp;id=stale"></iframe>
    `;
    const embed = extractJavplayerEmbedFromDocument(document);
    expect(embed?.id).toBe('1RW9XD');
    const stream = new URL(embed.streamUrl);
    expect(stream.origin).toBe('https://sadie-shop.site');
    expect(stream.pathname).toBe('/stream');
    expect(stream.searchParams.get('id')).toBe('1RW9XD');
    expect(stream.searchParams.get('poster')).toBe('https://cdn.example/a.jpg');
    expect(stream.searchParams.get('token')).toBe('a+b');
  });

  it('accepts underscore IDs used by the current player without truncating them', () => {
    expect(parseJavplayerEmbedId('https://sadie-shop.site/e/ABC_123')).toBe('ABC_123');
    expect(parseJavplayerEmbedId('https://sadie-shop.site/e/ABC_123/extra')).toBeNull();
    expect(parseJavplayerEmbedId('javascript:alert(1)')).toBeNull();
  });

  it('ignores unrelated frames and retries when the player has not hydrated', () => {
    document.body.innerHTML =
      '<iframe src="https://ads.example/e/advertisement"></iframe><iframe class="player__frame" src="about:blank"></iframe>';
    expect(extractJavplayerEmbedFromDocument(document)).toBeNull();
  });

  it('keeps legacy inline embed URLs and their poster parameters', () => {
    document.body.innerHTML =
      '<script type="application/json">{"player":"https://javplayer.cc/e/55MMJZ?poster=cover.jpg"}</script>';
    const embed = extractJavplayerEmbedFromDocument(document);
    expect(embed?.id).toBe('55MMJZ');
    expect(new URL(embed.streamUrl).searchParams.get('poster')).toBe('cover.jpg');
  });
});
