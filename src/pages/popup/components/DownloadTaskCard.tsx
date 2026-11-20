import { useEffect, useRef, useState } from 'preact/hooks';
import type { DownloadTask } from '@src/shared/storages/downloadQueueStorage';
import { translate } from '@src/chrome/i18n';

type Props = {
  task: DownloadTask;
  queuedIndex?: number;
  isExporting?: boolean;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onSavePartial: (id: string) => void;
  onCopy: (url: string) => void;
};

/** Recovery actions remain visible; less frequent link and delete actions use a disclosure. */
export default function DownloadTaskCard({
  task,
  queuedIndex = 0,
  isExporting = false,
  onPause,
  onResume,
  onDelete,
  onSavePartial,
  onCopy,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const pageUrl =
    task.pageUrl || Object.entries(task.headers || {}).find(([key]) => key.toLowerCase() === 'referer')?.[1];
  const isSaving = !!task.isFileDownloading || isExporting;
  const canSave = task.format === 'm3u8' && task.finishNum > 0 && !isSaving && task.status !== 'queued';
  const progress = Number.isFinite(task.progress) ? Math.min(100, Math.max(0, task.progress)) : 0;
  const status = isSaving
    ? translate('fileSaving')
    : task.retriesExhausted
      ? translate('taskStatusNeedsAttention')
      : task.status === 'queued'
        ? translate('taskStatusWaiting', queuedIndex ? ` (#${queuedIndex})` : '')
        : task.status === 'paused'
          ? translate('taskStatusPaused')
          : task.status === 'error'
            ? translate('taskStatusFailed')
            : translate('taskStatusDownloading');

  useEffect(() => {
    if (!moreOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        moreRef.current?.focus();
      }
    };
    document.addEventListener('click', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreOpen]);

  const copyLink = (url: string) => {
    setMoreOpen(false);
    moreRef.current?.focus();
    onCopy(url);
  };

  return (
    <article className={`task-card status-${task.status}${task.retriesExhausted ? ' needs-attention' : ''}`}>
      <div className="task-heading">
        <div className="task-identity">
          <div className="m3u8-filename-show" title={task.fileName || translate('taskUnknownFile')}>
            {task.fileName || translate('taskUnknownFile')}
          </div>
          <div className="task-detail-meta">
            {task.quality && <span>{task.quality}</span>}
            <span>{task.format.toUpperCase()}</span>
            {task.targetSegment > 0 && (
              <span>{translate('taskCompletedSegments', [String(task.finishNum), String(task.targetSegment)])}</span>
            )}
          </div>
        </div>
        <div className="task-more" ref={menuRef}>
          <button
            type="button"
            ref={moreRef}
            className="btn-sm task-more-trigger"
            aria-label={translate('taskActionMore')}
            aria-expanded={moreOpen}
            aria-controls={`task-more-${task.id}`}
            onClick={() => setMoreOpen(open => !open)}>
            <span aria-hidden="true">⋯</span>
          </button>
          {moreOpen && (
            <div className="task-more-panel" id={`task-more-${task.id}`}>
              <button type="button" disabled={!pageUrl} onClick={() => pageUrl && copyLink(pageUrl)}>
                {translate('taskActionCopyPage')}
              </button>
              <button type="button" onClick={() => copyLink(task.url)}>
                {translate('taskActionCopyResource')}
              </button>
              <button
                type="button"
                className="task-menu-delete"
                disabled={isSaving}
                onClick={() => {
                  setMoreOpen(false);
                  onDelete(task.id);
                }}>
                {translate('taskActionDelete')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="task-progress-summary">
        <span className="task-status">{status}</span>
        <span className="task-progress-value">{progress.toFixed(2)}%</span>
      </div>
      <div
        className="progress-bar"
        role="progressbar"
        aria-label={translate('taskProgressLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}>
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="task-transfer-meta">
        {task.status === 'downloading' && !isSaving && <span>{translate('taskSpeed', task.downloadSpeed || '—')}</span>}
        {task.errorNum > 0 && !isSaving && (
          <span className="task-failed-count">{translate('taskErrorCount', String(task.errorNum))}</span>
        )}
        {!!task.retryAttempt && task.errorNum > 0 && !task.retriesExhausted && !isSaving && (
          <span>
            {translate('taskRetryAttempt', [String(task.retryAttempt), String(task.maxSegmentAttempts || 4)])}
          </span>
        )}
      </div>

      {task.error || task.status === 'error' ? (
        <p className="task-recovery-note">
          {translate('taskFailedReason', task.error || translate('taskFailedUnknown'))}
        </p>
      ) : task.retriesExhausted ? (
        <p className="task-recovery-note">{translate('taskRetriesExhaustedHint')}</p>
      ) : null}
      {task.partialExport && isSaving && (
        <p className="task-recovery-note">{translate('taskPartialSavingHint', String(task.missingSegments || 0))}</p>
      )}

      {(canSave ||
        ((task.status === 'downloading' || task.status === 'paused') && !isSaving && !task.partialExport)) && (
        <div className="task-action-row">
          {canSave && (
            <button
              type="button"
              className="btn-sm btn-save-partial"
              onClick={() => onSavePartial(task.id)}
              title={translate('taskSavePartialHint')}>
              {translate('taskActionSavePartial')}
            </button>
          )}
          {task.status === 'downloading' && !isSaving && (
            <button type="button" className="btn-sm btn-secondary" onClick={() => onPause(task.id)}>
              {translate('taskActionPause')}
            </button>
          )}
          {task.status === 'paused' && !isSaving && !task.partialExport && (
            <button type="button" className="btn-sm btn-primary" onClick={() => onResume(task.id)}>
              {translate('taskActionResume')}
            </button>
          )}
        </div>
      )}
      {canSave && <p className="task-partial-hint">{translate('taskSavePartialHint')}</p>}
    </article>
  );
}
