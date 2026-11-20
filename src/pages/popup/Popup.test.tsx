import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Retry a query or assertion until it stops throwing.
 * @testing-library/preact re-exports waitFor, but eslint cannot see that export.
 */
async function waitFor<T>(assertion: () => T | Promise<T>): Promise<T> {
  const deadline = Date.now() + 1000;
  let lastError: unknown;
  while (Date.now() <= deadline) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await new Promise(resolve => {
        setTimeout(resolve, 15);
      });
    }
  }
  throw lastError;
}

const fixture = vi.hoisted(() => {
  const task = {
    id: 'task-1',
    url: 'https://media.example.test/video.m3u8',
    pageUrl: 'https://example.test/watch',
    fileName: 'Test video',
    format: 'm3u8',
    status: 'paused',
    retriesExhausted: true,
    createdAt: 1,
    progress: 99,
    finishNum: 99,
    targetSegment: 100,
    errorNum: 1,
  };
  const settings = { downloadSubdir: '', useChannelFolder: true, maxMissingPercent: 10 };
  const subscribe = () => () => {};
  return {
    videoInfos: [] as Array<{ videoUrl: string; quality: string; format: 'm3u8'; title: string }>,
    settingsValue: settings,
    queue: { get: vi.fn(async () => ({ tasks: [task] })), getSnapshot: () => ({ tasks: [task] }), subscribe },
    history: { get: async () => ({ records: [] }), getSnapshot: () => ({ records: [] }), subscribe },
    settings: {
      get: async () => settings,
      getSnapshot: () => settings,
      subscribe,
      setDownloadSubdir: vi.fn(async (value: string) => {
        settings.downloadSubdir = value;
        return value;
      }),
      setMaxMissingPercent: vi.fn(async (value: number) => {
        settings.maxMissingPercent = value;
        return value;
      }),
    },
    sendMessage: vi.fn(async () => ({ success: true })),
  };
});

vi.mock('@src/shared/storages/downloadQueueStorage', () => ({ default: fixture.queue }));
vi.mock('@src/shared/storages/downloadHistoryStorage', () => ({ default: fixture.history }));
vi.mock('@src/shared/storages/downloadSettingsStorage', () => ({
  default: fixture.settings,
  isUseChannelFolderEnabled: () => true,
  getMaxMissingPercent: (settings: { maxMissingPercent: number }) => settings.maxMissingPercent,
  sanitizeDownloadSubdir: (value: string) => value,
}));

