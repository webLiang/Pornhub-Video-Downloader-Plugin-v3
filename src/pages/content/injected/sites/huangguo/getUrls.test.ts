import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTextPreferPage } from '../shared/extFetch';
import { getHuangguoUrls } from './getUrls';

vi.mock('../shared/extFetch', () => ({ fetchTextPreferPage: vi.fn() }));
const fetchText = vi.mocked(fetchTextPreferPage);
const firstUrl = 'https://cdn.example/first.m3u8?auth_key=old&via=hgdj';
const secondUrl = 'https://cdn.example/second.m3u8?auth_key=fresh&via=hgdj';

/** Mount sanitized SSR playback data without any unrelated recommendation sources. */
function mountInitial(): void {
  document.body.innerHTML = '<script id="videoInitialData" type="application/json"></script>';
  document.getElementById('videoInitialData').textContent = JSON.stringify({
    id: '8248',
    title: 'Example series',
    ep: 1,
    videoSrc: firstUrl,
    epPlaySrcs: { '2': secondUrl },
  });
}

describe('Huangguo episode sniffing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    history.replaceState(null, '', '/video/8248/');
    mountInitial();
  });

  it('refreshes signed URLs on every sniff instead of retaining an expired result', async () => {
    fetchText.mockResolvedValueOnce(JSON.stringify({ status: 1, data: { video_url: firstUrl, ep_num: 1 } }));
    fetchText.mockResolvedValueOnce(JSON.stringify({ status: 1, data: { video_url: secondUrl, ep_num: 1 } }));
    expect((await getHuangguoUrls())[0].videoUrl).toBe(firstUrl);
    expect((await getHuangguoUrls())[0].videoUrl).toBe(secondUrl);
    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it('reads the active episode after in-place switching even if the URL has not changed yet', async () => {
    document.body.insertAdjacentHTML('beforeend', '<a class="hg-web-play__ep is-active" data-ep-id="2"></a>');
    fetchText.mockResolvedValue(JSON.stringify({ status: 1, data: { video_url: secondUrl, ep_num: 2 } }));
    expect(await getHuangguoUrls()).toEqual([
      { quality: 'default', videoUrl: secondUrl, format: 'm3u8', title: 'Example series 第02集' },
    ]);
    expect(fetchText).toHaveBeenCalledWith(`${location.origin}/api/videos/8248/play?ep=2`);
  });

  it('uses the matching SSR episode when the fresh endpoint cannot be reached', async () => {
    history.replaceState(null, '', '/video/8248/ep-2/');
    fetchText.mockRejectedValue(new Error('offline'));
    expect((await getHuangguoUrls())[0].videoUrl).toBe(secondUrl);
    history.replaceState(null, '', '/video/8248/ep-3/');
    expect(await getHuangguoUrls()).toEqual([]);
  });

  it('does not fall back to old playback data after access is denied or another episode is returned', async () => {
    fetchText.mockResolvedValueOnce(JSON.stringify({ code: 403, data: { video_url: firstUrl } }));
    fetchText.mockResolvedValueOnce(JSON.stringify({ status: 1, data: { video_url: firstUrl, ep_num: 2 } }));
    expect(await getHuangguoUrls()).toEqual([]);
    expect(await getHuangguoUrls()).toEqual([]);
  });

  it('discards a response if the selected episode changes while fetching', async () => {
    fetchText.mockImplementation(async () => {
      history.replaceState(null, '', '/video/8248/ep-2/');
      return JSON.stringify({ status: 1, data: { video_url: firstUrl, ep_num: 1 } });
    });
    expect(await getHuangguoUrls()).toEqual([]);
  });

  it('rejects unrelated pages, malformed data, and non-media URLs', async () => {
    history.replaceState(null, '', '/');
    expect(await getHuangguoUrls()).toEqual([]);
    history.replaceState(null, '', '/video/8248/');
    document.getElementById('videoInitialData').textContent = 'null';
    expect(await getHuangguoUrls()).toEqual([]);
    mountInitial();
    fetchText.mockResolvedValue(JSON.stringify({ status: 1, data: { video_url: 'javascript:alert(1)' } }));
    expect(await getHuangguoUrls()).toEqual([]);
  });
});
