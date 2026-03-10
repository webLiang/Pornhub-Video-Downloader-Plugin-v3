/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState } from 'preact/hooks';
import iconLogo from '/icon-128.png';
import '@pages/popup/Popup.css';
import m3u8DownloadStorage, { type M3U8DownloadState } from '@src/shared/storages/m3u8DownloadStorage';
import downloadHistoryStorage, { type DownloadRecord } from '@src/shared/storages/downloadHistoryStorage';
import { ToastContainer, useToast } from '@pages/popup/components/Toast';

type VideoInfo = {
  videoUrl: string;
  quality: string;
  format: 'mp4' | 'webm' | 'm3u8';
  title: string;
};

const manifestData = chrome.runtime.getManifest();
const Popup = () => {
  const [videoInfos, setvideoInfos] = useState<Array<VideoInfo>>([]);
  const [remoteVersion, setRemoteVersion] = useState('0.0.0');
  const { toasts, showSuccess, showError, showInfo, showWarning, removeToast } = useToast();

  // M3U8 下载相关状态
  const [m3u8Url, setM3u8Url] = useState('');
  const [fileName, setFileName] = useState('');
  const [isGetMP4] = useState(false);
  const [downloadState, setDownloadState] = useState<M3U8DownloadState>(
    m3u8DownloadStorage.getSnapshot() || {
      isDownloading: false,
      progress: 0,
      fileName: '',
      errorNum: 0,
      finishNum: 0,
      targetSegment: 0,
    },
  );
  const m3u8SectionRef = useRef<HTMLDivElement | null>(null);
  const [currentTabUrl, setCurrentTabUrl] = useState('');
  const [downloadHistory, setDownloadHistory] = useState<DownloadRecord[]>([]);
  const [pageTitle, setPageTitle] = useState('');
  const [currentTabTitle, setCurrentTabTitle] = useState('');
  const getPageTitle = () => videoInfos[0]?.title || pageTitle || currentTabTitle || '';
  const [isEditingFileName, setIsEditingFileName] = useState(false);
  const fileNameEditableRef = useRef<HTMLDivElement | null>(null);
  const displayFileName = fileName || getPageTitle() || '';

  const scrollToM3u8Section = () => {
    if (m3u8SectionRef.current) {
      m3u8SectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /**
   * Build Origin & Referer headers from the current tab URL.
   * Used to attach correct headers to every m3u8 segment fetch request.
   */
  const buildM3u8Headers = (tabUrl?: string): Record<string, string> | undefined => {
    const url = tabUrl || currentTabUrl;
    if (!url) return undefined;
    try {
      const u = new URL(url);
      return {
        Origin: u.origin,
        Referer: url,
      };
    } catch {
      return undefined;
    }
  };

  useEffect(() => {
    // 初始化时从 storage 加载状态
    m3u8DownloadStorage.get().then(savedState => {
      setDownloadState(savedState);

      // 恢复输入框的值
      if (savedState.url) {
        setM3u8Url(savedState.url);
      }
      if (savedState.fileName && !savedState.completedAt) {
        setFileName(savedState.fileName);
      }
      // if (savedState.isGetMP4 !== undefined) {
      //   setIsGetMP4(savedState.isGetMP4);
      // }

      // 如果正在下载，查询 background 的当前状态
      if (savedState.isDownloading) {
        // 使用 Promise 方式发送消息，避免 lastError 问题
        // 添加延迟，确保 background script 已加载
        setTimeout(() => {
          chrome.runtime
            .sendMessage({ type: 'm3u8-download-status' })
            .then(response => {
              if (response && !response.error) {
                m3u8DownloadStorage.updateProgress({
                  ...response,
                  url: savedState.url,
                  isGetMP4: savedState.isGetMP4,
                });
              } else if (response?.error) {
                console.warn('[Popup] Background 返回错误:', response.error);
              }
            })
            .catch(error => {
              // background script 可能还未加载或已休眠，忽略错误
              // 状态会通过 storage 的订阅机制自动同步
              console.warn('[Popup] 无法连接到 background script，使用本地状态:', error.message || error);
            });
        }, 100); // 延迟 100ms，确保 background script 已唤醒
      }
    });

    // Get current tab URL & title for headers 和默认文件名
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const activeTab = tabs[0];
      if (activeTab?.url) {
        setCurrentTabUrl(activeTab.url);
      }
      if (activeTab?.title) {
        setCurrentTabTitle(activeTab.title);
      }
    });

    sendMessageToContentScript({ command: 'get_video_info' }, function (response) {
      console.log('🚀 ~ response:', response);
      if (response) {
        if (response.pageTitle) {
          setPageTitle(response.pageTitle);
        }
        if (Array.isArray(response.videoInfos)) {
          setvideoInfos(response.videoInfos);
        }
      }
    });

    function fetchVersion() {
      fetch('https://raw.githubusercontent.com/webLiang/Pornhub-Video-Downloader-Plugin-v3/master/package.json')
        .then(response => response.json())
        .then(data => {
          const version = data.version;
          setRemoteVersion(version);
          console.log('Version updated:', version, data);
        })
        .catch(error => console.error('Error fetching version:', error));
    }
    fetchVersion();

    // 订阅 storage 变化（liveUpdate 会自动同步）
    const unsubscribe = m3u8DownloadStorage.subscribe(() => {
      const currentState = m3u8DownloadStorage.getSnapshot();
      if (currentState) {
        setDownloadState(currentState);
      }
    });

    // Load download history & subscribe
    downloadHistoryStorage.get().then(state => setDownloadHistory(state.records));
    const unsubHistory = downloadHistoryStorage.subscribe(() => {
      const snap = downloadHistoryStorage.getSnapshot();
      if (snap) setDownloadHistory(snap.records);
    });

    // 监听来自 background 的消息（进度更新、完成、错误等）
    const messageListener = (message: any) => {
      if (message.type === 'm3u8-download-progress') {
        m3u8DownloadStorage.updateProgress({
          progress: message.progress,
          finishNum: message.finishNum,
          errorNum: message.errorNum,
          targetSegment: message.targetSegment,
          fileDownloadProgress: message.fileDownloadProgress,
          isFileDownloading: message.isFileDownloading,
        });
      } else if (message.type === 'm3u8-download-complete') {
        const fileName = message.fileName || '未知文件名';
        m3u8DownloadStorage.markCompleted(fileName);
        showSuccess(`下载完成！文件名: ${fileName}`);
      } else if (message.type === 'm3u8-download-error') {
        m3u8DownloadStorage.markError(message.error);
        showError(`下载失败: ${message.error}`);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Trigger your effect
    return () => {
      unsubscribe();
      unsubHistory();
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);
  const onDownload = (videoInfo: VideoInfo) => () => {
    if (videoInfo.format === 'm3u8') {
      // 使用新的 M3U8 下载功能
      // 检查是否已有下载任务在进行中
      if (downloadState.isDownloading) {
        showWarning('已有下载任务在进行中');
        return;
      }

      const finalFileName = (fileName || getPageTitle() || 'video').trim();

      // 设置 M3U8 URL 和文件名
      setM3u8Url(videoInfo.videoUrl);
      setFileName(finalFileName);
      // 定位到 M3U8 下载区域
      scrollToM3u8Section();

      // 直接执行下载（attach Origin & Referer from current tab）
      chrome.runtime
        .sendMessage({
          type: 'm3u8-download-start',
          url: videoInfo.videoUrl,
          fileName: finalFileName || undefined,
          isGetMP4: false,
          headers: buildM3u8Headers(),
        })
        .then(response => {
          if (response && !response.success) {
            showError('启动下载失败: ' + (response.error || '未知错误'));
          } else {
            m3u8DownloadStorage.set({
              isDownloading: true,
              progress: 0,
              fileName: finalFileName,
              errorNum: 0,
              finishNum: 0,
              targetSegment: 0,
              error: undefined,
              url: videoInfo.videoUrl,
              isGetMP4: false,
              completedAt: undefined,
            });
            showInfo('M3U8 下载已开始');
          }
        })
        .catch(error => {
          console.error('发送消息失败:', error);
          showError('启动下载失败: ' + (error.message || '无法连接到 background script'));
        });
      return;
    }
    // MP4 / WebM: also go through extension pipeline (DNR headers + OPFS + chrome.downloads)
    if (downloadState.isDownloading) {
      showWarning('已有下载任务在进行中');
      return;
    }

    scrollToM3u8Section();

    chrome.runtime
      .sendMessage({
        type: 'mp4-download-start',
        url: videoInfo.videoUrl,
        fileName: videoInfo.title || 'video',
        headers: buildM3u8Headers(),
      })
      .then(response => {
        if (response && !response.success) {
          showError('启动下载失败: ' + (response.error || '未知错误'));
        } else {
          showInfo(`${videoInfo.format.toUpperCase()} 下载已开始`);
        }
      })
      .catch(error => {
        console.error('发送消息失败:', error);
        showError('启动下载失败: ' + (error.message || '无法连接到 background script'));
      });
  };

  const onCopy = (videoInfo: VideoInfo) => () => {
    navigator.clipboard.writeText(videoInfo.videoUrl);
  };

  // M3U8 下载相关方法
  const handleStartDownload = () => {
    if (!m3u8Url.trim()) {
      showWarning('请输入 M3U8 链接');
      return;
    }

    if (downloadState.isDownloading) {
      showWarning('已有下载任务在进行中');
      return;
    }

    const fallbackName = (fileName || getPageTitle() || 'video').trim();
    setFileName(fallbackName);

    // 发送开始下载消息到 background（attach Origin & Referer from current tab）
    chrome.runtime
      .sendMessage({
        type: 'm3u8-download-start',
        url: m3u8Url.trim(),
        fileName: fallbackName || undefined,
        isGetMP4: isGetMP4,
        headers: buildM3u8Headers(),
      })
      .then(response => {
        if (response && !response.success) {
          showError('启动下载失败: ' + (response.error || '未知错误'));
        } else {
          m3u8DownloadStorage.set({
            isDownloading: true,
            progress: 0,
            fileName: fallbackName || '',
            errorNum: 0,
            finishNum: 0,
            targetSegment: 0,
            error: undefined,
            url: m3u8Url.trim(),
            isGetMP4: isGetMP4,
            completedAt: undefined,
          });
        }
      })
      .catch(error => {
        console.error('发送消息失败:', error);
        showError('启动下载失败: ' + (error.message || '无法连接到 background script'));
      });
  };

  const handleCancelDownload = () => {
    if (!downloadState.isDownloading) {
      return;
    }

    // Cancel both m3u8 and mp4 downloaders (only the active one matters)
    Promise.allSettled([
      chrome.runtime.sendMessage({ type: 'm3u8-download-cancel' }),
      chrome.runtime.sendMessage({ type: 'mp4-download-cancel' }),
    ])
      .then(() => {
        m3u8DownloadStorage.updateProgress({ isDownloading: false });
        showInfo('下载已取消');
      })
      .catch(error => {
        console.error('发送消息失败:', error);
        m3u8DownloadStorage.updateProgress({ isDownloading: false });
        showWarning('取消下载请求发送失败，已清空本地状态');
      });
  };

  // 强制重置下载状态（用于异常情况）
  const handleForceReset = () => {
    if (confirm('确定要强制重置下载状态吗？这将清空所有下载信息。')) {
      // Cancel both m3u8 and mp4 downloaders
      Promise.allSettled([
        chrome.runtime.sendMessage({ type: 'm3u8-download-cancel' }),
        chrome.runtime.sendMessage({ type: 'mp4-download-cancel' }),
      ]).finally(() => {
        m3u8DownloadStorage.reset();
        setM3u8Url('');
        setFileName('');
        showInfo('状态已强制重置');
      });
    }
  };

  // 清除已完成的状态
  const handleClearCompleted = () => {
    m3u8DownloadStorage.reset();
    setM3u8Url('');
    setFileName('');
  };

  const handleFileNameFocus = () => {
    if (downloadState.isDownloading) return;
    setIsEditingFileName(true);
  };

  const handleFileNameBlur = () => {
    setIsEditingFileName(false);
    if (downloadState.isDownloading) return;
    const value = fileNameEditableRef.current?.innerText || '';
    setFileName(value.trim());
  };

  // 打开单条历史记录对应的下载文件（使用 chrome.downloads API）
  const handleOpenHistoryItem = (record: DownloadRecord) => {
    chrome.runtime.sendMessage({
      type: 'open-download-item',
      url: record.url,
      fileName: record.fileName,
    });
  };

  // Open the browser downloads folder
  const handleOpenFolder = () => {
    chrome.runtime.sendMessage({ type: 'open-downloads-folder' });
  };

  // Remove a single history item
  const handleRemoveHistory = (id: string) => {
    downloadHistoryStorage.removeRecord(id);
  };

  // Clear all history
  const handleClearHistory = () => {
    downloadHistoryStorage.clearAll();
  };

  return (
    <div className="App" style={{}}>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="popup-header-bar">
        <img src={iconLogo} className="popup-header-logo" alt="logo" />
        <div className="popup-header-info">
          <span className="popup-header-title">Video Downloader</span>
          <span className="popup-header-meta">
            v{manifestData.version}
            <span className="popup-header-dot">·</span>
            <a
              className="popup-header-author"
              rel="noreferrer"
              href="https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3"
              target="_blank">
              webLiang
            </a>
            {remoteVersion !== '0.0.0' && remoteVersion !== manifestData.version && (
              <>
                <span className="popup-header-dot">·</span>
                <a
                  className="popup-header-update"
                  rel="noreferrer"
                  href="https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3/releases"
                  target="_blank">
                  New {remoteVersion}
                </a>
              </>
            )}
          </span>
        </div>
      </div>
      <div className="box">
        {videoInfos?.length > 0 && (
          <div className="m3u8-filename-row">
            <span className="m3u8-filename-label">文件名 (可选):</span>
            <div
              ref={fileNameEditableRef}
              className={`m3u8-filename-display${isEditingFileName ? ' editing' : ''}${
                downloadState.isDownloading ? ' disabled' : ''
              }`}
              contentEditable={!downloadState.isDownloading}
              onFocus={handleFileNameFocus}
              onBlur={handleFileNameBlur}
              data-placeholder="留空则自动生成">
              {displayFileName}
            </div>
          </div>
        )}
        <ul>
          {videoInfos?.length > 0 &&
            videoInfos.map(item => {
              return (
                <li key={item.videoUrl}>
                  <label>
                    清晰度：<span style={{ display: 'inline-block', width: '60px' }}> {item.quality}</span>
                  </label>
                  <label>
                    类型： <span style={{ display: 'inline-block', width: '40px' }}> {item.format}</span>
                  </label>
                  <button className="button down" onClick={onDownload(item)}>
                    下载
                  </button>{' '}
                  <button className="button copy" onClick={onCopy(item)}>
                    复制
                  </button>
                </li>
              );
            })}
        </ul>
      </div>
      {/* M3U8 下载区域 */}
      <div className="m3u8-download-section" ref={m3u8SectionRef}>
        {/* <h3>M3U8 下载</h3>
        <div className="m3u8-input-group">
          <div className="test-link">
            测试链接:https://upyun.luckly-mjw.cn/Assets/media-source/example/media/index.m3u8
          </div>
          <label htmlFor="m3u8-url">M3U8 链接:</label>
          <input
            id="m3u8-url"
            type="text"
            value={m3u8Url}
            onChange={e => setM3u8Url((e.target as HTMLInputElement).value)}
            placeholder="请输入 M3U8 链接"
            disabled={downloadState.isDownloading}
            className="m3u8-input"
          />
        </div> */}
        {/* <div className="m3u8-input-group">
          <label>
            <input
              type="checkbox"
              checked={isGetMP4}
              onChange={e => setIsGetMP4((e.target as HTMLInputElement).checked)}
              disabled={downloadState.isDownloading}
            />
            转换为 MP4 格式
          </label>
        </div> */}
        <div className="m3u8-button-group">
          {!downloadState.isDownloading ? (
            <>
              <button className="button down" onClick={handleStartDownload}>
                {downloadState.progress === 100 ? '重新下载' : '开始下载'}
              </button>
              {downloadState.progress > 0 && downloadState.progress < 100 && (
                <button className="button clear" onClick={handleForceReset} style={{ marginLeft: '10px' }}>
                  强制重置
                </button>
              )}
            </>
          ) : (
            <>
              <button className="button cancel" onClick={handleCancelDownload}>
                取消下载
              </button>
              <button className="button clear" onClick={handleForceReset} style={{ marginLeft: '10px' }}>
                强制重置
              </button>
            </>
          )}
        </div>
        {(downloadState.isDownloading || downloadState.progress === 100) && (
          <div className="m3u8-progress-section">
            {downloadState.isFileDownloading && (
              <div className="file-download-indicator simple">
                <div className="file-download-spinner"></div>
                <span className="file-download-text">Saving...</span>
              </div>
            )}
            <div className="progress-info">
              <span>进度: {downloadState.progress.toFixed(2)}%</span>
              {downloadState.isDownloading && !downloadState.isFileDownloading && (
                <span>
                  已完成: {downloadState.finishNum} / {downloadState.targetSegment}
                </span>
              )}
              {downloadState.errorNum > 0 && <span className="error-count">错误: {downloadState.errorNum}</span>}
              {downloadState.progress === 100 && downloadState.completedAt && (
                <span className="completed-time">完成时间: {new Date(downloadState.completedAt).toLocaleString()}</span>
              )}
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${downloadState.progress}%` }} />
            </div>

            {downloadState.progress === 100 && !downloadState.isDownloading && (
              <div className="completed-message-compact">
                <span className="success-text" title={downloadState.fileName || 'Unknown file'}>
                  ✓ {downloadState.fileName || 'Unknown file'}
                </span>
                <div className="completed-actions">
                  <button className="btn-icon" onClick={handleOpenFolder} title="打开下载文件夹">
                    📂
                  </button>
                  <button className="btn-icon" onClick={handleClearCompleted} title="清除">
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {downloadState.error && <div className="m3u8-error">{downloadState.error}</div>}
      </div>

      {/* Download History */}
      {downloadHistory.length > 0 && (
        <div className="download-history">
          <div className="history-header">
            <span className="history-title">下载记录 ({downloadHistory.length})</span>
            <button className="btn-text" onClick={handleClearHistory}>
              清空
            </button>
          </div>
          <ul className="history-list">
            {downloadHistory.map(record => (
              <li key={record.id} className="history-item">
                <span className="history-filename" title={record.fileName}>
                  {record.fileName}
                </span>
                <span className="history-time">{new Date(record.completedAt).toLocaleDateString()}</span>
                <div className="history-actions">
                  <button className="btn-icon-sm" onClick={() => handleOpenHistoryItem(record)} title="打开文件">
                    📂
                  </button>
                  <button className="btn-icon-sm" onClick={() => handleRemoveHistory(record.id)} title="删除记录">
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

function sendMessageToContentScript(message, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    // 向当前选中的tab发送消息
    // console.log('popup send')
    chrome.tabs.sendMessage(tabs[0].id, message, function (response) {
      // console.log(response);
      if (callback) callback(response);
      return true;
    });
  });
}

export default Popup;
