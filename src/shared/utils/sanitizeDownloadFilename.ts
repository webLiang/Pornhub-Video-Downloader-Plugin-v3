/**
 * Filename sanitization for chrome.downloads.download.
 *
 * Sanitizing the full "xxx.ts" string can strip the extension via trailing-dot trim or length cut.
 * Split stem by target extension, sanitize stem only, then re-append `.ts` / `.mp4`.
 *
 * Illegal filenames fall back to blob UUID; stem must still replace illegal characters.
 */
const INVALID_WIN_CHARS = '<>:"/\\|?*';

/** Control chars and Windows-illegal filename chars (no \x00-\x1f regex to satisfy eslint no-control-regex) */
function stripIllegalFilenameChars(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      out += '_';
      continue;
    }
    const ch = input[i];
    if (INVALID_WIN_CHARS.includes(ch)) {
      out += '_';
      continue;
    }
    out += ch;
  }
  return out;
}

const MAX_DOWNLOAD_FILENAME_LEN = 200;

/**
 * Sanitize filename stem only (no extension): illegal chars and trailing dots/spaces.
 */
export function sanitizeDownloadFilenameStem(stem: string, maxStemLen: number): string {
  let s = (stem || '').trim();
  if (!s) {
    return 'video';
  }
  s = stripIllegalFilenameChars(s);
  s = s.replace(/\s+/g, ' ').trim();

  while (s.length > 0) {
    const last = s[s.length - 1];
    if (last === '.' || last === ' ') {
      s = s.slice(0, -1).trim();
      continue;
    }
    break;
  }

  if (!s || s === '.' || s === '..') {
    return 'video';
  }

  if (s.length > maxStemLen) {
    return s.slice(0, maxStemLen);
  }
  return s;
}

/**
 * Strip target extension (case-insensitive), sanitize stem, force `.ext` suffix.
 */
export function buildSanitizedDownloadFilenameWithExtension(fullFileName: string, ext: 'ts' | 'mp4'): string {
  const extLower = ext.toLowerCase();
  const suffix = `.${extLower}`;
  let stem = (fullFileName || '').trim();
  if (stem.toLowerCase().endsWith(suffix)) {
    stem = stem.slice(0, -suffix.length);
  }
  const maxStem = Math.max(1, MAX_DOWNLOAD_FILENAME_LEN - suffix.length);
  const safeStem = sanitizeDownloadFilenameStem(stem, maxStem);
  return `${safeStem}${suffix}`;
}
