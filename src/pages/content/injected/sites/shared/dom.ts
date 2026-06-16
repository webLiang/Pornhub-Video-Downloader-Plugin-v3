/** Wait until DOM is parsed (needed when content script runs at document_start) */
export function waitForDomReady(): Promise<void> {
  if (document.readyState !== 'loading') {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

/** Match document.title sanitization in hostMapGetUrls */
export function sanitizeFileName(raw: string): string {
  return raw.replace(/[\\\\/:*?\\"<>|.-]+/g, '').trim();
}

export function getPageTitleFallback(): string {
  return sanitizeFileName(document.title);
}
