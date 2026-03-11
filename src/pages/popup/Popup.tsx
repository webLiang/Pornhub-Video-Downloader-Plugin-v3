/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import iconLogo from '/icon-128.png';
import '@pages/popup/Popup.css';
import downloadHistoryStorage, { type DownloadRecord } from '@src/shared/storages/downloadHistoryStorage';
import downloadQueueStorage, { type DownloadTask } from '@src/shared/storages/downloadQueueStorage';
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
  const [fileName, setFileName] = useState('');
  // const [isGetMP4] = useState(false);
  const [queueTasks, setQueueTasks] = useState<DownloadTask[]>(downloadQueueStorage.getSnapshot()?.tasks || []);
  const m3u8SectionRef = useRef<HTMLDivElement | null>(null);
  const [currentTabUrl, setCurrentTabUrl] = useState('');
  const [downloadHistory, setDownloadHistory] = useState<DownloadRecord[]>([]);
  const [pageTitle, setPageTitle] = useState('');
  const [currentTabTitle, setCurrentTabTitle] = useState('');
  const getPageTitle = () => videoInfos[0]?.title || pageTitle || currentTabTitle || '';
  const [isEditingFileName, setIsEditingFileName] = useState(false);
  const fileNameEditableRef = useRef<HTMLDivElement | null>(null);
  const displayFileName = fileName || getPageTitle() || '';
  const hasUserEditedFileNameRef = useRef(false);

  const sanitizeDownloadFileName = (rawName: string, fallback = 'video') => {
    // Remove characters that are illegal in Windows/Chrome download filenames
    // Also trim, collapse spaces, and remove trailing dots/spaces which can break downloads
    const input = (rawName || '').replace(/\s+/g, ' ').trim();

    // eslint(no-control-regex): avoid control char ranges in regex; strip them by charCode instead
    let noControl = '';
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      if (code >= 32) noControl += input[i];
    }

    const withoutIllegal = noControl.replace(/[<>:"/\\|?*]/g, '_');
    const noTrailing = withoutIllegal.replace(/[.\s]+$/g, '').trim();
    const normalized = noTrailing.replace(/_+/g, '_').trim();

    const safe = normalized || fallback;
    const MAX_LEN = 120;
    if (safe.length <= MAX_LEN) return safe;
    return (
      safe
        .slice(0, MAX_LEN)
        .replace(/[.\s]+$/g, '')
        .trim() || fallback
    );
  };

  const setDefaultFileName = (nextName: string) => {
    const next = sanitizeDownloadFileName(nextName, '');
    if (!next) return;
    if (hasUserEditedFileNameRef.current) return;
    if (isEditingFileName) return;

    setFileName(prev => (prev === next ? prev : next));

    // contentEditable 不一定会随着 state 更新显示，这里同步一次 DOM
    const el = fileNameEditableRef.current;
    if (el && el.innerText !== next) {
      el.innerText = next;
    }
  };

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
    // 初始化队列（等待队列也会从本地 storage 恢复）
    downloadQueueStorage.get().then(state => {
      setQueueTasks(state.tasks || []);
    });

    // Get current tab URL & title for headers 和默认文件名
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const activeTab = tabs[0];
      if (activeTab?.url) {
        setCurrentTabUrl(activeTab.url);
      }
      if (activeTab?.title) {
        setCurrentTabTitle(activeTab.title);
        // 每次打开 popup：先用 tab 标题作为默认文件名（后面 content script 返回 pageTitle 会再刷新一次）
        hasUserEditedFileNameRef.current = false;
        setDefaultFileName(activeTab.title);
      }
      console.log('🚀 ~ activeTab:', activeTab, activeTab.title);
    });

    sendMessageToContentScript({ command: 'get_video_info' }, function (response) {
      if (!response) return;
      if (response.pageTitle) setPageTitle(response.pageTitle);
      if (Array.isArray(response.videoInfos)) setvideoInfos(response.videoInfos);

      // Only overwrite default filename when response title matches current tab (avoid wrong title from sidebar/recommended)
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tabTitle = (tabs[0]?.title || '').trim();
        const pageTitle = (response.pageTitle || '').trim();
        const firstVideoTitle = (response.videoInfos?.[0]?.title || '').trim();

        const pageMatchesTab = pageTitle && tabTitle && (tabTitle.includes(pageTitle) || pageTitle.includes(tabTitle));
        const firstMatchesTab =
          firstVideoTitle && tabTitle && (tabTitle.includes(firstVideoTitle) || firstVideoTitle.includes(tabTitle));

        if (pageMatchesTab && pageTitle) {
          setDefaultFileName(pageTitle);
        } else if (firstMatchesTab && firstVideoTitle) {
          setDefaultFileName(firstVideoTitle);
        } else if (tabTitle) {
          setDefaultFileName(tabTitle);
        }
      });
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

    // 订阅队列 storage 变化（liveUpdate 会自动同步）
    const unsubQueue = downloadQueueStorage.subscribe(() => {
      const snap = downloadQueueStorage.getSnapshot();
      if (snap) setQueueTasks(snap.tasks || []);
    });

    // Load download history & subscribe
    downloadHistoryStorage.get().then(state => setDownloadHistory(state.records));
    const unsubHistory = downloadHistoryStorage.subscribe(() => {
      const snap = downloadHistoryStorage.getSnapshot();
      if (snap) setDownloadHistory(snap.records);
    });

    // 监听来自 background 的消息（完成、错误等）
    const messageListener = (message: any) => {
      if (message.type === 'download-task-complete') {
        showSuccess(`下载完成！文件名: ${message.fileName || '未知文件名'}`);
      } else if (message.type === 'download-task-error') {
        showError(`下载失败: ${message.error || '未知错误'}`);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Trigger your effect
    return () => {
      unsubQueue();
      unsubHistory();
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // Sync contentEditable DOM from displayFileName so title from get_video_info actually shows (React does not update contentEditable children)
  useLayoutEffect(() => {
    if (isEditingFileName) return;
    if (hasUserEditedFileNameRef.current) return;
    const next = (displayFileName || '').trim();
    const el = fileNameEditableRef.current;
    if (!el) return;
    if (el.innerText !== next) {
      el.innerText = next;
    }
  }, [displayFileName, isEditingFileName]);
  const onDownload = (videoInfo: VideoInfo) => () => {
    const finalFileName = sanitizeDownloadFileName(fileName || getPageTitle() || videoInfo.title || 'video', 'video');
    setFileName(finalFileName);
    scrollToM3u8Section();

    chrome.runtime
      .sendMessage({
        type: 'download-queue-enqueue',
        url: videoInfo.videoUrl,
        fileName: finalFileName || undefined,
        format: videoInfo.format,
        headers: buildM3u8Headers(),
      })
      .then(response => {
        if (response && !response.success) {
          showError('入队失败: ' + (response.error || '未知错误'));
        } else {
          showInfo('已加入下载队列');
        }
      })
      .catch(error => {
        console.error('发送消息失败:', error);
        showError('入队失败: ' + (error.message || '无法连接到 background script'));
      });
  };

  const onCopy = (videoInfo: VideoInfo) => () => {
    navigator.clipboard.writeText(videoInfo.videoUrl);
  };

  // // M3U8 下载相关方法
  // const handleStartDownload = () => {
  //   if (!m3u8Url.trim()) {
  //     showWarning('请输入 M3U8 链接');
  //     return;
  //   }

  //   const fallbackName = (fileName || getPageTitle() || 'video').trim();
  //   setFileName(fallbackName);

  //   // 入队（attach Origin & Referer from current tab）
  //   chrome.runtime
  //     .sendMessage({
  //       type: 'download-queue-enqueue',
  //       url: m3u8Url.trim(),
  //       fileName: fallbackName || undefined,
  //       format: 'm3u8',
  //       headers: buildM3u8Headers(),
  //     })
  //     .then(response => {
  //       if (response && !response.success) {
  //         showError('入队失败: ' + (response.error || '未知错误'));
  //       } else {
  //         showInfo('已加入下载队列');
  //       }
  //     })
  //     .catch(error => {
  //       console.error('发送消息失败:', error);
  //       showError('入队失败: ' + (error.message || '无法连接到 background script'));
  //     });
  // };

  const handleCancelTask = (taskId: string) => {
    chrome.runtime
      .sendMessage({ type: 'download-queue-cancel', taskId })
      .then(() => {
        showInfo('任务已取消/移除');
      })
      .catch(e => {
        showWarning('取消失败: ' + (e?.message || '未知错误'));
      });
  };

  const handleFileNameFocus = () => {
    setIsEditingFileName(true);
  };

  const handleFileNameBlur = () => {
    setIsEditingFileName(false);
    const value = fileNameEditableRef.current?.innerText || '';
    setFileName(sanitizeDownloadFileName(value, ''));
    hasUserEditedFileNameRef.current = true;
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
  console.log(3333, displayFileName);
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
              className={`m3u8-filename-display${isEditingFileName ? ' editing' : ''}${''}`}
              contentEditable={true}
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
                  </button>
                  <button className="button copy" onClick={onCopy(item)}>
                    复制
                  </button>
                </li>
              );
            })}
        </ul>
      </div>
      {/* M3U8 下载区域 */}
      {queueTasks.length > 0 && (
        <div className="m3u8-download-section" ref={m3u8SectionRef}>
          <div className="queue-header">
            <span className="queue-title">
              下载队列（同时最多 6 个）
              <span className="queue-meta">
                {queueTasks.filter(t => t.status === 'downloading').length} 下载中 /{' '}
                {queueTasks.filter(t => t.status === 'queued').length} 等待
              </span>
            </span>
            <div className="queue-actions">
              <button
                className="btn-text"
                onClick={() => chrome.runtime.sendMessage({ type: 'download-queue-clear-queued' })}
                title="清空等待队列">
                清空等待
              </button>
              <button
                className="btn-text"
                onClick={() => chrome.runtime.sendMessage({ type: 'download-queue-clear-errors' })}
                title="清空错误任务">
                清空错误
              </button>
              <button className="btn-text" onClick={handleOpenFolder} title="打开下载文件夹">
                打开目录
              </button>
            </div>
          </div>

          <div className="queue-list">
            {(() => {
              const queuedTasks = queueTasks
                .filter(t => t.status === 'queued')
                .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
              const queuedIndexMap = new Map<string, number>();
              queuedTasks.forEach((t, idx) => queuedIndexMap.set(t.id, idx + 1));

              return queueTasks.map(task => {
                const queuedIndex = task.status === 'queued' ? queuedIndexMap.get(task.id) || 0 : 0;
                return (
                  <div key={task.id} className={`m3u8-progress-section task-card status-${task.status}`}>
                    <div className="m3u8-progress-row">
                      <div className="m3u8-progress-left">
                        <span className="m3u8-filename-show" title={task.fileName || 'Unknown file'}>
                          {task.fileName || 'Unknown file'}
                        </span>
                        <div className="progress-info inline">
                          <span>
                            {task.status === 'queued' ? `等待中${queuedIndex ? `（#${queuedIndex}）` : ''}` : '下载中'}
                          </span>
                          <span>进度: {Number.isFinite(task.progress) ? task.progress.toFixed(2) : '0.00'}%</span>
                          {task.status === 'downloading' && !task.isFileDownloading && (
                            <span>
                              已完成: {task.finishNum} / {task.targetSegment}
                            </span>
                          )}
                          {task.errorNum > 0 && <span className="error-count">错误: {task.errorNum}</span>}
                          {task.status === 'error' && (
                            <span className="error-count">失败: {task.error || '未知错误'}</span>
                          )}
                        </div>
                      </div>
                      <div className="m3u8-progress-actions">
                        {(task.status === 'queued' || task.status === 'downloading') && (
                          <button className="btn-sm btn-cancel" onClick={() => handleCancelTask(task.id)}>
                            取消
                          </button>
                        )}
                        {task.status === 'error' && (
                          <button className="btn-sm btn-clear" onClick={() => handleCancelTask(task.id)}>
                            移除
                          </button>
                        )}
                      </div>
                    </div>

                    {task.isFileDownloading && task.status === 'downloading' && (
                      <div className="file-download-indicator simple">
                        <div className="file-download-spinner"></div>
                        <span className="file-download-text">Saving...</span>
                      </div>
                    )}
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${task.progress}%` }} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

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
