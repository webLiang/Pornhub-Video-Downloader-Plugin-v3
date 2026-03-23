/* eslint-disable @typescript-eslint/no-explicit-any */

import { buildSanitizedDownloadFilenameWithExtension } from '@src/shared/utils/sanitizeDownloadFilename';
import { setPendingBlobFilename } from '@src/shared/utils/downloadFilenameFix';

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
  /** Stable OPFS file name (from download queue task) */
  opfsFileName?: string;
  /** Resume appending after pauseSoft(); requires server Range support */
  resumeFromByte?: number;
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
  private opfsWritable: FileSystemWritableFileStream | null = null;
  private destroyed = false;
  private pauseRequested = false;
  private bytesReceivedTotal = 0;

  // ------ public API -------------------------------------------------------

  getBytesReceived(): number {
    return this.bytesReceivedTotal;
  }

  /**
   * Start downloading (or resume when resumeFromByte > 0).
   */
  async start(opts: MP4DownloadOptions): Promise<void> {
    const {
      url,
      fileName,
      headers,
      onProgress,
      onComplete,
      onError,
      opfsFileName: presetName,
      resumeFromByte = 0,
    } = opts;

    this.destroyed = false;
    this.pauseRequested = false;

    try {
      if (headers && Object.keys(headers).length > 0) {
        await this.registerHeaderRules(url, headers);
      }

      this.abortController = new AbortController();

      const fetchHeaders: Record<string, string> = { ...(headers || {}) };
      if (resumeFromByte > 0) {
        fetchHeaders['Range'] = `bytes=${resumeFromByte}-`;
      }

      const response = await fetch(url, { signal: this.abortController.signal, headers: fetchHeaders });

      if (resumeFromByte > 0) {
        if (response.status !== 206 && response.status !== 200) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        if (response.status === 200) {
          throw new Error('Server did not honor Range; cannot resume');
        }
      } else if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      let totalBytes = -1;
      const contentRange = response.headers.get('Content-Range');
      const contentLen = response.headers.get('Content-Length');
      if (contentRange) {
        const m = contentRange.match(/\/(\d+)\s*$/);
        if (m) totalBytes = parseInt(m[1], 10);
      }
      if (totalBytes <= 0) {
        const cl = parseInt(contentLen ?? '-1', 10);
        if (resumeFromByte > 0 && cl > 0) {
          totalBytes = resumeFromByte + cl;
        } else {
          totalBytes = cl;
        }
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body is not readable');

      const ext = 'mp4';
      this.opfsFileName = presetName || `mp4-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(this.opfsFileName, { create: resumeFromByte === 0 });
      this.opfsWritable = await fileHandle.createWritable({ keepExistingData: resumeFromByte > 0 });

      let bytesReceived = resumeFromByte;
      this.bytesReceivedTotal = bytesReceived;

      let readingStream = true;
      while (readingStream) {
        if (this.destroyed) {
          await reader.cancel().catch(() => {});
          await this.opfsWritable.close().catch(() => {});
          this.opfsWritable = null;
          this.cleanupOPFS();
          await this.cleanupHeaderRules();
          return;
        }
        if (this.pauseRequested) {
          await reader.cancel().catch(() => {});
          await this.opfsWritable.close().catch(() => {});
          this.opfsWritable = null;
          await this.cleanupHeaderRules();
          return;
        }

        const { done, value } = await reader.read();
        if (done) {
          readingStream = false;
          continue;
        }

        await this.opfsWritable.write(value);
        bytesReceived += value.byteLength;
        this.bytesReceivedTotal = bytesReceived;

        const progress = totalBytes > 0 ? Math.min((bytesReceived / totalBytes) * 90, 90) : -1;
        onProgress?.({
          progress: progress >= 0 ? progress : -1,
          bytesReceived,
          totalBytes: totalBytes > 0 ? totalBytes : -1,
          isFileDownloading: false,
        });
      }

      await this.opfsWritable.close();
      this.opfsWritable = null;

      onProgress?.({
        progress: 92,
        bytesReceived,
        totalBytes: totalBytes > 0 ? totalBytes : bytesReceived,
        isFileDownloading: true,
      });

      await this.downloadFromOPFS(this.opfsFileName, fileName, bytesReceived, onProgress);

      await this.cleanupHeaderRules();
      onComplete?.({ fileName });
    } catch (err: any) {
      await this.cleanupHeaderRules();
      if (this.opfsWritable) {
        await this.opfsWritable.close().catch(() => {});
        this.opfsWritable = null;
      }
      if (this.pauseRequested) {
        return;
      }
      if (this.destroyed) {
        this.cleanupOPFS();
        return;
      }
      this.cleanupOPFS();
      const msg = err?.message || String(err);
      onError?.(msg);
    }
  }

  /** Pause without removing OPFS partial file; use start({ ...opts, resumeFromByte: getBytesReceived() }). */
  pauseSoft(): void {
    this.pauseRequested = true;
    this.abortController?.abort();
  }

  /** Remove task and optionally delete OPFS cache. */
  destroy(purgeOpfs = true): void {
    this.destroyed = true;
    this.pauseRequested = false;
    this.abortController?.abort();
    void this.cleanupHeaderRules();
    if (this.opfsWritable) {
      void this.opfsWritable.close().catch(() => {});
      this.opfsWritable = null;
    }
    if (purgeOpfs) {
      this.cleanupOPFS();
    }
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

      const downloadFileName = buildSanitizedDownloadFilenameWithExtension(fullFileName, 'mp4');

      setPendingBlobFilename(blobUrl, downloadFileName);

      console.log('[mp4-dl] chrome.downloads.download', {
        fullFileName,
        downloadFileName,
        blobUrlPreview: (blobUrl || '').slice(0, 96),
      });

      chrome.downloads.download(
        { url: blobUrl, filename: downloadFileName, saveAs: false, conflictAction: 'uniquify' },
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
