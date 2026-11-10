import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { siteHostGetUrls } from '../index';
import { readHuangguoPlayback } from './bridge';
import domains from './domains.json';
import { getHuangguoUrls } from './getUrls';
import { installHuangguoBridge } from './pageBridge';

const firstUrl = 'https://cdn.example/first.m3u8?auth_key=old&via=hgdj';
const secondUrl = 'https://cdn.example/second.m3u8?auth_key=fresh&via=hgdj';
const cdn = { m3u8Enabled: true, otherEnabled: false, authKey: 'x-cdn-auth', authValue: 'abc', app: '150' };
const fetchMock = vi.fn();

/** Mount the watch-page JSON the episode label still comes from. */
function mountInitial(): void {
  document.body.innerHTML = '<script id="videoInitialData" type="application/json"></script>';
  document.getElementById('videoInitialData').textContent = JSON.stringify({
    id: '8248',
    title: 'Example series',
    ep: 1,
  });
}

/** Playback JSON for one episode, with the CDN header the player sends on playlists. */
function playbackBody(videoUrl: string, episode = 1) {
  return {
    status: 1,
    data: {
      manifest_method: 'GET',
      id: '8248',
      ep: episode,
      streams: { main: videoUrl },
      cdn,
    },
  };
}

describe('Huangguo episode sniffing', () => {
  beforeAll(() => installHuangguoBridge());

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    history.replaceState(null, '', '/video/8248/');
    mountInitial();
  });

  it('registers watch domains without treating pages.dev as one site', () => {
    expect(domains).toEqual(['huangguoai.com', 'huangguoai.io', 'adihsppe.cc']);
    for (const domain of domains) {
      expect(siteHostGetUrls[domain]?.getUrls).toBe(getHuangguoUrls);
    }
    expect(siteHostGetUrls['pages.dev']).toBeUndefined();
    expect(siteHostGetUrls['hgai12.com']).toBeUndefined();
    const manifest = readFileSync('manifest.js', 'utf8');
    expect(manifest).toContain('registrableHostMatches(huangguoDomains)');
    expect(manifest).toContain('https://${domain}/*');
    expect(manifest).toContain('https://*.${domain}/*');
  });

  it('refreshes the signed playlist on every sniff', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => playbackBody(firstUrl) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => playbackBody(secondUrl) });
    expect(await getHuangguoUrls()).toEqual([
      {
        quality: 'default',
        videoUrl: firstUrl,
        format: 'm3u8',
        title: 'Example series 第01集',
        headers: { 'x-cdn-auth': 'abc', 'x-cdn-app': '150' },
      },
    ]);
    expect((await getHuangguoUrls())[0].videoUrl).toBe(secondUrl);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${location.origin}/api/videos/8248/episodes/1/playback`,
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('reads the active episode after in-place switching even if the URL has not changed yet', async () => {
    document.body.insertAdjacentHTML('beforeend', '<a class="hg-web-play__ep is-active" data-ep-id="2"></a>');
    fetchMock.mockResolvedValue({ ok: true, json: async () => playbackBody(secondUrl, 2) });
    expect((await getHuangguoUrls())[0]).toMatchObject({ videoUrl: secondUrl, title: 'Example series 第02集' });
    expect(fetchMock).toHaveBeenCalledWith(`${location.origin}/api/videos/8248/episodes/2/playback`, expect.anything());
  });

  it('does not use empty SSR media when playback is denied or returns another episode', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 403, data: { streams: { main: firstUrl } } }),
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => playbackBody(firstUrl, 2) });
    expect(await getHuangguoUrls()).toEqual([]);
    expect(await getHuangguoUrls()).toEqual([]);
  });

  it('discards a response if the selected episode changes while fetching', async () => {
    fetchMock.mockImplementation(async () => {
      history.replaceState(null, '', '/video/8248/ep-2/');
      return { ok: true, json: async () => playbackBody(firstUrl, 1) };
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
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => playbackBody('javascript:alert(1)'),
    });
    expect(await getHuangguoUrls()).toEqual([]);
    expect(readHuangguoPlayback({ status: 1, data: { manifest_method: 'POST', id: '1', ep: 1 } }, '1', 1)).toBeNull();
  });
});
