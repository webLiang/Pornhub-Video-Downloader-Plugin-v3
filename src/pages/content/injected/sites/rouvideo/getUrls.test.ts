import { describe, expect, it } from 'vitest';
import { buildRouvideoPlaybackUrl } from './getUrls';

describe('rou.video playback URL', () => {
  it('builds the API playback URL from a video page path', () => {
    expect(buildRouvideoPlaybackUrl('/v/cmur6r9wx0004s60s0xopwogl', 'https://rou.video')).toBe(
      'https://rou.video/api/hls/cmur6r9wx0004s60s0xopwogl',
    );
  });

  it('accepts a trailing slash and encodes the video id', () => {
    expect(buildRouvideoPlaybackUrl('/v/video id/', 'https://rou.video')).toBe('https://rou.video/api/hls/video%20id');
  });

  it('rejects non-video paths', () => {
    expect(buildRouvideoPlaybackUrl('/api/hls/video-id', 'https://rou.video')).toBeNull();
    expect(buildRouvideoPlaybackUrl('/v/video-id/extra', 'https://rou.video')).toBeNull();
  });
});
