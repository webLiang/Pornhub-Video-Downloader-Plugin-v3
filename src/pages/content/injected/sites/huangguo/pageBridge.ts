import {
  HUANGGUO_REQUEST_EVENT,
  HUANGGUO_RESPONSE_EVENT,
  isHuangguoMediaId,
  readHuangguoPlayback,
  type HuangguoPlaybackMedia,
  type HuangguoPlaybackRequest,
  type HuangguoPlaybackResult,
} from './bridge';

const BRIDGE_FLAG = '__videoDownloaderHuangguoBridge';

/** Ask the page's encrypted fetch hook for the current episode playlist. */
export async function fetchHuangguoPlayback(id: string, episode: number): Promise<HuangguoPlaybackMedia | null> {
  const url = new URL(`/api/videos/${id}/episodes/${episode}/playback`, location.origin);
  const response = await fetch(url.href, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    console.warn('[huangguo] playback http status', response.status);
    return null;
  }
  return readHuangguoPlayback(await response.json(), id, episode);
}

/** Answer one isolated-world sniff with a fresh playback URL from the page context. */
export async function answerHuangguoPlayback(event: Event): Promise<void> {
  let request: HuangguoPlaybackRequest;
  try {
    request = JSON.parse((event as CustomEvent<string>).detail) as HuangguoPlaybackRequest;
  } catch (error) {
    console.warn('[huangguo] playback request parse failed', error);
    return;
  }
  if (!isPlaybackRequest(request)) return;
  let media: HuangguoPlaybackMedia | null = null;
  if (request.pageUrl === location.href) {
    try {
      media = await fetchHuangguoPlayback(request.id, request.episode);
    } catch (error) {
      console.warn('[huangguo] playback request failed', error);
    }
  }
  // A navigation during the request must still answer, or the sniff waits out the timeout.
  if (location.href !== request.pageUrl) media = null;
  const result: HuangguoPlaybackResult = {
    requestId: request.requestId,
    pageUrl: location.href,
    videoUrl: media?.videoUrl,
    headers: media?.headers,
  };
  document.dispatchEvent(new CustomEvent(HUANGGUO_RESPONSE_EVENT, { detail: JSON.stringify(result) }));
}

/** Install once in the MAIN world, where the site has already hooked fetch. */
export function installHuangguoBridge(): void {
  const host = window as Window & { [BRIDGE_FLAG]?: boolean };
  if (host[BRIDGE_FLAG]) return;
  host[BRIDGE_FLAG] = true;
  document.addEventListener(HUANGGUO_REQUEST_EVENT, event => {
    void answerHuangguoPlayback(event);
  });
}

/** Reject a payload that is not a playback sniff for one numeric episode. */
function isPlaybackRequest(value: HuangguoPlaybackRequest): boolean {
  return (
    !!value &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    typeof value.pageUrl === 'string' &&
    isHuangguoMediaId(value.id, 19) &&
    Number.isSafeInteger(value.episode) &&
    value.episode > 0 &&
    value.episode <= 2147483647
  );
}
