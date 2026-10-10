import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeHuangdouMediaUrl } from './bridge';
import { getHuangdouUrls } from './getUrls';
import { installHuangdouBridge, readHuangdouPlayback } from './pageBridge';

const firstUrl = 'https://h5.example/api/drama/hls/example/1/play.m3u8?line=free&exp=123&sig=signed&uid=1';
const secondUrl = firstUrl.replace('/1/play', '/2/play');

/** Create a mounted video with the layout of a visible Flutter platform view. */
function makeVideo(left = 10): HTMLVideoElement {
  const video = document.createElement('video');
  video.id = '__global_video_player__';
  vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({
    width: 300,
    height: 500,
    top: 0,
    bottom: 500,
    left,
    right: left + 300,
  } as DOMRect);
  document.body.appendChild(video);
  return video;
}

/** Mount complete Flutter paragraphs, whose individual glyphs are split into spans in production. */
function mountTitle(episode: number): void {
  document.querySelector('flt-glass-pane')?.remove();
  const glass = document.createElement('flt-glass-pane');
  glass.attachShadow({ mode: 'open' }).innerHTML =
    `<flt-paragraph>Example series</flt-paragraph><flt-paragraph>第${episode}集丨Example description</flt-paragraph>`;
  document.body.appendChild(glass);
}

describe('Huangdou current playback bridge', () => {
  beforeAll(() => installHuangdouBridge());
  beforeEach(() => {
    document.body.innerHTML = '';
    mountTitle(1);
    Object.assign(window, { GPPlayer: { _slots: [] } });
  });

  it('returns only the visible current episode, excluding preloaded, pooled and released slots', () => {
    const playback = readHuangdouPlayback(document, location.href, [
      { source: secondUrl, video: makeVideo(), preloading: true },
      { source: secondUrl, video: makeVideo(-9999) },
      { source: secondUrl, video: makeVideo(), released: true },
      { source: firstUrl, video: makeVideo() },
    ]);
    expect(playback).toEqual({ pageUrl: location.href, videoUrl: firstUrl, title: 'Example series 第01集' });
  });

  it('refreshes the active source and filename after switching episodes without changing the page URL', async () => {
    const slot = { source: firstUrl, video: makeVideo() };
    Object.assign(window, { GPPlayer: { _slots: [slot] } });
    expect((await getHuangdouUrls())[0]).toMatchObject({
      videoUrl: firstUrl,
      title: 'Example series 第01集',
      format: 'm3u8',
    });
    slot.source = secondUrl;
    mountTitle(2);
    expect((await getHuangdouUrls())[0]).toMatchObject({ videoUrl: secondUrl, title: 'Example series 第02集' });
    slot.video.remove();
    expect(await getHuangdouUrls()).toEqual([]);
  });

  it('ignores hidden and invalid media instead of sniffing unrelated requests', () => {
    const video = makeVideo();
    video.style.display = 'none';
    expect(readHuangdouPlayback(document, location.href, [{ source: firstUrl, video }])).toBeNull();
    video.style.display = '';
    expect(readHuangdouPlayback(document, location.href, [{ source: 'blob:https://h5.example/id', video }])).toBeNull();
    expect(normalizeHuangdouMediaUrl('https://h5.example/js/hls.min.js')).toBeNull();
    expect(normalizeHuangdouMediaUrl('javascript:alert(1)')).toBeNull();
  });

  it('does not return the previous episode while a different episode is still loading or locked', () => {
    mountTitle(2);
    expect(readHuangdouPlayback(document, location.href, [{ source: firstUrl, video: makeVideo() }])).toBeNull();
  });

  it('settles with no result if the main-world bridge is unavailable', async () => {
    vi.useFakeTimers();
    const dispatch = vi.spyOn(document, 'dispatchEvent').mockReturnValue(true);
    try {
      const pending = getHuangdouUrls();
      await vi.advanceTimersByTimeAsync(1000);
      expect(await pending).toEqual([]);
    } finally {
      dispatch.mockRestore();
      vi.useRealTimers();
    }
  });
});
