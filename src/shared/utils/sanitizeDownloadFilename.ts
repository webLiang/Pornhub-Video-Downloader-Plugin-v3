/**
 * Filename sanitization for chrome.downloads.download.
 *
 * Sanitizing the full "xxx.ts" string can strip the extension via trailing-dot trim or length cut.
 * Split stem by target extension, sanitize stem only, then re-append `.ts` / `.mp4`.
 *
 * Relative paths like "uploader/title" are supported: each segment is sanitized, `/` is kept
 * so Chrome saves under a subdirectory of the downloads folder.
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
 * Sanitize a single path segment (no `/`); drops empty / `.` / `..`.
 */
function sanitizePathSegment(segment: string, maxLen: number): string {
  const safe = sanitizeDownloadFilenameStem(segment, maxLen);
  if (!safe || safe === '.' || safe === '..') {
    return '';
  }
  return safe;
}

/**
 * Strip target extension (case-insensitive), sanitize stem, force `.ext` suffix.
 * Preserves relative directory prefixes (e.g. "uploader/title" → "uploader/title.mp4").
 */
export function buildSanitizedDownloadFilenameWithExtension(fullFileName: string, ext: 'ts' | 'mp4'): string {
  const extLower = ext.toLowerCase();
  const suffix = `.${extLower}`;
  let raw = (fullFileName || '').trim().replace(/\\/g, '/');
  if (raw.toLowerCase().endsWith(suffix)) {
    raw = raw.slice(0, -suffix.length);
  }

  const parts = raw
    .split('/')
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return `video${suffix}`;
  }

  const maxStem = Math.max(1, MAX_DOWNLOAD_FILENAME_LEN - suffix.length);
  const baseStem = parts[parts.length - 1];
  const dirParts = parts
    .slice(0, -1)
    .map(p => sanitizePathSegment(p, maxStem))
    .filter(Boolean);
  const safeStem = sanitizeDownloadFilenameStem(baseStem, maxStem);
  const basename = `${safeStem}${suffix}`;
  return dirParts.length ? `${dirParts.join('/')}/${basename}` : basename;
}
