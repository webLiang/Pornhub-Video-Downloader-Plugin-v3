import { describe, expect, it } from 'vitest';
import { parseHlsMasterVariants, variantsToSiteVideos } from './hlsMaster';

const MISSAV_MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=953332,RESOLUTION=640x360
360p/video.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3910249,RESOLUTION=1920x1080
1080p/video.m3u8
`;

const AV123_MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=2816000,RESOLUTION=406x720
qc/v.m3u8
`;

describe('parseHlsMasterVariants', () => {
  it('expands MissAV relative quality playlists', () => {
    const master = 'https://surrit.com/5163478c-e051-4a6a-81e6-2bed68c3749a/playlist.m3u8';
    expect(parseHlsMasterVariants(MISSAV_MASTER, master)).toEqual([
      {
        quality: '360p',
        url: 'https://surrit.com/5163478c-e051-4a6a-81e6-2bed68c3749a/360p/video.m3u8',
      },
      {
        quality: '1080p',
        url: 'https://surrit.com/5163478c-e051-4a6a-81e6-2bed68c3749a/1080p/video.m3u8',
      },
    ]);
  });

  it('expands 123av wowstream relative media playlist', () => {
    const master =
      'https://cache-xx29.wowstream2.cloud/blah4/token/video.m3u8?v=a2';
    expect(parseHlsMasterVariants(AV123_MASTER, master)).toEqual([
      {
        quality: '720p',
        url: 'https://cache-xx29.wowstream2.cloud/blah4/token/qc/v.m3u8',
      },
    ]);
  });

  it('returns empty for a media playlist', () => {
    expect(parseHlsMasterVariants('#EXTM3U\n#EXTINF:4,\nvideo0.jpeg\n', 'https://x/a.m3u8')).toEqual([]);
  });
});

describe('variantsToSiteVideos', () => {
  it('falls back to the master URL when there are no variants', () => {
    const items = variantsToSiteVideos('https://cdn.example/video.m3u8', '#EXTM3U\n#EXTINF:1,\na.ts\n', 'title');
    expect(items).toEqual([
      {
        quality: 'default',
        videoUrl: 'https://cdn.example/video.m3u8',
        format: 'm3u8',
        title: 'title',
      },
    ]);
  });

  it('attaches optional download headers', () => {
    const headers = { Origin: 'https://javplayer.cc', Referer: 'https://javplayer.cc/' };
    const items = variantsToSiteVideos(
      'https://cdn.example/video.m3u8',
      AV123_MASTER,
      'title',
      { headers },
    );
    expect(items[0].headers).toEqual(headers);
    expect(items[0].quality).toBe('720p');
  });
});
