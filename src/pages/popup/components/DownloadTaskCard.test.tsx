import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DownloadTask } from '@src/shared/storages/downloadQueueStorage';
import DownloadTaskCard from './DownloadTaskCard';

const task: DownloadTask = {
  id: 'download-1',
  fileName: 'Example video',
  url: 'https://media.example/video.m3u8',
  headers: { referer: 'https://example.test/watch/1' },
  format: 'm3u8',
  status: 'downloading',
  createdAt: 1,
  progress: 99.75,
  finishNum: 403,
  targetSegment: 404,
  errorNum: 1,
};

const callbacks = () => ({
  onPause: vi.fn(),
  onResume: vi.fn(),
  onDelete: vi.fn(),
  onSavePartial: vi.fn(),
  onCopy: vi.fn(),
});
afterEach(cleanup);

describe('download task recovery controls', () => {
  it('saves the actual task and keeps pause visible while downloading', () => {
    const actions = callbacks();
    const view = render(<DownloadTaskCard task={task} {...actions} />);
    fireEvent.click(view.getByRole('button', { name: 'Save downloaded part' }));
    expect(actions.onSavePartial).toHaveBeenCalledWith(task.id);
    fireEvent.click(view.getByRole('button', { name: 'Pause' }));
    expect(actions.onPause).toHaveBeenCalledWith(task.id);
    expect(view.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('99.75');
    expect(view.getByText('Completed: 403 / 404')).toBeTruthy();
  });

  it('copies page and resource URLs, dismisses disclosure, and restores focus on Escape', () => {
    const actions = callbacks();
    const view = render(<DownloadTaskCard task={task} {...actions} />);
    const more = view.getByRole('button', { name: 'More actions' });
    fireEvent.click(more);
    fireEvent.click(view.getByRole('button', { name: 'Copy source page URL' }));
    expect(actions.onCopy).toHaveBeenLastCalledWith('https://example.test/watch/1');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
    fireEvent.click(more);
    fireEvent.click(view.getByRole('button', { name: 'Copy resource URL' }));
    expect(actions.onCopy).toHaveBeenLastCalledWith(task.url);
    fireEvent.click(more);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
  });

  it('offers retry after exhaustion but only save retry after a partial file has been prepared', () => {
    const actions = callbacks();
    const stalled = { ...task, status: 'paused' as const, retriesExhausted: true };
    const view = render(<DownloadTaskCard task={stalled} {...actions} />);
    expect(view.getByText('Needs attention')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Resume' }));
    expect(actions.onResume).toHaveBeenCalledWith(task.id);
    view.rerender(<DownloadTaskCard task={{ ...stalled, partialExport: true }} {...actions} />);
    expect(view.queryByRole('button', { name: 'Resume' })).toBeNull();
    expect(view.getByRole('button', { name: 'Save downloaded part' })).toBeTruthy();
  });

  it('prevents pause, repeated export, and deletion while the save is in progress', () => {
    const view = render(<DownloadTaskCard task={task} isExporting {...callbacks()} />);
    expect(view.queryByRole('button', { name: 'Save downloaded part' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Pause' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'More actions' }));
    expect((view.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a paused export failure visible when the popup is reopened', () => {
    const view = render(
      <DownloadTaskCard
        task={{ ...task, status: 'paused', partialExport: true, error: 'Disk unavailable' }}
        {...callbacks()}
      />,
    );
    expect(view.getByText('Failed: Disk unavailable')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Save downloaded part' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Resume' })).toBeNull();
  });

  it('does not offer an empty or single-file export and disables missing page URLs', () => {
    const view = render(<DownloadTaskCard task={{ ...task, finishNum: 0, headers: undefined }} {...callbacks()} />);
    expect(view.queryByRole('button', { name: 'Save downloaded part' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'More actions' }));
    expect((view.getByRole('button', { name: 'Copy source page URL' }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<DownloadTaskCard task={{ ...task, format: 'mp4' }} {...callbacks()} />);
    expect(view.queryByRole('button', { name: 'Save downloaded part' })).toBeNull();
  });
});
