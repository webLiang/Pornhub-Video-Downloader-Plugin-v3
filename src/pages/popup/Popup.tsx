/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import iconLogo from '/icon-128.png';
import '@pages/popup/Popup.css';
import downloadHistoryStorage, { type DownloadRecord } from '@src/shared/storages/downloadHistoryStorage';
import downloadQueueStorage, {
  type DownloadTask,
  type DownloadTaskStatus,
} from '@src/shared/storages/downloadQueueStorage';
import { sortVideoInfosByQualityDesc } from '@src/shared/utils/videoInfoSort';
import { ToastContainer, useToast } from '@pages/popup/components/Toast';
import { translate } from '@src/chrome/i18n';

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
      const sortedInfos: VideoInfo[] = Array.isArray(response.videoInfos)
        ? sortVideoInfosByQualityDesc(response.videoInfos as VideoInfo[])
        : [];
      if (sortedInfos.length) setvideoInfos(sortedInfos);

      // Only overwrite default filename when response title matches current tab (avoid wrong title from sidebar/recommended)
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tabTitle = (tabs[0]?.title || '').trim();
        const pageTitle = (response.pageTitle || '').trim();
        const firstVideoTitle = (sortedInfos[0]?.title || '').trim();

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
        showSuccess(translate('toastDownloadComplete', message.fileName || translate('taskUnknownFile')));
      } else if (message.type === 'download-task-error') {
        showError(translate('toastDownloadFailed', message.error || translate('taskFailedUnknown')));
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

  /** 与队列里未结束的任务冲突：同一视频 URL 已排队 / 下载中 / 暂停时不再入队（error 允许重新点） */
  const findBlockingTaskForUrl = (videoUrl: string): DownloadTask | undefined => {
    return queueTasks.find(t => {
      if (t.url !== videoUrl) return false;
      const s: DownloadTaskStatus = t.status;
      return s === 'queued' || s === 'downloading' || s === 'paused';
    });
  };

  const onDownload = (videoInfo: VideoInfo) => () => {
    const blocking = findBlockingTaskForUrl(videoInfo.videoUrl);
    if (blocking) {
      scrollToM3u8Section();
      if (blocking.status === 'downloading') {
        showWarning(translate('toastTaskAlreadyDownloading'));
      } else if (blocking.status === 'queued') {
        showWarning(translate('toastTaskAlreadyQueued'));
      } else {
        showWarning(translate('toastTaskPausedHint'));
      }
      return;
    }

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
          showError(translate('toastEnqueueFailed', response.error || translate('taskFailedUnknown')));
        } else {
          showInfo(translate('toastEnqueued'));
        }
      })
      .catch(error => {
        console.error('发送消息失败:', error);
        showError(translate('toastSendMessageFailed', error.message || translate('toastBackgroundNotReachable')));
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

  /** Delete task and remove OPFS cache for this task */
  const handleDeleteTask = (taskId: string) => {
    chrome.runtime
      .sendMessage({ type: 'download-queue-delete', taskId })
      .then((response: { success?: boolean; error?: string } | undefined) => {
        if (response && response.success === false) {
          showError(translate('toastDeleteFailed', response.error || translate('taskFailedUnknown')));
          return;
        }
        showInfo(translate('toastTaskDeleted'));
      })
      .catch(e => {
        showWarning(translate('toastDeleteFailed', e?.message || translate('toastDeleteFailedBackground')));
      });
  };

  /** Pause: keep OPFS partial data */
  const handlePauseTask = (taskId: string) => {
    chrome.runtime
      .sendMessage({ type: 'download-queue-pause', taskId })
      .then((response: { success?: boolean; error?: string } | undefined) => {
        if (response && response.success === false) {
          showError(translate('toastPauseFailed', response.error || translate('taskFailedUnknown')));
          return;
        }
        showInfo(translate('toastPaused'));
      })
      .catch(e => {
        showWarning(translate('toastPauseFailed', e?.message || translate('toastBackgroundNotReachable')));
      });
  };

  const handleResumeTask = (taskId: string) => {
    chrome.runtime
      .sendMessage({ type: 'download-queue-resume', taskId })
      .then((response: { success?: boolean; error?: string } | undefined) => {
        if (response && response.success === false) {
          showError(translate('toastResumeFailed', response.error || translate('taskFailedUnknown')));
          return;
        }
        showInfo(translate('toastResuming'));
      })
      .catch(e => {
        showWarning(translate('toastResumeFailed', e?.message || translate('toastBackgroundNotReachable')));
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
  return (
    <div className="App" style={{}}>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="popup-header-bar">
        <img src={iconLogo} className="popup-header-logo" alt="logo" />
        <div className="popup-header-info">
          <span className="popup-header-title">{translate('popupHeaderTitle')}</span>
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
                  {translate('popupHeaderNewVersion', remoteVersion)}
                </a>
              </>
            )}
          </span>
        </div>
      </div>
      <div className="box">
        {videoInfos?.length > 0 && (
          <div className="m3u8-filename-row">
            <span className="m3u8-filename-label">{translate('popupFilenameLabel')}:</span>
            <div
              ref={fileNameEditableRef}
              className={`m3u8-filename-display${isEditingFileName ? ' editing' : ''}${''}`}
              contentEditable={true}
              onFocus={handleFileNameFocus}
              onBlur={handleFileNameBlur}
              data-placeholder={translate('popupFilenamePlaceholder')}>
              {displayFileName}
            </div>
          </div>
        )}
        <ul>
          {videoInfos?.length > 0 &&
            videoInfos.map(item => {
              const blockingTask = findBlockingTaskForUrl(item.videoUrl);
              const downloadBusy = Boolean(blockingTask);
              let downloadLabel = translate('popupActionDownload');
              if (blockingTask) {
                if (blockingTask.status === 'downloading') downloadLabel = translate('popupActionDownloading');
                else if (blockingTask.status === 'queued') downloadLabel = translate('popupActionQueued');
                else if (blockingTask.status === 'paused') downloadLabel = translate('popupActionPaused');
              }
              return (
                <li key={item.videoUrl}>
                  <label>
                    {translate('popupQualityLabel')}：
                    <span style={{ display: 'inline-block', width: '60px' }}> {item.quality}</span>
                  </label>
                  <label>
                    {translate('popupTypeLabel')}：
                    <span style={{ display: 'inline-block', width: '40px' }}> {item.format}</span>
                  </label>
                  <button
                    type="button"
                    className="button down video-row-download"
                    disabled={downloadBusy}
                    title={downloadBusy ? translate('popupTooltipAlreadyInQueue') : translate('popupTooltipAddToQueue')}
                    onClick={onDownload(item)}>
                    {downloadLabel}
                  </button>
                  <button className="button copy" onClick={onCopy(item)}>
                    {translate('popupActionCopy')}
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
              {translate('queueTitle')}
              <span className="queue-meta">
                {translate('queueMetaDownloading', String(queueTasks.filter(t => t.status === 'downloading').length))} /{' '}
                {translate('queueMetaQueued', String(queueTasks.filter(t => t.status === 'queued').length))} /{' '}
                {translate('queueMetaPaused', String(queueTasks.filter(t => t.status === 'paused').length))}
              </span>
            </span>
            <div className="queue-actions">
              <button
                className="btn-text"
                onClick={() => chrome.runtime.sendMessage({ type: 'download-queue-clear-queued' })}
                title={translate('queueTooltipClearQueued')}>
                {translate('queueActionClearQueued')}
              </button>
              <button
                className="btn-text"
                onClick={() => chrome.runtime.sendMessage({ type: 'download-queue-clear-errors' })}
                title={translate('queueTooltipClearErrors')}>
                {translate('queueActionClearErrors')}
              </button>
              <button className="btn-text" onClick={handleOpenFolder} title={translate('queueTooltipOpenFolder')}>
                {translate('queueActionOpenFolder')}
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
                const queuedSuffix = queuedIndex ? `（#${queuedIndex}）` : '';
                const progressText = Number.isFinite(task.progress) ? task.progress.toFixed(2) : '0.00';
                return (
                  <div key={task.id} className={`m3u8-progress-section task-card status-${task.status}`}>
                    <div className="m3u8-progress-row">
                      <div className="m3u8-progress-left">
                        <span className="m3u8-filename-show" title={task.fileName || translate('taskUnknownFile')}>
                          {task.fileName || translate('taskUnknownFile')}
                        </span>
                        <div className="progress-info inline">
                          <span>
                            {task.status === 'queued'
                              ? translate('taskStatusWaiting', queuedSuffix)
                              : task.status === 'paused'
                                ? translate('taskStatusPaused')
                                : translate('taskStatusDownloading')}
                          </span>
                          <span>{translate('taskProgress', progressText)}</span>
                          {task.status === 'downloading' && !task.isFileDownloading && (
                            <span>
                              {translate('taskCompletedSegments', [String(task.finishNum), String(task.targetSegment)])}
                            </span>
                          )}
                          {task.errorNum > 0 && (
                            <span className="error-count">{translate('taskErrorCount', String(task.errorNum))}</span>
                          )}
                          {task.status === 'error' && (
                            <span className="error-count">
                              {translate('taskFailedReason', task.error || translate('taskFailedUnknown'))}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="m3u8-progress-actions">
                        {task.status === 'queued' && (
                          <button className="btn-sm btn-cancel" onClick={() => handleDeleteTask(task.id)}>
                            {translate('taskActionDelete')}
                          </button>
                        )}
                        {task.status === 'downloading' && (
                          <>
                            <button className="btn-sm btn-secondary" onClick={() => handlePauseTask(task.id)}>
                              {translate('taskActionPause')}
                            </button>
                            <button className="btn-sm btn-cancel" onClick={() => handleDeleteTask(task.id)}>
                              {translate('taskActionDelete')}
                            </button>
                          </>
                        )}
                        {task.status === 'paused' && (
                          <>
                            <button className="btn-sm btn-primary" onClick={() => handleResumeTask(task.id)}>
                              {translate('taskActionResume')}
                            </button>
                            <button className="btn-sm btn-cancel" onClick={() => handleDeleteTask(task.id)}>
                              {translate('taskActionDelete')}
                            </button>
                          </>
                        )}
                        {task.status === 'error' && (
                          <button className="btn-sm btn-clear" onClick={() => handleDeleteTask(task.id)}>
                            {translate('taskActionRemove')}
                          </button>
                        )}
                      </div>
                    </div>

                    {task.isFileDownloading && task.status === 'downloading' && (
                      <div className="file-download-indicator simple">
                        <div className="file-download-spinner"></div>
                        <span className="file-download-text">{translate('fileSaving')}</span>
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
            <span className="history-title">{translate('historyTitle', String(downloadHistory.length))}</span>
            <button className="btn-text" onClick={handleClearHistory}>
              {translate('historyActionClear')}
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
                  <button
                    className="btn-icon-sm"
                    onClick={() => handleOpenHistoryItem(record)}
                    title={translate('historyTooltipOpenFile')}>
                    📂
                  </button>
                  <button
                    className="btn-icon-sm"
                    onClick={() => handleRemoveHistory(record.id)}
                    title={translate('historyTooltipDeleteRecord')}>
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
