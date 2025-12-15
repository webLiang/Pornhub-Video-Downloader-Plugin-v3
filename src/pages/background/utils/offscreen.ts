/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Offscreen 文档管理工具
 * 用于在 background 脚本中创建和管理 offscreen 文档
 */

const OFFSCREEN_DOCUMENT_PATH = 'src/pages/offscreen/index.html';

/**
 * 检查 offscreen 文档是否已创建
 */
async function hasOffscreenDocument(): Promise<boolean> {
  if (!chrome.offscreen) {
    return false;
  }

  // 使用 ServiceWorkerGlobalScope 的 clients API
  const globalScope = self as any;
  if (!globalScope.clients || !globalScope.clients.matchAll) {
    return false;
  }

  const allClients = await globalScope.clients.matchAll();
  return allClients.some((client: any) => client.url && client.url.includes(OFFSCREEN_DOCUMENT_PATH));
}

/**
 * 创建 offscreen 文档
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
 * 关闭 offscreen 文档
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
 * 通过 offscreen 文档下载文件
 * @param data - 文件数据（ArrayBuffer 或 Uint8Array）
 * @param filename - 文件名
 * @param mimeType - MIME 类型
 */
export async function downloadViaOffscreen(
  data: ArrayBuffer | Uint8Array,
  filename: string,
  mimeType: string = 'application/octet-stream',
): Promise<void> {
  try {
    // 确保 offscreen 文档存在
    await createOffscreenDocument();

    // 将数据转换为 ArrayBuffer（如果需要）
    let arrayBuffer: ArrayBuffer;
    if (data instanceof ArrayBuffer) {
      arrayBuffer = data;
    } else if (data instanceof Uint8Array) {
      // Uint8Array.buffer 可能是 SharedArrayBuffer，需要转换为 ArrayBuffer
      const buffer = data.buffer;
      if (buffer instanceof SharedArrayBuffer) {
        // 如果是 SharedArrayBuffer，创建新的 ArrayBuffer
        arrayBuffer = new ArrayBuffer(buffer.byteLength);
        new Uint8Array(arrayBuffer).set(new Uint8Array(buffer));
      } else {
        arrayBuffer = buffer.slice(0);
      }
    } else {
      throw new Error('Unsupported data type');
    }

    // 发送消息到 offscreen 文档
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

// 导出管理函数（可选，用于手动管理）
export { createOffscreenDocument, closeOffscreenDocument, hasOffscreenDocument };
