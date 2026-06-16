/* eslint-disable @typescript-eslint/no-explicit-any */
// State for chunked downloads (legacy approach)
let downloadState: {
  filename?: string;
  mimeType?: string;
  totalSize?: number;
  totalChunks?: number;
  chunks?: Uint8Array[];
  downloadId?: string;
} | null = null;

// State for chunked blob URL creation (new approach)
let blobUrlState: {
  mimeType?: string;
  totalSize?: number;
  totalChunks?: number;
  chunks?: Uint8Array[];
  downloadId?: string;
} | null = null;

/**
 * Shared helper to trigger a Blob download.
 * @param blob - Blob to download
 * @param fileName - Target file name
 * @param downloadId - Download ID used for confirmation messages
 * @returns Promise that resolves immediately after the download is triggered
 */
function triggerBlobDownload(blob: Blob, fileName: string, downloadId?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const blobUrl = URL.createObjectURL(blob);
      console.log('[offscreen] Blob URL created:', blobUrl, 'Size:', blob.size, 'DownloadId:', downloadId);

      // Use requestAnimationFrame to ensure DOM updates complete

      console.log('[offscreen] requestAnimationFrame');
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.style.display = 'none';

      // Stop event propagation so the download can trigger normally
      a.onclick = e => {
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e.stopPropagation) e.stopPropagation();
        return true;
      };

      document.body.appendChild(a);

      // Trigger click
      console.log('[offscreen] Triggering download click for:', fileName);
      a.click();
      console.log('[offscreen] a.click');
      // Clean up DOM element
      setTimeout(() => {
        if (a.parentNode) {
          a.parentNode.removeChild(a);
        }
      }, 100);

      // Revoke blob URL after a delay so the browser has time to start the download
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        console.log('[offscreen] Blob URL revoked');
      }, 5000); // Extended to 5 seconds so large files can download reliably

      // Delay confirmation so the background listener is registered first
      // Use setTimeout instead of sending immediately to give background time to set up
      if (downloadId) {
        setTimeout(() => {
          console.log('[offscreen] Sending download confirmation:', downloadId, fileName);
          // Send one-way confirmation via sendMessage
          // Background listener returns false, so no response is expected — that is normal
          // Use Promise form but ignore errors since this is a one-way message
          chrome.runtime
            .sendMessage({
              type: 'download-blob-confirmed',
              downloadId: downloadId,
              success: true,
              filename: fileName,
            })
            .then(() => {
              // Usually no response (listener returns false); log if one arrives
              console.log('[offscreen] Download confirmation sent for:', downloadId);
            })
            .catch(error => {
              // Ignore "message channel closed" — expected for one-way messages when listener returns false
              if (error && error.message && error.message.includes('message channel closed')) {
                // Expected behavior; do not log as error
                console.log('[offscreen] Download confirmation sent (one-way message):', downloadId);
              } else {
                // Log other errors only
                console.warn(
                  '[offscreen] Download confirmation send warning:',
                  error?.message || error,
                  'DownloadId:',
                  downloadId,
                );
              }
            });
        }, 200); // 200ms delay so listener is ready (increased delay)
      } else {
        console.warn('[offscreen] No downloadId provided, skipping confirmation message');
      }

      resolve();
    } catch (error: any) {
      console.error('[offscreen] Error triggering download:', error);
      reject(error);
    }
  });
}

