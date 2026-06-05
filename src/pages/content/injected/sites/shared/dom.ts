/** 等待 DOM 解析完成（content script 在 document_start 注入时需要） */
export function waitForDomReady(): Promise<void> {
  if (document.readyState !== 'loading') {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

/** 与 hostMapGetUrls 里 document.title 清理规则保持一致 */
export function sanitizeFileName(raw: string): string {
  return raw.replace(/[\\\\/:*?\\"<>|.-]+/g, '').trim();
}

export function getPageTitleFallback(): string {
  return sanitizeFileName(document.title);
}
