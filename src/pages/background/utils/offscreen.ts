/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Offscreen document helpers for creating and managing offscreen pages from the background script.
 */

const OFFSCREEN_DOCUMENT_PATH = 'src/pages/offscreen/index.html';

/**
 * Check whether the offscreen document already exists.
 */
async function hasOffscreenDocument(): Promise<boolean> {
  if (!chrome.offscreen) {
    return false;
  }

  // ServiceWorkerGlobalScope clients API
  const globalScope = self as any;
  if (!globalScope.clients || !globalScope.clients.matchAll) {
    return false;
  }

  const allClients = await globalScope.clients.matchAll();
  return allClients.some((client: any) => client.url && client.url.includes(OFFSCREEN_DOCUMENT_PATH));
}

/**
 * Create the offscreen document.
 */
async function createOffscreenDocument(): Promise<void> {
  if (!chrome.offscreen) {
    throw new Error('chrome.offscreen API is not available');
  }

  if (await hasOffscreenDocument()) {
    console.log('[offscreen] Document already exists');
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'Download blob files from background script',
    });
    console.log('[offscreen] Document created successfully');
  } catch (error) {
    console.error('[offscreen] Failed to create document:', error);
    throw error;
  }
}

/**
 * Close the offscreen document.
 */
async function closeOffscreenDocument(): Promise<void> {
  if (!chrome.offscreen) {
    return;
  }

  if (!(await hasOffscreenDocument())) {
    return;
  }

  try {
    await chrome.offscreen.closeDocument();
    console.log('[offscreen] Document closed successfully');
  } catch (error) {
    console.error('[offscreen] Failed to close document:', error);
  }
}

/**
 * Download a file via the offscreen document.
 * @param data - File bytes (ArrayBuffer or Uint8Array)
 * @param filename - Target filename
 * @param mimeType - MIME type
 */
export async function downloadViaOffscreen(
  data: ArrayBuffer | Uint8Array,
  filename: string,
  mimeType: string = 'application/octet-stream',
): Promise<void> {
  try {
    // Ensure offscreen document exists
    await createOffscreenDocument();

    // Normalize to ArrayBuffer when needed
    let arrayBuffer: ArrayBuffer;
    if (data instanceof ArrayBuffer) {
      arrayBuffer = data;
    } else if (data instanceof Uint8Array) {
      // Uint8Array.buffer may be SharedArrayBuffer; copy to ArrayBuffer
      const buffer = data.buffer;
      if (buffer instanceof SharedArrayBuffer) {
        arrayBuffer = new ArrayBuffer(buffer.byteLength);
        new Uint8Array(arrayBuffer).set(new Uint8Array(buffer));
      } else {
        arrayBuffer = buffer.slice(0);
      }
    } else {
      throw new Error('Unsupported data type');
    }

    // Send download message to offscreen document
    const response = await chrome.runtime.sendMessage({
      type: 'download-blob',
      data: arrayBuffer,
      filename: filename,
      mimeType: mimeType,
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || 'Download failed');
    }

    console.log('[offscreen] Download initiated successfully');
  } catch (error) {
    console.error('[offscreen] Download error:', error);
    throw error;
  }
}

// Optional exports for manual lifecycle control
export { createOffscreenDocument, closeOffscreenDocument, hasOffscreenDocument };
