import { describe, expect, it } from 'vitest';
import { extractRouvideoPlayback } from './extractPlayer';

const LIVE_EVENT =
  'r1aqnZiZo4mmoFZuVmOVpJ1jnKCnY5ehqaZqpm2rrGRkZGinamSnZKyjpKujm6BWYFaonKmhloqIiImmoFZuVmOVpJ1jnKCnY5ehqaZqpm2rrGRkZGinamSnZKyjpKujm6Bzn52imHGonKmhlqdWsQ==';

describe('rou.video playback extraction', () => {
  it('decodes the SSR playback payload', () => {
    const html = `<script>ev:$R[101]={d:"${LIVE_EVENT}",k:52}</script>`;
    expect(extractRouvideoPlayback(html)).toEqual({
      videoUrl: '/api/hls/cmur6r9wx0004s60s0xopwogl',
      thumbVTTUrl: '/api/hls/cmur6r9wx0004s60s0xopwogl?kind=thumbs',
    });
  });

  it('returns null when the page has no valid playback payload', () => {
    expect(extractRouvideoPlayback('<html>no player</html>')).toBeNull();
    expect(extractRouvideoPlayback('ev:$R[1]={d:"invalid",k:52}')).toBeNull();
  });
});
