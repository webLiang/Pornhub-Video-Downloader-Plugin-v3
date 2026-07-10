import { BaseStorage, createStorage, StorageType } from '@src/shared/storages/base';

/** Persisted download preferences (relative subdir under Chrome's default downloads folder). */
export type DownloadSettings = {
  /**
   * Relative subdirectory under the browser downloads folder (e.g. "Videos").
   * Empty string means save directly in the default downloads folder.
   * Absolute paths and ".." segments are rejected by sanitizeDownloadSubdir.
   */
  downloadSubdir: string;
};

const DEFAULTS: DownloadSettings = {
  downloadSubdir: '',
};

/** Max length for the whole subdir string to stay under Windows MAX_PATH when combined with a filename. */
const MAX_SUBDIR_LEN = 200;

/**
 * Sanitize a user-entered download subdirectory:
 * - Normalize backslashes to forward slashes
 * - Strip ASCII controls and Windows-illegal chars `: * ? " < > |`
 * - Drop empty / `.` / `..` segments so the path cannot escape the downloads folder
 * - Truncate to MAX_SUBDIR_LEN on a `/` boundary when possible
 */
export function sanitizeDownloadSubdir(input: string): string {
  if (!input) return '';
  const ILLEGAL = ':*?"<>|';
  let normalized = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const code = input.charCodeAt(i);
    if (ch === '\\') {
      normalized += '/';
      continue;
    }
    // eslint(no-control-regex): strip controls by charCode instead of a control-char regex
    if (code <= 0x1f || code === 0x7f || ILLEGAL.includes(ch)) {
      continue;
    }
    normalized += ch;
  }
  const cleaned = normalized
    .split('/')
    .map(s => s.trim())
    .filter(s => s && s !== '.' && s !== '..')
    .join('/');
  if (cleaned.length <= MAX_SUBDIR_LEN) return cleaned;
  const truncated = cleaned.slice(0, MAX_SUBDIR_LEN);
  const lastSlash = truncated.lastIndexOf('/');
  return lastSlash > 0 ? truncated.slice(0, lastSlash) : truncated;
}

/**
 * Prefix a sanitized basename with a relative subdir for chrome.downloads.download({ filename }).
 * OPFS keys must stay basename-only; call this only at final disk-save time.
 */
export function withDownloadSubdir(basename: string, subdir: string): string {
  const dir = sanitizeDownloadSubdir(subdir);
  return dir ? `${dir}/${basename}` : basename;
}

type DownloadSettingsStorage = BaseStorage<DownloadSettings> & {
  /** Update downloadSubdir after sanitizing. */
  setDownloadSubdir: (value: string) => Promise<string>;
};

const storage = createStorage<DownloadSettings>('download-settings', DEFAULTS, {
  storageType: StorageType.Local,
  liveUpdate: true,
});

const downloadSettingsStorage: DownloadSettingsStorage = {
  ...storage,

  setDownloadSubdir: async (value: string) => {
    const cleaned = sanitizeDownloadSubdir(value);
    await storage.set(prev => ({ ...prev, downloadSubdir: cleaned }));
    return cleaned;
  },
};

/**
 * Read and re-sanitize the configured download subdirectory (for background downloaders).
 */
export async function getDownloadSubdir(): Promise<string> {
  const settings = await downloadSettingsStorage.get();
  return sanitizeDownloadSubdir(settings.downloadSubdir ?? '');
}

export default downloadSettingsStorage;
