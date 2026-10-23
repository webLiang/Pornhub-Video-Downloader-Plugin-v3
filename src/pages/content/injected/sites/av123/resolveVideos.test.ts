import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTextViaExtension } from '../shared/extFetch';
import { resolveAv123VideosFromEmbed } from './resolveVideos';

vi.mock('../shared/extFetch', () => ({ fetchTextViaExtension: vi.fn(), fetchTextPreferPage: vi.fn() }));
const fetchText = vi.mocked(fetchTextViaExtension);
const embed = {
  id: '1RW9XD',
  embedUrl: 'https://sadie-shop.site/e/1RW9XD?token=a%2Bb',
  streamUrl: 'https://sadie-shop.site/stream?token=a%2Bb&id=1RW9XD',
};
const masterUrl = 'https://media.example/signed+path/video.m3u8';
const headers = { Origin: 'https://sadie-shop.site', Referer: 'https://sadie-shop.site/' };

describe('123av current player resolution', () => {
  beforeEach(() => vi.resetAllMocks());

  it('fetches both endpoints through the extension and carries the actual player headers into downloads', async () => {
    fetchText.mockResolvedValueOnce(JSON.stringify({ status: 'ok', media: { stream: masterUrl } }));
    fetchText.mockResolvedValueOnce('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2816000,RESOLUTION=1280x720\nqc/v.m3u8\n');
    expect(await resolveAv123VideosFromEmbed(embed, 'Example video')).toEqual([
      {
        quality: '720p',
        videoUrl: 'https://media.example/signed+path/qc/v.m3u8',
        format: 'm3u8',
        title: 'Example video',
        headers,
      },
    ]);
    expect(fetchText).toHaveBeenNthCalledWith(1, embed.streamUrl, {
      Origin: headers.Origin,
      Referer: embed.embedUrl,
      Accept: 'application/json,*/*',
    });
    expect(fetchText).toHaveBeenNthCalledWith(2, masterUrl, headers);
  });

  it('retains the correct headers when master expansion fails', async () => {
    fetchText.mockResolvedValueOnce(JSON.stringify({ media: { stream: masterUrl } }));
    fetchText.mockRejectedValueOnce(new Error('temporary CDN error'));
    expect(await resolveAv123VideosFromEmbed(embed, 'Example video')).toEqual([
      { quality: 'default', videoUrl: masterUrl, format: 'm3u8', title: 'Example video', headers },
    ]);
  });
});
