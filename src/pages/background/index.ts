/* eslint-disable @typescript-eslint/no-explicit-any */
import reloadOnUpdate from 'virtual:reload-on-update-in-background-script';
import 'webextension-polyfill';
import M3U8Downloader from './utils/m3u8-downloader-core';
import m3u8DownloadStorage from '@src/shared/storages/m3u8DownloadStorage';

reloadOnUpdate('pages/background');

/**
 * Extension reloading is necessary because the browser automatically caches the css.
 * If you do not use the css of the content script, please delete it.
 */
// reloadOnUpdate('pages/content/style.scss');

console.log('background loaded');

// 下载器实例管理
let downloaderInstance: any = null;

// 获取当前下载状态
async function getDownloadState() {
  return await m3u8DownloadStorage.get();
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[background] Received message:', message);

  // 处理 M3U8 下载相关消息
  if (message.type === 'm3u8-download-start') {
    handleM3U8DownloadStart(message, sendResponse);
    return true; // 保持消息通道打开以支持异步响应
  } else if (message.type === 'm3u8-download-cancel') {
    handleM3U8DownloadCancel(sendResponse);
    return true;
  } else if (message.type === 'm3u8-download-status') {
    getDownloadState().then(state => {
      sendResponse(state);
    });
    return true; // 保持消息通道打开以支持异步响应
  }

  return false;
});

/**
 * 处理 M3U8 下载开始请求
 */
async function handleM3U8DownloadStart(message: any, sendResponse: (response?: any) => void) {
  try {
    const { url, fileName, isGetMP4 } = message;

    if (!url) {
      try {
        sendResponse({ success: false, error: 'URL 不能为空' });
      } catch (e) {
        console.warn('[background] sendResponse failed:', e);
      }
      return;
    }

    const currentState = await getDownloadState();
    if (downloaderInstance && currentState.isDownloading) {
      try {
        sendResponse({ success: false, error: '已有下载任务在进行中' });
      } catch (e) {
        console.warn('[background] sendResponse failed:', e);
      }
      return;
    }

    // 销毁旧的下载器实例（释放内存和资源）
    if (downloaderInstance) {
      try {
        downloaderInstance.destroy();
        downloaderInstance = null;
        console.log('[background] 旧下载器实例已销毁');
      } catch (e) {
        console.warn('[background] 销毁旧下载器实例时出错:', e);
        downloaderInstance = null;
      }
    }

    // 创建下载器实例
    downloaderInstance = new M3U8Downloader({
      maxConcurrent: 50,
      retryInterval: 2000,
      timeout: 15000, // 15 秒超时（等待响应头）
      dataTimeout: 600000, // 10 分钟超时（数据传输）
      onProgress: (data: any) => {
        m3u8DownloadStorage.updateProgress({
          progress: data.progress,
          finishNum: data.finishNum,
          errorNum: data.errorNum,
          targetSegment: data.targetSegment,
          fileDownloadProgress: data.fileDownloadProgress,
          isFileDownloading: data.isFileDownloading,
        });

        // 发送进度更新到 popup
        chrome.runtime
          .sendMessage({
            type: 'm3u8-download-progress',
            progress: data.progress,
            finishNum: data.finishNum,
            errorNum: data.errorNum,
            targetSegment: data.targetSegment,
            fileDownloadProgress: data.fileDownloadProgress,
            isFileDownloading: data.isFileDownloading,
          })
          .catch(() => {
            // 忽略发送失败（popup 可能已关闭）
          });
      },
      onError: (error: string) => {
        m3u8DownloadStorage.markError(error);

        // 发送错误到 popup
        chrome.runtime
          .sendMessage({
            type: 'm3u8-download-error',
            error: error,
          })
          .catch(() => {
            // 忽略发送失败
          });

        // 错误后销毁下载器实例（释放内存）
        if (downloaderInstance) {
          try {
            downloaderInstance.destroy();
            downloaderInstance = null;
            console.log('[background] 下载器实例已销毁（错误后）');
          } catch (e) {
            downloaderInstance = null;
          }
        }
      },
      onComplete: (data: any) => {
        m3u8DownloadStorage.markCompleted(data.fileName);

        // 发送完成消息到 popup
        chrome.runtime
          .sendMessage({
            type: 'm3u8-download-complete',
            fileName: data.fileName,
            duration: data.duration,
            totalSegments: data.totalSegments,
          })
          .catch(() => {
            // 忽略发送失败
          });

        // 完成后销毁下载器实例（释放内存）
        if (downloaderInstance) {
          try {
            downloaderInstance.destroy();
            downloaderInstance = null;
            console.log('[background] 下载器实例已销毁（完成后）');
          } catch (e) {
            downloaderInstance = null;
          }
        }
      },
    });

    // 重置下载状态
    await m3u8DownloadStorage.set({
      isDownloading: true,
      progress: 0,
      fileName: fileName || '',
      errorNum: 0,
      finishNum: 0,
      targetSegment: 0,
      url: url,
      isGetMP4: isGetMP4 || false,
      completedAt: undefined, // 清除完成时间
      error: undefined,
    });

    // 开始下载
    downloaderInstance.start(url, {
      isGetMP4: isGetMP4 || false,
      fileName: fileName || '',
    });

    try {
      sendResponse({ success: true, message: '下载已开始' });
    } catch (e) {
      console.warn('[background] sendResponse failed:', e);
    }
  } catch (error: any) {
    console.error('[background] M3U8 download start error:', error);
    m3u8DownloadStorage.updateProgress({
      isDownloading: false,
    });
    try {
      sendResponse({ success: false, error: error.message || '下载启动失败' });
    } catch (e) {
      console.warn('[background] sendResponse failed:', e);
    }
  }
}

/**
 * 处理 M3U8 下载取消请求
 */
async function handleM3U8DownloadCancel(sendResponse: (response?: any) => void) {
  try {
    console.log('100000----handleM3U8DownloadCancel');
    const currentState = await getDownloadState();

    // 如果下载器实例存在，无论状态如何都尝试销毁
    if (downloaderInstance) {
      try {
        downloaderInstance.destroy();
        downloaderInstance = null;
        console.log('[background] 下载器实例已销毁');
      } catch (error) {
        console.warn('[background] 销毁下载器实例时出错:', error);
        downloaderInstance = null;
      }
    }

    // 如果状态显示正在下载，或者下载器实例存在，都清空状态
    if (currentState.isDownloading || downloaderInstance === null) {
      await m3u8DownloadStorage.updateProgress({
        isDownloading: false,
        progress: 0,
      });
      sendResponse({ success: true, message: '下载已取消' });
    } else {
      // 即使没有正在进行的任务，也清空 isDownloading 状态（可能是状态不同步）
      await m3u8DownloadStorage.updateProgress({
        isDownloading: false,
      });
      sendResponse({ success: true, message: '状态已清空' });
    }
  } catch (error: any) {
    console.error('[background] M3U8 download cancel error:', error);
    // 即使出错，也尝试清空状态
    try {
      await m3u8DownloadStorage.updateProgress({
        isDownloading: false,
      });
    } catch (e) {
      console.error('[background] 清空状态失败:', e);
    }
    sendResponse({ success: false, error: error.message || '取消下载失败' });
  }
}

// chrome.action.onClicked.addListener(tab => {
//   // Do something when popup is opened
//   console.log('Popup opened on tab:', tab);
// });

// chrome.action.onClicked.addListener(tab => {
//   // 打开 popup 页面时触发的逻辑
//   // 可以在此处执行你的操作
//   console.log('Popup opened');
// });
