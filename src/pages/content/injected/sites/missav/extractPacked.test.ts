import { describe, expect, it } from 'vitest';
import {
  buildSurritQualityUrls,
  extractPackedQualityLabels,
  extractSurritPlaylistFromPackedHtml,
  uuidFromPackedHexParts,
  uuidFromSurritPlaylistUrl,
} from './extractPacked';

/** Live packed fragment captured from https://missav.live/mive-001 */
const LIVE_PACKED =
  "m3u8|2bed68c3749a|81e6|4a6a|e051|5163478c|com|surrit|https|video|1080p|source1280|720p|source842|playlist|source";

describe('missav packed HLS extraction', () => {
  it('reverses packed hex fragments into a UUID', () => {
    expect(uuidFromPackedHexParts('2bed68c3749a|81e6|4a6a|e051|5163478c')).toBe(
      '5163478c-e051-4a6a-81e6-2bed68c3749a',
    );
  });

  it('builds surrit master playlist from packed HTML', () => {
    const html = `<script>eval(function(p,a,c,k,e,d){})('${LIVE_PACKED}')</script>`;
    expect(extractSurritPlaylistFromPackedHtml(html)).toBe(
      'https://surrit.com/5163478c-e051-4a6a-81e6-2bed68c3749a/playlist.m3u8',
    );
  });

  it('prefers an explicit surrit playlist URL when present', () => {
    const html =
      'ignore packed ' +
      LIVE_PACKED +
      ' and use https://surrit.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/playlist.m3u8';
    expect(extractSurritPlaylistFromPackedHtml(html)).toBe(
      'https://surrit.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/playlist.m3u8',
    );
  });

  it('returns null when the page has no player payload', () => {
    expect(extractSurritPlaylistFromPackedHtml('<html>no player</html>')).toBeNull();
  });

  it('reads quality labels from the packed source list', () => {
    expect(extractPackedQualityLabels(LIVE_PACKED)).toEqual(['1080p', '720p']);
  });

  it('builds media playlist URLs from uuid + qualities', () => {
    expect(buildSurritQualityUrls('5163478c-e051-4a6a-81e6-2bed68c3749a', ['1080p', '720p'])).toEqual([
      'https://surrit.com/5163478c-e051-4a6a-81e6-2bed68c3749a/1080p/video.m3u8',
      'https://surrit.com/5163478c-e051-4a6a-81e6-2bed68c3749a/720p/video.m3u8',
    ]);
  });

  it('parses uuid from a surrit playlist URL', () => {
    expect(
      uuidFromSurritPlaylistUrl('https://surrit.com/5163478c-e051-4a6a-81e6-2bed68c3749a/playlist.m3u8'),
    ).toBe('5163478c-e051-4a6a-81e6-2bed68c3749a');
  });
});