beforeEach(() => {
  fixture.videoInfos = [];
  Object.assign(fixture.settingsValue, { downloadSubdir: '', useChannelFolder: true, maxMissingPercent: 10 });
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ version: '1.6.2' }),
      sendMessage: fixture.sendMessage,
      onMessage: { addListener() {}, removeListener() {} },
    },
    tabs: {
      query: (_query: unknown, callback: (tabs: unknown[]) => void) =>
        callback([{ id: 1, title: 'Test video', url: 'https://example.test/watch' }]),
      sendMessage: (_id: unknown, _message: unknown, callback: (data: unknown) => void) =>
        callback({ videoInfos: fixture.videoInfos }),
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => ({ version: '1.6.1' }) })),
  );
  fixture.sendMessage.mockReset().mockResolvedValue({ success: true });
  fixture.settings.setDownloadSubdir.mockClear();
  fixture.settings.setMaxMissingPercent.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('popup recovery integration', () => {
  it('sends the partial save request and reports a rejected export without claiming success', async () => {
    const { default: Popup } = await import('./Popup');
    fixture.sendMessage.mockResolvedValueOnce({ success: false, error: 'Disk unavailable' } as never);
    const view = render(<Popup />);
    await waitFor(() => view.getByRole('button', { name: 'Save downloaded part' }));
    fireEvent.click(view.getByRole('button', { name: 'Save downloaded part' }));
    await waitFor(() =>
      expect(fixture.sendMessage).toHaveBeenCalledWith({ type: 'download-queue-save-partial', taskId: 'task-1' }),
    );
    await waitFor(() => view.getByText('Save failed: Disk unavailable'));
    expect(view.queryByText('Saving the downloaded part')).toBeNull();
  });

  it('persists strict tolerance and only shows release notices for upgrades', async () => {
    const { default: Popup } = await import('./Popup');
    const view = render(<Popup />);
    const settingsButton = view.getByRole('button', { name: 'Download settings' });
    expect(settingsButton.getAttribute('aria-expanded')).toBe('false');
    expect(view.queryByRole('combobox', { name: 'Allowed missing segments' })).toBeNull();
    expect(view.queryByRole('textbox', { name: 'Download subdirectory' })).toBeNull();
    fireEvent.click(settingsButton);
    const select = await waitFor(() => view.getByRole('combobox', { name: 'Allowed missing segments' }));
    fireEvent.change(select, { target: { value: '0' } });
    await waitFor(() => expect(fixture.settings.setMaxMissingPercent).toHaveBeenCalledWith(0));
    expect(view.queryByText('New version 1.6.1')).toBeNull();
  });

  it('keeps the saved directory visible in the collapsed summary and restores it when reopened', async () => {
    const { default: Popup } = await import('./Popup');
    const view = render(<Popup />);
    const settingsButton = view.getByRole('button', { name: 'Download settings' });
    fireEvent.click(settingsButton);
    const directory = await waitFor(() => view.getByRole('textbox', { name: 'Download subdirectory' }));
    fireEvent.input(directory, { target: { value: 'Travel/2026' } });
    fireEvent.blur(directory);
    await waitFor(() => expect(fixture.settings.setDownloadSubdir).toHaveBeenCalledWith('Travel/2026'));
    fireEvent.click(settingsButton);
    expect(settingsButton.getAttribute('aria-expanded')).toBe('false');
    expect(settingsButton.textContent).toContain('Travel/2026');
    expect(view.queryByRole('textbox', { name: 'Download subdirectory' })).toBeNull();
    fireEvent.click(settingsButton);
    expect((view.getByRole('textbox', { name: 'Download subdirectory' }) as HTMLInputElement).value).toBe(
      'Travel/2026',
    );
  });

  it.each(['blur', 'Enter'] as const)(
    'saves the latest directory draft on immediate %s before rerender',
    async submit => {
      fixture.settingsValue.downloadSubdir = 'myvideos';
      const { default: Popup } = await import('./Popup');
      const view = render(<Popup />);
      fireEvent.click(view.getByRole('button', { name: 'Download settings' }));
      const directory = view.getByRole('textbox', { name: 'Download subdirectory' }) as HTMLInputElement;
      await waitFor(() => expect(directory.value).toBe('myvideos'));
      act(() => directory.focus());
      act(() => {
        fireEvent.input(directory, { target: { value: 'Archive/Travel' } });
        if (submit === 'Enter') fireEvent.keyDown(directory, { key: 'Enter' });
        else fireEvent.blur(directory);
      });
      await waitFor(() => expect(fixture.settings.setDownloadSubdir).toHaveBeenLastCalledWith('Archive/Travel'));
      expect(fixture.settings.setDownloadSubdir).not.toHaveBeenCalledWith('myvideos');
      fireEvent.change(view.getByRole('combobox', { name: 'Allowed missing segments' }), { target: { value: '5' } });
      await waitFor(() => expect(fixture.settings.setMaxMissingPercent).toHaveBeenCalledWith(5));
      expect(directory.value).toBe('Archive/Travel');
      expect(fixture.settingsValue.downloadSubdir).toBe('Archive/Travel');
    },
  );

  it('commits a normalized filename with Enter and uses it for the chosen quality', async () => {
    fixture.videoInfos = [
      {
        videoUrl: 'https://media.example.test/720/video.m3u8',
        quality: '720p',
        format: 'm3u8',
        title: 'Test video',
      },
    ];
    const { default: Popup } = await import('./Popup');
    const view = render(<Popup />);
    const fileName = await waitFor(() => view.getByRole('textbox', { name: 'Filename (optional)' }));
    // JSDOM does not implement scrolling; the popup scroll target still exists in this integration fixture.
    view.container.querySelector('.m3u8-download-section')!.scrollIntoView = vi.fn();
    act(() => fileName.focus());
    fileName.innerText = '  My: film?   ';
    fireEvent.keyDown(fileName, { key: 'Enter' });
    await waitFor(() => expect(fileName.innerText).toBe('My_ film_'));
    expect(document.activeElement).not.toBe(fileName);
    fireEvent.click(view.getByRole('button', { name: 'Download 720p' }));
    await waitFor(() =>
      expect(fixture.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'download-queue-enqueue',
          url: 'https://media.example.test/720/video.m3u8',
          fileName: 'My_ film_',
          format: 'm3u8',
          quality: '720p',
          pageUrl: 'https://example.test/watch',
        }),
      ),
    );
  });
});
