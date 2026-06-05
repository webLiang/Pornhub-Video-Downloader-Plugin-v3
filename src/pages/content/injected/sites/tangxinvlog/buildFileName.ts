import { getPageTitleFallback, sanitizeFileName } from '../shared/dom';
import { parseVideoObjectLdJson, type VideoObjectLdJson } from '../shared/ldJson';

export function buildTangxinVlogFileName(videoObject: VideoObjectLdJson | null): string {
  const fallbackTitle = getPageTitleFallback();
  const domTitle = document.querySelector('main h1, article.info h1')?.textContent?.trim();
  const domCreator = document
    .querySelector('article.info a.nickname, main .byline a.nickname')
    ?.textContent?.trim()
    .replace(/^@+/, '');

  const videoName = sanitizeFileName(domTitle || videoObject?.name || fallbackTitle);
  const creator = sanitizeFileName(domCreator || videoObject?.creator?.name || '');

  if (creator && videoName) {
    return `${creator}--${videoName}`;
  }
  return videoName || creator || fallbackTitle;
}

export function getTangxinVideoObject(): VideoObjectLdJson | null {
  return parseVideoObjectLdJson();
}
