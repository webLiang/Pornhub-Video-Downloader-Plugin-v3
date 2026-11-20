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
import downloadSettingsStorage, {
  isUseChannelFolderEnabled,
  getMaxMissingPercent,
  sanitizeDownloadSubdir,
} from '@src/shared/storages/downloadSettingsStorage';
import { sortVideoInfosByQualityDesc } from '@src/shared/utils/videoInfoSort';
import { ToastContainer, useToast } from '@pages/popup/components/Toast';
import DownloadTaskCard from '@pages/popup/components/DownloadTaskCard';
import { isNewerVersion } from './version';
import {
  getCurrentLocale,
  SUPPORTED_LOCALES,
  setCurrentLocale,
  subscribeLocaleChange,
  translate,
  type SupportedLocale,
} from '@src/chrome/i18n';

type VideoInfo = {
  videoUrl: string;
  quality: string;
  format: 'mp4' | 'webm' | 'm3u8';
  title: string;
  /** Site-specific Origin/Referer; overrides tab-derived headers when set. */
  headers?: Record<string, string>;
  fallbackUrls?: string[];
};

const manifestData = chrome.runtime.getManifest();

const GITHUB_REPO_URL = 'https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3';
const GITHUB_NEW_ISSUE_URL = `${GITHUB_REPO_URL}/issues/new`;

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  zh_CN: '中文',
  es: 'Espanol',
  ar: 'العربية',
  hi: 'हिंदी',
};

/**
 * Sanitize a download filename. When keepChannelFolder is true, `/` stays a path
 * separator (channel/title). When false, segments are joined with `-` so Chrome
 * does not create a channel subdirectory. Flattened names use `--` (uploader--title).
 */
