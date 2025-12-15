/* eslint-disable @typescript-eslint/no-explicit-any */
// 存储分块下载的状态（旧方案）
let downloadState: {
  filename?: string;
  mimeType?: string;
  totalSize?: number;
  totalChunks?: number;
  chunks?: Uint8Array[];
  downloadId?: string;
} | null = null;

// 存储分块创建 blob URL 的状态（新方案）
let blobUrlState: {
  mimeType?: string;
  totalSize?: number;
  totalChunks?: number;
  chunks?: Uint8Array[];
  downloadId?: string;
} | null = null;

/**
 * 触发 Blob 下载的公用方法
 * @param blob - 要下载的 Blob 对象
 * @param fileName - 文件名
 * @param downloadId - 下载 ID，用于发送确认消息
 * @returns Promise，在下载触发后立即 resolve
 */
function triggerBlobDownload(blob: Blob, fileName: string, downloadId?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const blobUrl = URL.createObjectURL(blob);
      console.log('[offscreen] Blob URL created:', blobUrl, 'Size:', blob.size, 'DownloadId:', downloadId);

      // 使用 requestAnimationFrame 确保 DOM 更新完成

      console.log('[offscreen] requestAnimationFrame');
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.style.display = 'none';

      // 阻止事件冒泡，确保下载能正常触发
      a.onclick = e => {
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e.stopPropagation) e.stopPropagation();
        return true;
      };

      document.body.appendChild(a);

      // 触发点击
      console.log('[offscreen] Triggering download click for:', fileName);
      a.click();
      console.log('[offscreen] a.click');
      // 清理 DOM 元素
      setTimeout(() => {
        if (a.parentNode) {
          a.parentNode.removeChild(a);
        }
      }, 100);

      // 延迟清理 blob URL，给浏览器足够时间开始下载
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        console.log('[offscreen] Blob URL revoked');
      }, 5000); // 延长到 5 秒，确保大文件也能正常下载

      // 延迟发送确认消息，确保 background 的监听器已经设置好
      // 使用 setTimeout 而不是立即发送，给 background 时间设置监听器
      if (downloadId) {
        setTimeout(() => {
          console.log('[offscreen] Sending download confirmation:', downloadId, fileName);
          // 使用 sendMessage 发送单向确认消息
          // background 的监听器返回 false，所以不会有响应，这是正常的
          // 使用 Promise 方式，但忽略可能的错误（因为这是单向消息）
          chrome.runtime
            .sendMessage({
              type: 'download-blob-confirmed',
              downloadId: downloadId,
              success: true,
              filename: fileName,
            })
            .then(() => {
              // 通常不会有响应（因为监听器返回 false），但如果有响应就记录
              console.log('[offscreen] Download confirmation sent for:', downloadId);
            })
            .catch(error => {
              // 忽略 "message channel closed" 错误，因为这是单向消息，监听器返回 false 是正常的
              if (error && error.message && error.message.includes('message channel closed')) {
                // 这是预期的行为，不记录错误
                console.log('[offscreen] Download confirmation sent (one-way message):', downloadId);
              } else {
                // 其他错误才记录
                console.warn(
                  '[offscreen] Download confirmation send warning:',
                  error?.message || error,
                  'DownloadId:',
                  downloadId,
                );
              }
            });
        }, 200); // 延迟 200ms 确保监听器已设置（增加延迟时间）
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
    // 处理从 OPFS 文件创建 blob URL 请求（OPFS 方案）
    if (msg.type === 'OPFS_TO_BLOB_URL') {
      console.log('[offscreen] Received OPFS to blob URL request:', {
        filename: msg.filename,
        mimeType: msg.mimeType,
        downloadId: msg.downloadId,
      });

      // 异步处理
      (async () => {
        try {
          // 1. 从 OPFS 读取文件
          const root = await navigator.storage.getDirectory();
          const fileHandle = await root.getFileHandle(msg.filename);
          const file = await fileHandle.getFile();

          console.log('[offscreen] OPFS file read:', {
            filename: msg.filename,
            size: file.size,
            type: file.type,
            expectedMimeType: msg.mimeType,
          });

          // 2. 创建 Blob，确保使用正确的 MIME 类型
          // 从 OPFS 读取的 File 对象可能没有正确的 MIME 类型，需要手动指定
          const blob = new Blob([file], { type: msg.mimeType || file.type || 'application/octet-stream' });

          // 3. 创建 blob URL（必须在 offscreen 中创建）
          const blobUrl = URL.createObjectURL(blob);
          console.log('[offscreen] Blob URL created from OPFS file:', {
            blobUrl: blobUrl,
            blobSize: blob.size,
            blobType: blob.type,
            downloadId: msg.downloadId,
          });

          // 返回 blob URL
          sendResponse({ ok: true, blobUrl: blobUrl });
        } catch (error: any) {
          console.error('[offscreen] Error reading OPFS file and creating blob URL:', error);
          sendResponse({ ok: false, error: error?.message || String(error) });
        }
      })();

      return true; // 保持消息通道打开以支持异步响应
    }

    // 处理创建 blob URL 请求（旧方案：使用内存数据）
    if (msg.type === 'create-blob-url') {
      console.log('[offscreen] Received create blob URL request:', {
        dataSize: msg.data?.length || 0,
        mimeType: msg.mimeType,
        downloadId: msg.downloadId,
      });

      try {
        // 数据是普通数组，需要转换为 Uint8Array 再转为 Blob
        if (!msg.data || !Array.isArray(msg.data)) {
          throw new Error('Invalid data: expected array');
        }

        // 将普通数组转换为 Uint8Array，再转换为 Blob
        const uint8Array = new Uint8Array(msg.data);
        const blob = new Blob([uint8Array], { type: msg.mimeType || 'application/octet-stream' });

        // 创建 blob URL
        const blobUrl = URL.createObjectURL(blob);
        console.log('[offscreen] Blob URL created:', blobUrl, 'Size:', blob.size, 'DownloadId:', msg.downloadId);

        // 返回 blob URL
        sendResponse({ ok: true, blobUrl: blobUrl });
      } catch (error: any) {
        console.error('[offscreen] Error creating blob URL:', error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      }

      return true; // 保持消息通道打开以支持异步响应
    }

    // 处理大文件分块创建 blob URL 初始化
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

    // 处理大文件分块数据
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

        // 将普通数组转换为 Uint8Array
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

    // 处理大文件分块完成，创建 blob URL
    if (msg.type === 'create-blob-url-complete') {
      console.log('[offscreen] Completing chunked blob URL creation', {
        downloadId: msg.downloadId,
      });

      try {
        if (!blobUrlState || !blobUrlState.chunks || blobUrlState.chunks.length === 0) {
          throw new Error('No chunks received');
        }

        // 合并所有分块
        const totalLength = blobUrlState.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const mergedArray = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of blobUrlState.chunks) {
          mergedArray.set(chunk, offset);
          offset += chunk.length;
        }

        // 创建 Blob 和 blob URL
        const blob = new Blob([mergedArray], { type: blobUrlState.mimeType || 'application/octet-stream' });
        const blobUrl = URL.createObjectURL(blob);
        const downloadId = blobUrlState.downloadId || msg.downloadId;

        console.log('[offscreen] Chunked blob URL created:', {
          blobUrl: blobUrl,
          blobSize: blob.size,
          mimeType: blobUrlState.mimeType,
          downloadId: downloadId,
        });

        // 清理状态
        blobUrlState = null;

        // 返回 blob URL
        sendResponse({ ok: true, blobUrl: blobUrl });
      } catch (error: any) {
        console.error('[offscreen] Error completing chunked blob URL creation:', error);
        blobUrlState = null;
        sendResponse({ ok: false, error: error?.message || String(error) });
      }

      return true;
    }

    // 处理小文件直接下载（保留旧方案作为备用）
    if (msg.type === 'download-blob') {
      console.log('[offscreen] Received download request:', {
        filename: msg.filename,
        mimeType: msg.mimeType,
        dataSize: msg.data?.length || 0,
        downloadId: msg.downloadId,
      });

      try {
        // 数据是普通数组，需要转换为 Uint8Array 再转为 ArrayBuffer
        if (!msg.data || !Array.isArray(msg.data)) {
          throw new Error('Invalid data: expected array');
        }

        // 将普通数组转换为 Uint8Array，再转换为 ArrayBuffer
        const uint8Array = new Uint8Array(msg.data);
        const blob = new Blob([uint8Array], { type: msg.mimeType || 'application/octet-stream' });
        const fileName = msg.filename || 'download';

        console.log('[offscreen] Creating download:', {
          filename: fileName,
          blobSize: blob.size,
          mimeType: msg.mimeType,
        });

        // 立即响应消息
        sendResponse({ ok: true });

        // 使用公用方法触发下载
        triggerBlobDownload(blob, fileName, msg.downloadId).catch(error => {
          console.error('[offscreen] Download trigger failed:', error);
          // 发送失败确认
          if (msg.downloadId) {
            chrome.runtime
              .sendMessage({
                type: 'download-blob-confirmed',
                downloadId: msg.downloadId,
                success: false,
                error: error?.message || String(error),
              })
              .catch(() => {
                // 忽略发送失败
              });
          }
        });
      } catch (error: any) {
        console.error('[offscreen] Error processing download:', error);
        sendResponse({ ok: false, error: error?.message || String(error) });

        // 发送失败确认
        if (msg.downloadId) {
          chrome.runtime
            .sendMessage({
              type: 'download-blob-confirmed',
              downloadId: msg.downloadId,
              success: false,
              error: error?.message || String(error),
            })
            .catch(() => {
              // 忽略发送失败
            });
        }
      }

      return true; // 保持消息通道打开以支持异步响应
    }

    // 处理大文件分块下载初始化
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
          downloadId: msg.downloadId, // 保存下载 ID
        };

        sendResponse({ ok: true });
      } catch (error: any) {
        console.error('[offscreen] Error initializing chunked download:', error);
        downloadState = null;
        sendResponse({ ok: false, error: error?.message || String(error) });

        // 发送失败确认
        if (msg.downloadId) {
          chrome.runtime
            .sendMessage({
              type: 'download-blob-confirmed',
              downloadId: msg.downloadId,
              success: false,
              error: error?.message || String(error),
            })
            .catch(() => {
              // 忽略发送失败
            });
        }
      }

      return true;
    }

    // 处理分块数据
    if (msg.type === 'download-blob-chunk') {
      console.log(`[offscreen] Received chunk ${msg.chunkIndex + 1}`);

      try {
        if (!downloadState) {
          throw new Error('Download not initialized');
        }

        if (!Array.isArray(msg.data)) {
          throw new Error('Invalid chunk data: expected array');
        }

        // 将普通数组转换为 Uint8Array
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

    // 处理分块下载完成
    if (msg.type === 'download-blob-complete') {
      console.log('[offscreen] Completing chunked download', {
        downloadId: msg.downloadId,
      });

      try {
        if (!downloadState || !downloadState.chunks || downloadState.chunks.length === 0) {
          throw new Error('No chunks received');
        }

        // 合并所有分块
        const totalLength = downloadState.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const mergedArray = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of downloadState.chunks) {
          mergedArray.set(chunk, offset);
          offset += chunk.length;
        }

        // 创建 Blob 并触发下载
        const blob = new Blob([mergedArray], { type: downloadState.mimeType || 'application/octet-stream' });
        const fileName = downloadState.filename || 'download';
        const downloadId = (downloadState as any).downloadId || msg.downloadId;

        console.log('[offscreen] Creating chunked download:', {
          filename: fileName,
          blobSize: blob.size,
          mimeType: downloadState.mimeType,
        });

        // 立即响应消息
        sendResponse({ ok: true });

        // 使用公用方法触发下载
        triggerBlobDownload(blob, fileName, downloadId).catch(error => {
          console.error('[offscreen] Chunked download trigger failed:', error);
          // 发送失败确认
          if (downloadId) {
            chrome.runtime
              .sendMessage({
                type: 'download-blob-confirmed',
                downloadId: downloadId,
                success: false,
                error: error?.message || String(error),
              })
              .catch(() => {
                // 忽略发送失败
              });
          }
        });

        // 清理状态
        downloadState = null;
      } catch (error: any) {
        console.error('[offscreen] Error completing chunked download:', error);
        const downloadId = (downloadState as any)?.downloadId || msg.downloadId;
        downloadState = null;
        sendResponse({ ok: false, error: error?.message || String(error) });

        // 发送失败确认
        if (downloadId) {
          chrome.runtime
            .sendMessage({
              type: 'download-blob-confirmed',
              downloadId: downloadId,
              success: false,
              error: error?.message || String(error),
            })
            .catch(() => {
              // 忽略发送失败
            });
        }
      }

      return true;
    }

    return false;
  });
}

init();
