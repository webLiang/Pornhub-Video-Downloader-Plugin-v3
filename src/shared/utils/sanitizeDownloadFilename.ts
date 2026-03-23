/**
 * 供 chrome.downloads.download 的 filename 使用。
 *
 * 若对「整段 xxx.ts」做净化，尾部去点 / 按长度截断可能误伤扩展名（表现为保存后没有 .ts）。
 * 正确做法：先按目标扩展名拆出 stem，只净化 stem，再拼回 `.ts` / `.mp4`。
 *
 * blob URL 下载时若 filename 非法，Chrome 会退回 blob 里的 UUID 作为文件名；stem 仍需替换非法字符。
 */
const INVALID_WIN_CHARS = '<>:"/\\|?*';

/** 控制字符与 Windows 文件名非法字符（不用含 \x00-\x1f 的正则，避免 eslint no-control-regex） */
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
 * 只净化主文件名（不含扩展名），去掉非法字符与 stem 尾部多余的点、空格。
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
 * 去掉末尾目标扩展名（大小写不敏感），净化 stem，再强制拼接 `.ext`，保证最终扩展名始终存在。
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
