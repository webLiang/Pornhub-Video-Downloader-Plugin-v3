/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * MP4Downloader – single-file direct download through the extension's
 * background service worker, reusing the same DNR + OPFS + offscreen pipeline
 * that M3U8Downloader uses for segment downloads.
 *
 * Flow:
 *  1. registerHeaderRules  → declarativeNetRequest sets Origin / Referer
 *  2. fetch(url)           → stream the response body
 *  3. OPFS stream-write    → write chunks to Origin-Private-File-System
 *  4. offscreen → blob URL → chrome.downloads.download → user's disk
 *  5. cleanup (DNR rules, OPFS temp file)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MP4DownloadOptions {
  url: string;
  fileName: string;
  headers?: Record<string, string>;
  /** Called on progress updates (0-100) */
  onProgress?: (data: MP4ProgressData) => void;
  onComplete?: (data: { fileName: string }) => void;
  onError?: (error: string) => void;
}

export interface MP4ProgressData {
  /** 0-100 overall progress */
  progress: number;
  /** Bytes received so far */
  bytesReceived: number;
  /** Total bytes (from Content-Length), -1 if unknown */
  totalBytes: number;
  /** Whether we are in the "saving to disk" phase */
  isFileDownloading: boolean;
}

// ---------------------------------------------------------------------------
// DNR whitelist (shared concept with M3U8Downloader)
// ---------------------------------------------------------------------------

const DNR_HEADER_WHITELIST = [/^Origin$/i, /^Referer$/i, /^Cookie$/i];

// ---------------------------------------------------------------------------
// MP4Downloader class
// ---------------------------------------------------------------------------

export class MP4Downloader {
  private abortController: AbortController | null = null;
  private activeRuleIds: number[] = [];
  private opfsFileName = '';
  private destroyed = false;

  // ------ public API -------------------------------------------------------