function sanitizeDownloadFileName(rawName: string, fallback = 'video', keepChannelFolder = true) {
  const input = (rawName || '').replace(/\\/g, '/').replace(/\s+/g, ' ').trim();
  if (!input) return fallback;

  const sanitizeSegment = (segment: string) => {
    // eslint(no-control-regex): avoid control char ranges in regex; strip them by charCode instead
    let noControl = '';
    for (let i = 0; i < segment.length; i++) {
      const code = segment.charCodeAt(i);
      if (code >= 32) noControl += segment[i];
    }

    const withoutIllegal = noControl.replace(/[<>:"/\\|?*]/g, '_');
    const noTrailing = withoutIllegal.replace(/[.\s]+$/g, '').trim();
    const normalized = noTrailing.replace(/_+/g, '_').trim();
    if (!normalized || normalized === '.' || normalized === '..') return '';

    const MAX_LEN = 120;
    if (normalized.length <= MAX_LEN) return normalized;
    return (
      normalized
        .slice(0, MAX_LEN)
        .replace(/[.\s]+$/g, '')
        .trim() || ''
    );
  };

  const parts = input
    .split('/')
    .map(p => sanitizeSegment(p.trim()))
    .filter(Boolean);
  return parts.join(keepChannelFolder ? '/' : '--') || fallback;
}

const Popup = () => {
  const [videoInfos, setvideoInfos] = useState<Array<VideoInfo>>([]);
  const [remoteVersion, setRemoteVersion] = useState('0.0.0');
  const { toasts, showSuccess, showError, showInfo, showWarning, removeToast } = useToast();

  // M3U8 download UI state
  const [fileName, setFileName] = useState('');
  // const [isGetMP4] = useState(false);
  const [queueTasks, setQueueTasks] = useState<DownloadTask[]>(downloadQueueStorage.getSnapshot()?.tasks || []);
  const m3u8SectionRef = useRef<HTMLDivElement | null>(null);
  const [currentTabUrl, setCurrentTabUrl] = useState('');
  const [downloadHistory, setDownloadHistory] = useState<DownloadRecord[]>([]);
  const [pageTitle, setPageTitle] = useState('');
  const [currentTabTitle, setCurrentTabTitle] = useState('');
  const [locale, setLocale] = useState<SupportedLocale>(getCurrentLocale());
  const [localSubdir, setLocalSubdir] = useState('');
  const [useChannelFolder, setUseChannelFolder] = useState(true);
  const [maxMissingPercent, setMaxMissingPercent] = useState(10);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportingTasks, setExportingTasks] = useState<string[]>([]);
  const useChannelFolderRef = useRef(true);
  const getPageTitle = () => videoInfos[0]?.title || pageTitle || currentTabTitle || '';
  const [isEditingFileName, setIsEditingFileName] = useState(false);
  const fileNameEditableRef = useRef<HTMLDivElement | null>(null);
  const hasUserEditedFileNameRef = useRef(false);
  // Prefer sniffer title (uploader/title) over the tab title unless the user edited the field
  const rawDisplayName = hasUserEditedFileNameRef.current ? fileName : getPageTitle() || fileName;
  const displayFileName = sanitizeDownloadFileName(rawDisplayName || '', '', useChannelFolder);

  /** Persist sanitized subdirectory under Chrome's default downloads folder. */
  const commitSubdir = async (value = localSubdir) => {
    const cleaned = sanitizeDownloadSubdir(value);
    const saved = await downloadSettingsStorage.setDownloadSubdir(cleaned);
    setLocalSubdir(saved);
    return saved;
  };

  /**
   * Apply a persisted channel-folder preference and refresh the auto filename preview.
   * Manual edits stay as-is except `/` is flattened when the option turns off.
   */
  const applyChannelFolderSetting = (keepFolder: boolean) => {
    useChannelFolderRef.current = keepFolder;
    setUseChannelFolder(keepFolder);

    let nextName = '';
    if (hasUserEditedFileNameRef.current) {
      if (!keepFolder) {
        nextName = sanitizeDownloadFileName(fileName, '', false);
      }
    } else {
      const source = getPageTitle() || fileName;
      nextName = sanitizeDownloadFileName(source, '', keepFolder);
    }
    if (!nextName) return;
    setFileName(nextName);
    const el = fileNameEditableRef.current;
    if (el && el.innerText !== nextName) {
      el.innerText = nextName;
    }
  };

  /** Set the auto filename from a page/tab title unless the user already edited it. */
  const setDefaultFileName = (nextName: string) => {
    const next = sanitizeDownloadFileName(nextName, '', useChannelFolderRef.current);
    if (!next) return;
    if (hasUserEditedFileNameRef.current) return;
    if (isEditingFileName) return;

    // Only update React state; contentEditable DOM is synced in useLayoutEffect
    setFileName(prev => (prev === next ? prev : next));
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
    const unsubscribeLocale = subscribeLocaleChange(nextLocale => {
      setLocale(nextLocale);
    });

    // Init queue (wait queue also restored from local storage)
    downloadQueueStorage.get().then(state => {
      setQueueTasks(state.tasks || []);
    });

    // Current tab URL & title for headers and default filename
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const activeTab = tabs[0];
      if (activeTab?.url) {
        setCurrentTabUrl(activeTab.url);
      }
      if (activeTab?.title) {
        setCurrentTabTitle(activeTab.title);
        // On popup open: default filename from tab title (content script pageTitle may refresh later)
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
        // Pornhub uses "uploader/title"; Xvideos uses "uploader--title". Compare the title segment to the tab.
        const titleBasename = (name: string) => {
          const slashParts = name.replace(/\\/g, '/').split('/').filter(Boolean);
          const afterSlash = (slashParts[slashParts.length - 1] || name).trim();
          const dashIdx = afterSlash.indexOf('--');
          if (dashIdx >= 0) {
            return afterSlash.slice(dashIdx + 2).trim() || afterSlash;
          }
          return afterSlash;
        };
        const firstBase = titleBasename(firstVideoTitle);

        const pageMatchesTab = pageTitle && tabTitle && (tabTitle.includes(pageTitle) || pageTitle.includes(tabTitle));
        const firstMatchesTab = firstBase && tabTitle && (tabTitle.includes(firstBase) || firstBase.includes(tabTitle));
        const snifferHasUploader = firstVideoTitle.includes('/') || firstVideoTitle.includes('--');

        if (firstVideoTitle && (firstMatchesTab || snifferHasUploader)) {
          // Prefer uploader/title from site sniffer when it looks like the current video
          setDefaultFileName(firstVideoTitle);
        } else if (pageMatchesTab && pageTitle) {
          setDefaultFileName(pageTitle);
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

    // Subscribe to queue storage changes (liveUpdate sync)
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

    // Load download subdirectory / channel-folder settings & subscribe
    downloadSettingsStorage.get().then(settings => {
      setLocalSubdir(settings.downloadSubdir ?? '');
      setMaxMissingPercent(getMaxMissingPercent(settings));
      const keepFolder = isUseChannelFolderEnabled(settings);
      useChannelFolderRef.current = keepFolder;
      setUseChannelFolder(keepFolder);
      if (!keepFolder) {
        setFileName(prev => sanitizeDownloadFileName(prev, '', false));
      }
    });
    const unsubSettings = downloadSettingsStorage.subscribe(() => {
      const snap = downloadSettingsStorage.getSnapshot();
      if (!snap) return;
      setLocalSubdir(snap.downloadSubdir ?? '');
      setMaxMissingPercent(getMaxMissingPercent(snap));
      const keepFolder = isUseChannelFolderEnabled(snap);
      if (keepFolder === useChannelFolderRef.current) return;
      useChannelFolderRef.current = keepFolder;
      setUseChannelFolder(keepFolder);
      if (!keepFolder) {
        setFileName(prev => sanitizeDownloadFileName(prev, '', false));
      }
    });

    // Background messages (complete, error, etc.)
    const messageListener = (message: any) => {
      if (message.type === 'download-task-complete') {
        if (message.partial) {
          showWarning(translate('toastPartialComplete', String(message.missingSegments || 0)));
        } else {
          showSuccess(translate('toastDownloadComplete', message.fileName || translate('taskUnknownFile')));
        }
      } else if (message.type === 'download-task-error') {
        showError(translate('toastDownloadFailed', message.error || translate('taskFailedUnknown')));
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Trigger your effect
    return () => {
      unsubQueue();
      unsubHistory();
      unsubSettings();
      chrome.runtime.onMessage.removeListener(messageListener);
      unsubscribeLocale();
    };
  }, []);

  useEffect(() => {
    document.title = translate('popupTitle');
  }, [locale]);

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

  /** Block enqueue when same URL is queued/downloading/paused (error tasks may retry) */
  const findBlockingTaskForUrl = (videoUrl: string): DownloadTask | undefined => {
    return queueTasks.find(t => {
      if (t.url !== videoUrl) return false;
      const s: DownloadTaskStatus = t.status;
      return s === 'queued' || s === 'downloading' || s === 'paused';
    });
  };

  const onDownload = (videoInfo: VideoInfo) => async () => {
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

    // Ensure subdirectory is persisted before background reads it
    await commitSubdir();

    const sourceName = hasUserEditedFileNameRef.current
      ? fileName || getPageTitle() || videoInfo.title
      : getPageTitle() || fileName || videoInfo.title || 'video';
    const finalFileName = sanitizeDownloadFileName(sourceName || 'video', 'video', useChannelFolderRef.current);
    setFileName(finalFileName);
    scrollToM3u8Section();

    chrome.runtime
      .sendMessage({
        type: 'download-queue-enqueue',
        url: videoInfo.videoUrl,
        fileName: finalFileName || undefined,
        format: videoInfo.format,
        quality: videoInfo.quality,
        pageUrl: currentTabUrl || undefined,
        headers: {
          ...buildM3u8Headers(),
          ...(videoInfo.headers || {}),
        },
        fallbackUrls: videoInfo.fallbackUrls,
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

  const onCopy = (videoInfo: VideoInfo) => () => handleCopyTaskLink(videoInfo.videoUrl);

  // // Legacy M3U8 download handlers (removed)
  // const handleStartDownload = () => {
  //   if (!m3u8Url.trim()) {
  //     showWarning('请输入 M3U8 链接');
  //     return;
  //   }

  //   const fallbackName = (fileName || getPageTitle() || 'video').trim();
  //   setFileName(fallbackName);

  //   // Enqueue (attach Origin & Referer from current tab)
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

  const handleSavePartial = async (taskId: string) => {
    if (exportingTasks.includes(taskId)) return;
    setExportingTasks(ids => [...ids, taskId]);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'download-queue-save-partial', taskId });
      if (!response?.success) throw new Error(response?.error || translate('toastBackgroundNotReachable'));
      showInfo(translate('toastPartialSaving'));
    } catch (error: any) {
      showError(translate('toastPartialFailed', error?.message || translate('taskFailedUnknown')));
    } finally {
      setExportingTasks(ids => ids.filter(id => id !== taskId));
    }
  };

  const handleCopyTaskLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showSuccess(translate('toastLinkCopied'));
    } catch {
      showError(translate('toastCopyFailed'));
    }
  };

  const handleFileNameFocus = () => {
    setIsEditingFileName(true);
  };

  /** Persist the edited filename, applying the current channel-folder join rule. */
  const handleFileNameBlur = () => {
    setIsEditingFileName(false);
    const value = fileNameEditableRef.current?.innerText || '';
    const cleaned = sanitizeDownloadFileName(value, '', useChannelFolderRef.current);
    setFileName(cleaned);
    if (fileNameEditableRef.current) fileNameEditableRef.current.innerText = cleaned;
    hasUserEditedFileNameRef.current = true;
  };

  /** Toggle whether auto filenames keep `channel/title` as a nested folder. */
  const handleChannelFolderToggle = () => {
    const next = !useChannelFolderRef.current;
    applyChannelFolderSetting(next);
    void downloadSettingsStorage.setUseChannelFolder(next);
  };

  // Open download item for a history record (chrome.downloads API)
  const handleOpenHistoryItem = (record: DownloadRecord) => {
    chrome.runtime.sendMessage({
      type: 'open-download-item',
      url: record.url,
      fileName: record.fileName,
    });
  };

  /** Open the source page for a history record in a new tab. */
  const handleOpenHistoryPage = (pageUrl: string) => {
    try {
      const parsed = new URL(pageUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      chrome.tabs.create({ url: pageUrl });
    } catch {
      // ignore invalid URL
    }
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
    <div className="App">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="popup-scroll">
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
              {isNewerVersion(remoteVersion, manifestData.version) && (
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
          <select
            className="popup-lang-select"
            title="Choose language"
            value={locale}
            onChange={event => setCurrentLocale((event.currentTarget as HTMLSelectElement).value as SupportedLocale)}>
            {SUPPORTED_LOCALES.map(item => (
              <option key={item} value={item}>
                {LOCALE_LABELS[item]}
              </option>
            ))}
          </select>
        </div>
        <div className="box">
          {videoInfos?.length > 0 && (
            <div className="m3u8-filename-row">
              <div className="filename-heading">
                <span className="m3u8-filename-label" id="download-filename-label">
                  {translate('popupFilenameLabel')}
                </span>
                <span className="filename-edit-hint">{translate('popupFilenameEditHint')}</span>
              </div>
              <div
                ref={fileNameEditableRef}
                role="textbox"
                tabIndex={0}
                aria-labelledby="download-filename-label"
                aria-multiline="false"
                title={displayFileName}
                className={`m3u8-filename-display${isEditingFileName ? ' editing' : ''}`}
                contentEditable={true}
                onFocus={handleFileNameFocus}
                onBlur={handleFileNameBlur}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.isComposing) {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                data-placeholder={translate('popupFilenamePlaceholder')}
              />
            </div>
          )}
          <div className={`save-settings${settingsOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="settings-summary"
              aria-label={translate('popupDownloadSettings')}
              aria-describedby="settings-path-summary settings-tolerance-summary"
              aria-expanded={settingsOpen}
              aria-controls="download-settings-panel"
              onClick={() => setSettingsOpen(open => !open)}>
              <svg
                className="settings-symbol"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true">
                <path d="M4 7h7m4 0h5M4 17h3m4 0h9" />
                <circle cx="13" cy="7" r="2" />
                <circle cx="9" cy="17" r="2" />
              </svg>
              <span className="settings-summary-label">{translate('popupDownloadSettings')}</span>
              <span
                id="settings-path-summary"
                className="settings-summary-path"
                title={localSubdir || translate('popupDefaultFolder')}>
                {localSubdir || translate('popupDefaultFolder')}
              </span>
              <span id="settings-tolerance-summary" className="settings-summary-tolerance">
                {maxMissingPercent
                  ? translate('popupToleranceSummary', String(maxMissingPercent))
                  : translate('popupStrictSummary')}
              </span>
              <svg
                className="settings-chevron"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true">
                <path d="m7 10 5 5 5-5" />
              </svg>
            </button>
            <div id="download-settings-panel" className="settings-panel" hidden={!settingsOpen}>
              <div className="download-subdir-row">
                <label className="download-subdir-label" htmlFor="ph-download-subdir">
                  {translate('downloadSubdirLabel')}
                </label>
                <input
                  id="ph-download-subdir"
                  type="text"
                  className="download-subdir-input"
                  value={localSubdir}
                  placeholder={translate('downloadSubdirPlaceholder')}
                  onInput={event => setLocalSubdir(event.currentTarget.value)}
                  onBlur={event => {
                    commitSubdir(event.currentTarget.value).catch(() => showError(translate('toastSettingsFailed')));
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  // Preact's input types use the DOM attribute name, not React's spellCheck.
                  // eslint-disable-next-line react/no-unknown-property
                  spellcheck={false}
                  autoComplete="off"
                />
              </div>
              <div className="channel-folder-row">
                <div className="channel-folder-copy">
                  <span className="channel-folder-label">{translate('channelFolderLabel')}</span>
                  <span className="channel-folder-hint">{translate('channelFolderHint')}</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  role="switch"
                  aria-checked={useChannelFolder}
                  aria-label={translate('channelFolderLabel')}
                  title={translate('channelFolderHint')}
                  onClick={handleChannelFolderToggle}>
                  <span className="toggle-switch-thumb" />
                </button>
              </div>
              <div className="tolerance-setting-row">
                <div className="channel-folder-copy">
                  <label className="channel-folder-label" htmlFor="download-missing-tolerance">
                    {translate('downloadToleranceLabel')}
                  </label>
                  <span className="channel-folder-hint" id="download-tolerance-hint">
                    {translate('downloadToleranceHint')}
                  </span>
                </div>
                <select
                  id="download-missing-tolerance"
                  className="tolerance-select"
                  value={maxMissingPercent}
                  aria-describedby="download-tolerance-hint"
                  onChange={async event => {
                    const value = Number(event.currentTarget.value);
                    try {
                      const saved = await downloadSettingsStorage.setMaxMissingPercent(value);
                      setMaxMissingPercent(saved);
                    } catch {
                      showError(translate('toastSettingsFailed'));
                    }
                  }}>
                  {[0, 1, 5, 10].map(value => (
                    <option key={value} value={value}>
                      {value ? `${value}%` : translate('downloadToleranceStrict')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {videoInfos.length > 0 && (
            <div className="resource-heading">
              <span>{translate('popupChooseQuality')}</span>
              <span className="resource-count">{translate('popupQualityCount', String(videoInfos.length))}</span>
            </div>
          )}
          {videoInfos.length === 0 && (
            <div className="resource-empty" role="status">
              <p className="resource-empty-title">{translate('popupNoResources')}</p>
              <p>{translate('popupNoResourcesHint')}</p>
            </div>
          )}
          <ul className="video-resources">
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
                  <li key={item.videoUrl} className={`video-resource${downloadBusy ? ' is-busy' : ''}`}>
                    <div className="video-resource-info">
                      <span className="video-resource-quality">{item.quality}</span>
                      <span className="video-resource-format" data-format={item.format}>
                        {item.format.toUpperCase()}
                      </span>
                    </div>
                    <div className="video-resource-actions">
                      <button
                        type="button"
                        className="resource-download"
                        aria-label={`${downloadLabel} ${item.quality}`}
                        disabled={downloadBusy}
                        title={
                          downloadBusy ? translate('popupTooltipAlreadyInQueue') : translate('popupTooltipAddToQueue')
                        }
                        onClick={onDownload(item)}>
                        <span className="resource-action-label">{downloadLabel}</span>
                      </button>
                      <button
                        type="button"
                        className="resource-copy"
                        aria-label={`${translate('popupActionCopy')} ${item.quality}`}
                        onClick={onCopy(item)}>
                        <span className="resource-action-label">{translate('popupActionCopy')}</span>
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
        {/* Download queue section */}
        {queueTasks.length > 0 && (
          <div className="m3u8-download-section" ref={m3u8SectionRef}>
            <div className="queue-header">
              <div className="queue-heading-group">
                <span className="queue-title">{translate('queueTitle')}</span>
                <span className="queue-limit">{translate('queueConcurrency')}</span>
              </div>
              <span className="queue-meta">
                {translate('queueMetaDownloading', String(queueTasks.filter(t => t.status === 'downloading').length))} /{' '}
                {translate('queueMetaQueued', String(queueTasks.filter(t => t.status === 'queued').length))} /{' '}
                {translate('queueMetaPaused', String(queueTasks.filter(t => t.status === 'paused').length))}
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
                  return (
                    <DownloadTaskCard
                      key={task.id}
                      task={task}
                      queuedIndex={queuedIndex}
                      isExporting={exportingTasks.includes(task.id)}
                      onPause={handlePauseTask}
                      onResume={handleResumeTask}
                      onDelete={handleDeleteTask}
                      onSavePartial={handleSavePartial}
                      onCopy={handleCopyTaskLink}
                    />
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
                  <div className="history-item-body">
                    {record.pageUrl ? (
                      <button
                        type="button"
                        className="history-filename history-filename-link"
                        title={`${translate('historyTooltipOpenPage')}\n${record.pageUrl}`}
                        onClick={() => handleOpenHistoryPage(record.pageUrl!)}>
                        {record.fileName}
                      </button>
                    ) : (
                      <span className="history-filename" title={record.fileName}>
                        {record.fileName}
                      </span>
                    )}
                    <span className="history-time">
                      {new Date(record.completedAt).toLocaleDateString()}
                      {record.partial && (
                        <span className="history-partial">
                          {translate('historyPartial', String(record.missingSegments || 0))}
                        </span>
                      )}
                    </span>
                  </div>
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
      {/* Always-visible GitHub star / bug actions; content scrolls above this bar */}
      <div className="popup-support-bar">
        <a className="popup-support-btn popup-support-btn-star" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
          {translate('popupSupportStar')}
        </a>
        <a
          className="popup-support-btn popup-support-btn-bug"
          href={GITHUB_NEW_ISSUE_URL}
          target="_blank"
          rel="noreferrer">
          {translate('popupSupportBug')}
        </a>
      </div>
    </div>
  );
};

function sendMessageToContentScript(message, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    // Send message to the active tab
    // console.log('popup send')
    chrome.tabs.sendMessage(tabs[0].id, message, function (response) {
      // console.log(response);
      if (callback) callback(response);
      return true;
    });
  });
}

export default Popup;