function init() {
  chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
    // Handle OPFS file → blob URL request (OPFS approach)
    if (msg.type === 'OPFS_TO_BLOB_URL') {
      console.log('[offscreen] Received OPFS to blob URL request:', {
        filename: msg.filename,
        mimeType: msg.mimeType,
        downloadId: msg.downloadId,
      });

      // Process asynchronously
      (async () => {
        try {
          // 1. Read file from OPFS
          const root = await navigator.storage.getDirectory();
          const fileHandle = await root.getFileHandle(msg.filename);
          const file = await fileHandle.getFile();

          console.log('[offscreen] OPFS file read:', {
            filename: msg.filename,
            size: file.size,
            type: file.type,
            expectedMimeType: msg.mimeType,
          });

          // 2. Create Blob with correct MIME type
          // File from OPFS may lack MIME type; set it explicitly
          const blob = new Blob([file], { type: msg.mimeType || file.type || 'application/octet-stream' });

          // 3. Create blob URL (must be created in offscreen document)
          const blobUrl = URL.createObjectURL(blob);
          console.log('[offscreen] Blob URL created from OPFS file:', {
            blobUrl: blobUrl,
            blobSize: blob.size,
            blobType: blob.type,
            downloadId: msg.downloadId,
          });

          // Return blob URL
          sendResponse({ ok: true, blobUrl: blobUrl });
        } catch (error: any) {
          console.error('[offscreen] Error reading OPFS file and creating blob URL:', error);
          sendResponse({ ok: false, error: error?.message || String(error) });
        }
      })();

      return true; // Keep message channel open for async response
    }

    // Handle create blob URL request (legacy: in-memory data)
    if (msg.type === 'create-blob-url') {
      console.log('[offscreen] Received create blob URL request:', {
        dataSize: msg.data?.length || 0,
        mimeType: msg.mimeType,
        downloadId: msg.downloadId,
      });

      try {
        // Data is a plain array; convert to Uint8Array then Blob
        if (!msg.data || !Array.isArray(msg.data)) {
          throw new Error('Invalid data: expected array');
        }

        // Convert plain array to Uint8Array, then Blob
        const uint8Array = new Uint8Array(msg.data);
        const blob = new Blob([uint8Array], { type: msg.mimeType || 'application/octet-stream' });

        // Create blob URL
        const blobUrl = URL.createObjectURL(blob);
        console.log('[offscreen] Blob URL created:', blobUrl, 'Size:', blob.size, 'DownloadId:', msg.downloadId);

        // Return blob URL
        sendResponse({ ok: true, blobUrl: blobUrl });
      } catch (error: any) {
        console.error('[offscreen] Error creating blob URL:', error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      }

      return true; // Keep message channel open for async response
    }

    // Initialize chunked blob URL creation for large files
    if (msg.type === 'create-blob-url-init') {
      console.log('[offscreen] Initializing chunked blob URL creation:', {
        mimeType: msg.mimeType,
        totalSize: msg.totalSize,
        totalChunks: msg.totalChunks,
        downloadId: msg.downloadId,
      });

      try {
        blobUrlState = {
          mimeType: msg.mimeType || 'application/octet-stream',
          totalSize: msg.totalSize,
          totalChunks: msg.totalChunks,
          chunks: [],
          downloadId: msg.downloadId,
        };

        sendResponse({ ok: true });
      } catch (error: any) {
        console.error('[offscreen] Error initializing chunked blob URL creation:', error);
        blobUrlState = null;
        sendResponse({ ok: false, error: error?.message || String(error) });
      }

      return true;
    }

    // Handle chunked data for large-file blob URL creation
    if (msg.type === 'create-blob-url-chunk') {
      console.log(
        `[offscreen] Received chunk ${msg.chunkIndex + 1}. Download ID: ${blobUrlState?.downloadId || 'N/A'}`,
      );

      try {
        if (!blobUrlState) {
          throw new Error('Blob URL creation not initialized');
        }

        if (!Array.isArray(msg.data)) {
          throw new Error('Invalid chunk data: expected array');
        }

        // Convert plain array to Uint8Array
        const chunk = new Uint8Array(msg.data);
        blobUrlState.chunks!.push(chunk);

        sendResponse({ ok: true });
      } catch (error: any) {
        console.error('[offscreen] Error processing chunk:', error);
        blobUrlState = null;
        sendResponse({ ok: false, error: error?.message || String(error) });
      }

      return true;
    }

    // Complete chunked blob URL creation
    if (msg.type === 'create-blob-url-complete') {
      console.log('[offscreen] Completing chunked blob URL creation', {
        downloadId: msg.downloadId,
      });

      try {
        if (!blobUrlState || !blobUrlState.chunks || blobUrlState.chunks.length === 0) {
          throw new Error('No chunks received');
        }

        // Merge all chunks
        const totalLength = blobUrlState.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const mergedArray = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of blobUrlState.chunks) {
          mergedArray.set(chunk, offset);
          offset += chunk.length;
        }

        // Create Blob and blob URL
        const blob = new Blob([mergedArray], { type: blobUrlState.mimeType || 'application/octet-stream' });
        const blobUrl = URL.createObjectURL(blob);
        const downloadId = blobUrlState.downloadId || msg.downloadId;

        console.log('[offscreen] Chunked blob URL created:', {
          blobUrl: blobUrl,
          blobSize: blob.size,
          mimeType: blobUrlState.mimeType,
          downloadId: downloadId,
        });

        // Clear state
        blobUrlState = null;

        // Return blob URL
        sendResponse({ ok: true, blobUrl: blobUrl });
      } catch (error: any) {
        console.error('[offscreen] Error completing chunked blob URL creation:', error);
        blobUrlState = null;
        sendResponse({ ok: false, error: error?.message || String(error) });
      }

      return true;
    }

    // Direct small-file download (legacy fallback)
    if (msg.type === 'download-blob') {
      console.log('[offscreen] Received download request:', {
        filename: msg.filename,
        mimeType: msg.mimeType,
        dataSize: msg.data?.length || 0,
        downloadId: msg.downloadId,
      });

      try {
        // Data is a plain array; convert to Uint8Array then ArrayBuffer
        if (!msg.data || !Array.isArray(msg.data)) {
          throw new Error('Invalid data: expected array');
        }

        // Convert plain array to Uint8Array, then ArrayBuffer
        const uint8Array = new Uint8Array(msg.data);
        const blob = new Blob([uint8Array], { type: msg.mimeType || 'application/octet-stream' });
        const fileName = msg.filename || 'download';

        console.log('[offscreen] Creating download:', {
          filename: fileName,
          blobSize: blob.size,
          mimeType: msg.mimeType,
        });

        // Respond immediately
        sendResponse({ ok: true });

        // Trigger download via shared helper
        triggerBlobDownload(blob, fileName, msg.downloadId).catch(error => {
          console.error('[offscreen] Download trigger failed:', error);
          // Send failure confirmation
          if (msg.downloadId) {
            chrome.runtime
              .sendMessage({
                type: 'download-blob-confirmed',
                downloadId: msg.downloadId,
                success: false,
                error: error?.message || String(error),
              })
              .catch(() => {
                // Ignore send failure
              });
          }
        });
      } catch (error: any) {
        console.error('[offscreen] Error processing download:', error);
        sendResponse({ ok: false, error: error?.message || String(error) });

        // Send failure confirmation
        if (msg.downloadId) {
          chrome.runtime
            .sendMessage({
              type: 'download-blob-confirmed',
              downloadId: msg.downloadId,
              success: false,
              error: error?.message || String(error),
            })
            .catch(() => {
              // Ignore send failure
            });
        }
      }

      return true; // Keep message channel open for async response
    }

    // Initialize chunked download for large files
    if (msg.type === 'download-blob-init') {
      console.log('[offscreen] Initializing chunked download:', {
        filename: msg.filename,
        totalSize: msg.totalSize,
        totalChunks: msg.totalChunks,
        downloadId: msg.downloadId,
      });

      try {
        downloadState = {
          filename: msg.filename || 'download',
          mimeType: msg.mimeType || 'application/octet-stream',
          totalSize: msg.totalSize,
          totalChunks: msg.totalChunks,
          chunks: [],
          downloadId: msg.downloadId, // Store download ID
        };

        sendResponse({ ok: true });
      } catch (error: any) {
        console.error('[offscreen] Error initializing chunked download:', error);
        downloadState = null;
        sendResponse({ ok: false, error: error?.message || String(error) });

        // Send failure confirmation
        if (msg.downloadId) {
          chrome.runtime
            .sendMessage({
              type: 'download-blob-confirmed',
              downloadId: msg.downloadId,
              success: false,
              error: error?.message || String(error),
            })
            .catch(() => {
              // Ignore send failure
            });
        }
      }

      return true;
    }

    // Handle chunk data
    if (msg.type === 'download-blob-chunk') {
      console.log(`[offscreen] Received chunk ${msg.chunkIndex + 1}`);

      try {
        if (!downloadState) {
          throw new Error('Download not initialized');
        }

        if (!Array.isArray(msg.data)) {
          throw new Error('Invalid chunk data: expected array');
        }

        // Convert plain array to Uint8Array
        const chunk = new Uint8Array(msg.data);
        downloadState.chunks!.push(chunk);

        sendResponse({ ok: true });
      } catch (error: any) {
        console.error('[offscreen] Error processing chunk:', error);
        downloadState = null;
        sendResponse({ ok: false, error: error?.message || String(error) });
      }

      return true;
    }

    // Complete chunked download
    if (msg.type === 'download-blob-complete') {
      console.log('[offscreen] Completing chunked download', {
        downloadId: msg.downloadId,
      });

      try {
        if (!downloadState || !downloadState.chunks || downloadState.chunks.length === 0) {
          throw new Error('No chunks received');
        }

        // Merge all chunks
        const totalLength = downloadState.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const mergedArray = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of downloadState.chunks) {
          mergedArray.set(chunk, offset);
          offset += chunk.length;
        }

        // Create Blob and trigger download
        const blob = new Blob([mergedArray], { type: downloadState.mimeType || 'application/octet-stream' });
        const fileName = downloadState.filename || 'download';
        const downloadId = (downloadState as any).downloadId || msg.downloadId;

        console.log('[offscreen] Creating chunked download:', {
          filename: fileName,
          blobSize: blob.size,
          mimeType: downloadState.mimeType,
        });

        // Respond immediately
        sendResponse({ ok: true });

        // Trigger download via shared helper
        triggerBlobDownload(blob, fileName, downloadId).catch(error => {
          console.error('[offscreen] Chunked download trigger failed:', error);
          // Send failure confirmation
          if (downloadId) {
            chrome.runtime
              .sendMessage({
                type: 'download-blob-confirmed',
                downloadId: downloadId,
                success: false,
                error: error?.message || String(error),
              })
              .catch(() => {
                // Ignore send failure
              });
          }
        });

        // Clear state
        downloadState = null;
      } catch (error: any) {
        console.error('[offscreen] Error completing chunked download:', error);
        const downloadId = (downloadState as any)?.downloadId || msg.downloadId;
        downloadState = null;
        sendResponse({ ok: false, error: error?.message || String(error) });

        // Send failure confirmation
        if (downloadId) {
          chrome.runtime
            .sendMessage({
              type: 'download-blob-confirmed',
              downloadId: downloadId,
              success: false,
              error: error?.message || String(error),
            })
            .catch(() => {
              // Ignore send failure
            });
        }
      }

      return true;
    }

    return false;
  });
}

init();
