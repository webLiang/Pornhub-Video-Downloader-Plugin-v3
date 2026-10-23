import { describe, expect, it, vi } from 'vitest';
import { resolveAv123VideosFromEmbed, waitForJavplayerEmbed } from './resolveVideos';
import { getAv123Urls } from './getUrls';

vi.mock('./resolveVideos', () => ({
  buildAv123FileName: () => 'Example video',
  waitForJavplayerEmbed: vi.fn(),
  resolveAv123VideosFromEmbed: vi.fn(),
}));

describe('123av sniff retries', () => {
  it('returns an empty result on an API failure and allows the next sniff to recover', async () => {
    history.replaceState(null, '', '/en/v/example');
    const embed = {
      id: 'example',
      embedUrl: 'https://player.example/e/example',
      streamUrl: 'https://player.example/stream?id=example',
    };
    const videos = [
      { quality: '720p', videoUrl: 'https://cdn.example/video.m3u8', format: 'm3u8' as const, title: 'Example video' },
    ];
    vi.mocked(waitForJavplayerEmbed).mockResolvedValue(embed);
    vi.mocked(resolveAv123VideosFromEmbed)
      .mockRejectedValueOnce(new Error('temporary API failure'))
      .mockResolvedValueOnce(videos);
    expect(await getAv123Urls()).toEqual([]);
    expect(await getAv123Urls()).toEqual(videos);
    expect(resolveAv123VideosFromEmbed).toHaveBeenCalledTimes(2);
  });
});
