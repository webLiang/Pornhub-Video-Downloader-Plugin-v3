type ExtFetchTextResponse = {
  ok?: boolean;
  status?: number;
  text?: string;
  error?: string;
};

/**
 * Fetch a URL from the extension service worker (bypasses page CORS).
 * Used for player APIs hosted on a different origin than the watch page.
 */
export async function fetchTextViaExtension(url: string, headers?: Record<string, string>): Promise<string> {
  const res = (await chrome.runtime.sendMessage({
    type: 'ext-fetch-text',
    url,
    headers,
  })) as ExtFetchTextResponse | undefined;

  if (!res?.ok || typeof res.text !== 'string') {
    throw new Error(res?.error || `ext-fetch-text failed (${res?.status ?? 'no response'})`);
  }
  return res.text;
}

/**
 * Prefer a same-tab fetch (cookies / CF already solved), then fall back to the SW.
 */
export async function fetchTextPreferPage(url: string, headers?: Record<string, string>): Promise<string> {
  try {
    const init: RequestInit = headers ? { headers } : {};
    const response = await fetch(url, init);
    if (response.ok) {
      return await response.text();
    }
    console.warn('[extFetch] page fetch not ok', response.status, url);
  } catch (error) {
    console.warn('[extFetch] page fetch failed, falling back to SW', error);
  }
  return fetchTextViaExtension(url, headers);
}