  /**
   * Start downloading.  Returns a promise that resolves on success or rejects
   * on error (the same information is also sent via callbacks).
   */
  async start(opts: MP4DownloadOptions): Promise<void> {
    const { url, fileName, headers, onProgress, onComplete, onError } = opts;

    try {
      // 1. Register DNR header rules
      if (headers && Object.keys(headers).length > 0) {
        await this.registerHeaderRules(url, headers);
      }

      // 2. Fetch with streaming
      this.abortController = new AbortController();
      const response = await fetch(url, { signal: this.abortController.signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const contentLength = parseInt(response.headers.get('Content-Length') ?? '-1', 10);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body is not readable');

      // 3. Init OPFS file
      const ext = 'mp4';
      this.opfsFileName = `mp4-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(this.opfsFileName, { create: true });
      const writable = await fileHandle.createWritable();

      let bytesReceived = 0;

      // 4. Stream read → OPFS write
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (this.destroyed) {
          reader.cancel();
          await writable.close().catch(() => {});
          this.cleanupOPFS();
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        await writable.write(value);
        bytesReceived += value.byteLength;

        const progress = contentLength > 0 ? Math.min((bytesReceived / contentLength) * 90, 90) : -1;
        onProgress?.({
          progress: progress >= 0 ? progress : -1,
          bytesReceived,
          totalBytes: contentLength,
          isFileDownloading: false,
        });
      }

      await writable.close();

      // 5. Trigger download via offscreen → blob URL → chrome.downloads
      onProgress?.({
        progress: 92,
        bytesReceived,
        totalBytes: contentLength,
        isFileDownloading: true,
      });

      await this.downloadFromOPFS(this.opfsFileName, fileName, bytesReceived, onProgress);

      // 6. Done
      await this.cleanupHeaderRules();
      onComplete?.({ fileName });
    } catch (err: any) {
      await this.cleanupHeaderRules();
      this.cleanupOPFS();
      if (this.destroyed) return; // user-cancelled, don't report error
      const msg = err?.message || String(err);
      onError?.(msg);
    }
  }

  /** Cancel an in-progress download. */
  destroy(): void {
    this.destroyed = true;
    this.abortController?.abort();
    this.cleanupHeaderRules();
    this.cleanupOPFS();
  }

  // ------ DNR rules --------------------------------------------------------

  private async registerHeaderRules(url: string, headers: Record<string, string>): Promise<void> {
    const requestHeaders: any[] = [];
    for (const [header, value] of Object.entries(headers)) {
      if (DNR_HEADER_WHITELIST.some(re => re.test(header))) {
        requestHeaders.push({ operation: 'set', header, value });
      }
    }
    if (requestHeaders.length === 0) return;

    let pattern: string;
    try {
      pattern = new URL('.', url).href + '*';
    } catch {
      pattern = url;
    }

    const id = Math.ceil(Math.random() * 1e8);
    const rule: chrome.declarativeNetRequest.Rule = {
      id,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders,
      },
      condition: { urlFilter: pattern },
    };

    try {
      await chrome.declarativeNetRequest.updateSessionRules({ addRules: [rule] });
      this.activeRuleIds.push(id);
    } catch (e) {
      console.error('[MP4Downloader] Failed to register DNR rules:', e);
    }
  }

  private async cleanupHeaderRules(): Promise<void> {
    if (this.activeRuleIds.length === 0) return;
    const ids = [...this.activeRuleIds];
    this.activeRuleIds = [];
    try {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
    } catch {
      // ignore
    }
  }

  // ------ OPFS → offscreen → chrome.downloads ------------------------------

  private async downloadFromOPFS(
    opfsFileName: string,
    fileName: string,
    fileSize: number,
    onProgress?: (data: MP4ProgressData) => void,
  ): Promise<void> {
    const fullFileName = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;

    // Ensure offscreen document exists
    await this.ensureOffscreenDocument();

    // Ask offscreen to create a blob URL from the OPFS file
    const response = await chrome.runtime.sendMessage({
      type: 'OPFS_TO_BLOB_URL',
      filename: opfsFileName,
      mimeType: 'video/mp4',
      downloadId: `mp4-dl-${Date.now()}`,
    });

    if (!response?.ok || !response?.blobUrl) {
      throw new Error(response?.error || 'Failed to create blob URL from OPFS');
    }

    // Use chrome.downloads.download to save to disk
    await this.startChromeDownload(response.blobUrl, fullFileName, opfsFileName, fileSize, onProgress);
  }

  private startChromeDownload(
    blobUrl: string,
    fullFileName: string,
    opfsFileName: string,
    fileSize: number,
    onProgress?: (data: MP4ProgressData) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        listener && chrome.downloads.onChanged.removeListener(listener);
        this.cleanupOPFSFile(opfsFileName);
        reject(new Error('Download timed out'));
      }, 300_000);

      let chromeDownloadId: number | null = null;

      const listener = (delta: chrome.downloads.DownloadDelta) => {
        if (delta.id !== chromeDownloadId) return;

        const deltaAny = delta as any;
        const received = deltaAny.bytesReceived?.current as number | undefined;
        if (received !== undefined && fileSize > 0) {
          const filePct = Math.min((received / fileSize) * 100, 100);
          const overall = 90 + filePct * 0.1; // 90-100 range for file save phase
          onProgress?.({
            progress: Math.min(overall, 100),
            bytesReceived: received,
            totalBytes: fileSize,
            isFileDownloading: true,
          });
        }

        if (delta.state?.current === 'complete') {
          this.cleanupOPFSFile(opfsFileName);
          clearTimeout(timeout);
          chrome.downloads.onChanged.removeListener(listener);
          resolve();
        } else if (delta.state?.current === 'interrupted') {
          this.cleanupOPFSFile(opfsFileName);
          clearTimeout(timeout);
          chrome.downloads.onChanged.removeListener(listener);
          reject(new Error(delta.error?.current || 'Download interrupted'));
        }
      };

      chrome.downloads.onChanged.addListener(listener);

      chrome.downloads.download(
        { url: blobUrl, filename: fullFileName, saveAs: false, conflictAction: 'uniquify' },
        id => {
          if (chrome.runtime.lastError) {
            this.cleanupOPFSFile(opfsFileName);
            clearTimeout(timeout);
            chrome.downloads.onChanged.removeListener(listener);
            reject(new Error(chrome.runtime.lastError.message || 'Download failed'));
            return;
          }
          chromeDownloadId = id;
        },
      );
    });
  }

  // ------ offscreen document -----------------------------------------------

  private async ensureOffscreenDocument(): Promise<void> {
    if (!chrome.offscreen) throw new Error('chrome.offscreen API not available');

    const OFFSCREEN_PATH = 'src/pages/offscreen/index.html';
    try {
      const globalScope = self as any;
      const clients = await globalScope.clients?.matchAll();
      if (clients.some((c: any) => c.url?.includes(OFFSCREEN_PATH))) return;
    } catch {
      // fall through
    }

    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification: 'Create blob URL from OPFS file for MP4 download',
      });
    } catch (err: any) {
      if (err.message?.includes('already exists')) return;
      throw err;
    }
  }

  // ------ OPFS cleanup -----------------------------------------------------

  private async cleanupOPFSFile(name: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name);
    } catch {
      // ignore
    }
  }

  private cleanupOPFS(): void {
    if (this.opfsFileName) {
      this.cleanupOPFSFile(this.opfsFileName).catch(() => {});
      this.opfsFileName = '';
    }
  }
}

export default MP4Downloader;
