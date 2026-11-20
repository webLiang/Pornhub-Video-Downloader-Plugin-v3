import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest';

/** Queue row kept by the download-queue storage mock. */
type TaskRecord = {
  id?: string;
  url?: string;
  fileName?: string;
  format?: string;
  status?: string;
  pageUrl?: string;
  progress?: number;
  finishNum?: number;
  targetSegment?: number;
  errorNum?: number;
  createdAt?: number;
  error?: string;
  opfsCacheFileName?: string;
  cachedSegments?: number;
  partialExport?: boolean;
  missingSegments?: number;
  isFileDownloading?: boolean;
  retriesExhausted?: boolean;
  retryAttempt?: number;
};

/** Progress payload the fake HLS runner reports to the background. */
type ProgressPayload = {
  progress: number;
  finishNum: number;
  targetSegment: number;
  errorNum: number;
  partial?: boolean;
  retriesExhausted?: boolean;
  retryAttempt?: number;
  maxSegmentAttempts?: number;
};

/** Callbacks the background passes into the HLS downloader. */
type RunnerOptions = {
  onProgress: (payload: ProgressPayload) => void;
  onError: (message: string) => void;
  onComplete: (payload: {
    fileName: string;
    partial?: boolean;
    missingSegments?: number;
    totalSegments?: number;
  }) => void;
};

/** Minimal HLS runner the background tests drive directly. */
type FakeRunner = {
  options: RunnerOptions;
  start: Mock;
  pauseSoft: Mock;
  resume: Mock;
  destroy: Mock;
  savePartial: Mock;
};

/** Runtime message accepted by the background listener. */
type QueueMessage = {
  type?: string;
  taskId?: string;
  url?: string;
  fileName?: string;
  format?: string;
  pageUrl?: string;
};

/** Reply the listener sends back to the popup. */
type MessageResult = {
  success?: boolean;
  id?: string;
  error?: string;
};

/** Chrome APIs the partial-export test patches after the background loads. */
type ChromeHarness = {
  offscreen: {
    Reason: { BLOBS: string };
    createDocument: Mock;
  };
  runtime: { sendMessage: Mock };
  downloads: {
    download: Mock;
    onChanged: { addListener: Mock };
  };
};

type MessageListener = (message: QueueMessage, sender: unknown, respond: (result: MessageResult) => void) => unknown;

const fixture = vi.hoisted(() => ({
  tasks: [] as TaskRecord[],
  runners: [] as FakeRunner[],
  listener: null as MessageListener | null,
  settings: { maxMissingPercent: 10 },
  container: 'ts',
  addRecord: vi.fn().mockResolvedValue(undefined),
  removeOpfs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('virtual:reload-on-update-in-background-script', () => ({ default: vi.fn() }));
vi.mock('webextension-polyfill', () => ({}));
vi.mock('./utils/dist/m3u8-downloader-core.obf', () => ({
  /** Records each constructed HLS downloader so tests can drive pause, resume, and partial save. */
  default: class {
    options: RunnerOptions;
    start = vi.fn();
    pauseSoft = vi.fn().mockResolvedValue(undefined);
    resume = vi.fn();
    destroy = vi.fn();
    savePartial = vi.fn().mockResolvedValue(undefined);
    constructor(options: RunnerOptions) {
      this.options = options;
      fixture.runners.push(this);
    }
  },
}));
vi.mock('./utils/dist/mp4-downloader.obf', () => ({ default: class {} }));
vi.mock('./utils/video-download-core/opfs-task-cache', () => ({
  opfsFileExists: vi.fn().mockResolvedValue(true),
  removeOpfsFileByName: fixture.removeOpfs,
  detectOpfsContainer: vi.fn(async () => fixture.container),
  getOpfsExportFormat: (container: string) =>
    container === 'mp4' ? { extension: 'mp4', mimeType: 'video/mp4' } : { extension: 'ts', mimeType: 'video/MP2T' },
}));
vi.mock('@src/shared/storages/m3u8DownloadStorage', () => ({ default: { get: vi.fn() } }));
vi.mock('@src/shared/storages/downloadHistoryStorage', () => ({ default: { addRecord: fixture.addRecord } }));
vi.mock('@src/shared/storages/downloadQueueStorage', () => ({
  default: {
    get: async () => ({ tasks: fixture.tasks }),
    enqueue: async (task: Partial<TaskRecord>) => {
      const id = `task-${fixture.tasks.length + 1}`;
      fixture.tasks.push({
        ...task,
        id,
        status: 'queued',
        createdAt: Date.now(),
        progress: 0,
        finishNum: 0,
        targetSegment: 0,
        errorNum: 0,
        opfsCacheFileName: `${id}.ts`,
      });
      return id;
    },
    updateTask: async (id: string, patch: Partial<TaskRecord>) => {
      fixture.tasks = fixture.tasks.map(task => (task.id === id ? { ...task, ...patch } : task));
    },
    removeTask: async (id: string) => {
      fixture.tasks = fixture.tasks.filter(task => task.id !== id);
    },
    clearQueued: vi.fn(),
    clearErrors: vi.fn(),
  },
}));
vi.mock('@src/shared/storages/downloadSettingsStorage', () => ({
  default: { get: async () => fixture.settings },
  getDownloadSubdir: async () => '',
  getMaxMissingPercent: (settings: { maxMissingPercent?: number } = fixture.settings) =>
    settings.maxMissingPercent ?? 10,
  withDownloadSubdir: (basename: string) => basename,
}));
vi.mock('@src/shared/utils/downloadFilenameFix', () => ({
  bindPendingDownloadId: vi.fn(),
  clearPendingBlobFilename: vi.fn(),
  setPendingBlobFilename: vi.fn(),
}));

/** Drain queued promise callbacks after a message or runner event. */
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

/**
 * Deliver one runtime message to the background listener.
 * @param input Queue message payload.
 * @returns The listener's reply, if it called the response callback.
 */
async function message(input: QueueMessage) {
  let result: MessageResult | undefined;
  fixture.listener!(input, {}, value => {
    result = value;
  });
  await flush();
  return result;
}

/** Enqueue one sample HLS task and return its id plus the constructed runner. */
async function enqueue() {
  const result = await message({
    type: 'download-queue-enqueue',
    url: 'https://cdn.example.test/video.m3u8',
    fileName: 'sample',
    format: 'm3u8',
    pageUrl: 'https://example.test/watch',
  });
  expect(result.success).toBe(true);
  await flush();
  return { id: result.id as string, runner: fixture.runners[0] };
}

beforeEach(async () => {
  vi.resetModules();
  fixture.tasks = [];
  fixture.runners = [];
  fixture.listener = null;
  fixture.settings = { maxMissingPercent: 10 };
  fixture.container = 'ts';
  fixture.addRecord.mockClear();
  fixture.removeOpfs.mockClear();
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: vi.fn(listener => {
          fixture.listener = listener;
        }),
      },
      sendMessage: vi.fn().mockResolvedValue({}),
    },
    downloads: {
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      search: vi.fn().mockResolvedValue([]),
    },
  });
  await import('./index');
  await flush();
});

describe('download queue recovery integration', () => {
  test('reports a failed pause as paused and retains its runner', async () => {
    const { id, runner } = await enqueue();
    runner.pauseSoft.mockRejectedValueOnce(new Error('Cannot commit cache'));
    expect((await message({ type: 'download-queue-pause', taskId: id }))?.success).toBe(false);
    expect(fixture.tasks[0]).toMatchObject({ status: 'paused', error: 'Cannot commit cache' });
    expect(runner.destroy).not.toHaveBeenCalled();
    expect((await message({ type: 'download-queue-resume', taskId: id }))?.success).toBe(true);
  });

  test('prevents resuming a prepared partial export after a failed save', async () => {
    const { id, runner } = await enqueue();
    runner.options.onProgress({ progress: 90, finishNum: 9, targetSegment: 10, errorNum: 1, partial: true });
    runner.options.onError('Save interrupted');
    await flush();
    expect((await message({ type: 'download-queue-resume', taskId: id }))?.success).toBe(false);
    expect(runner.resume).not.toHaveBeenCalled();
    expect((await message({ type: 'download-queue-save-partial', taskId: id }))?.success).toBe(true);
  });

  test('exports only committed segments after restart with the detected MP4 container and partial metadata', async () => {
    fixture.container = 'mp4';
    fixture.tasks.push({
      id: 'recovered',
      url: 'https://cdn.example.test/video.m3u8',
      fileName: 'sample',
      format: 'm3u8',
      status: 'paused',
      finishNum: 9,
      targetSegment: 10,
      cachedSegments: 2,
      opfsCacheFileName: 'recovered.ts',
      pageUrl: 'https://example.test/watch',
    });
    const chromeMock = chrome as unknown as ChromeHarness;
    chromeMock.offscreen = { Reason: { BLOBS: 'BLOBS' }, createDocument: vi.fn().mockResolvedValue(undefined) };
    chromeMock.runtime.sendMessage.mockResolvedValue({ ok: true, blobUrl: 'blob:recovered' });
    chromeMock.downloads.download = vi.fn((_options, callback) => callback(23));
    expect((await message({ type: 'download-queue-save-partial', taskId: 'recovered' }))?.success).toBe(true);
    await flush();
    expect(chromeMock.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'sample-partial.mp4' }),
      expect.any(Function),
    );
    expect(fixture.tasks[0]).toMatchObject({ partialExport: true, missingSegments: 8, isFileDownloading: true });
    chromeMock.downloads.onChanged.addListener.mock.calls.at(-1)[0]({ id: 23, state: { current: 'complete' } });
    await flush();
    expect(fixture.addRecord).toHaveBeenCalledWith(
      'sample-partial.mp4',
      'https://cdn.example.test/video.m3u8',
      'https://example.test/watch',
      { partial: true, missingSegments: 8, totalSegments: 10 },
    );
  });

  test('passes the configured missing-segment tolerance to new HLS tasks', async () => {
    const { runner } = await enqueue();
    expect(runner.start).toHaveBeenCalledWith(
      'https://cdn.example.test/video.m3u8',
      expect.objectContaining({ maxMissingRatio: 0.1 }),
    );
  });

  test('preserves strict mode when missing-segment tolerance is zero', async () => {
    fixture.settings.maxMissingPercent = 0;
    const { runner } = await enqueue();
    expect(runner.start).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxMissingRatio: 0 }));
  });

  test('exports downloaded segments from an active task', async () => {
    const { id, runner } = await enqueue();
    runner.options.onProgress({ progress: 90, finishNum: 9, targetSegment: 10, errorNum: 1 });
    await flush();
    const result = await message({ type: 'download-queue-save-partial', taskId: id });
    expect(result?.success).toBe(true);
    expect(runner.savePartial).toHaveBeenCalledOnce();
  });

  test('exports downloaded segments from a paused task', async () => {
    const { id, runner } = await enqueue();
    runner.options.onProgress({ progress: 80, finishNum: 8, targetSegment: 10, errorNum: 0 });
    await flush();
    expect((await message({ type: 'download-queue-pause', taskId: id }))?.success).toBe(true);
    expect(fixture.tasks[0].status).toBe('paused');
    expect((await message({ type: 'download-queue-save-partial', taskId: id }))?.success).toBe(true);
    expect(runner.savePartial).toHaveBeenCalledOnce();
  });

  test('retains the runner and cached bytes after an HLS error', async () => {
    const { id, runner } = await enqueue();
    runner.options.onProgress({ progress: 80, finishNum: 8, targetSegment: 10, errorNum: 2 });
    runner.options.onError('Temporary save failure');
    await flush();
    expect(runner.destroy).not.toHaveBeenCalled();
    expect(fixture.removeOpfs).not.toHaveBeenCalled();
    expect(fixture.tasks[0].status).toBe('paused');
    expect((await message({ type: 'download-queue-resume', taskId: id }))?.success).toBe(true);
    expect(runner.resume).toHaveBeenCalledOnce();
  });

  test('keeps partial-save failures recoverable for another export', async () => {
    const { id, runner } = await enqueue();
    runner.options.onProgress({ progress: 80, finishNum: 8, targetSegment: 10, errorNum: 2 });
    await flush();
    runner.savePartial.mockRejectedValueOnce(new Error('Disk unavailable'));
    // The popup gets an acceptance response while the browser save runs asynchronously.
    expect((await message({ type: 'download-queue-save-partial', taskId: id }))?.success).toBe(true);
    expect(fixture.tasks[0].status).toBe('paused');
    expect(fixture.tasks[0].error).toBe('Disk unavailable');
    expect(runner.destroy).not.toHaveBeenCalled();
    expect((await message({ type: 'download-queue-save-partial', taskId: id }))?.success).toBe(true);
    expect(runner.savePartial).toHaveBeenCalledTimes(2);
  });

  test('rejects another export while a save is already pending', async () => {
    const { id, runner } = await enqueue();
    runner.options.onProgress({ progress: 90, finishNum: 9, targetSegment: 10, errorNum: 1 });
    runner.savePartial.mockReturnValue(new Promise(() => {}));
    await flush();
    expect((await message({ type: 'download-queue-save-partial', taskId: id }))?.success).toBe(true);
    expect((await message({ type: 'download-queue-pause', taskId: id }))?.success).toBe(false);
    expect((await message({ type: 'download-queue-save-partial', taskId: id }))?.success).toBe(false);
    expect(runner.savePartial).toHaveBeenCalledOnce();
  });

  test('records the partial filename and missing segment counts after completion', async () => {
    const { runner } = await enqueue();
    runner.options.onComplete({
      fileName: 'sample-partial.ts',
      partial: true,
      missingSegments: 1,
      totalSegments: 10,
    });
    await flush();
    expect(fixture.addRecord).toHaveBeenCalledWith(
      'sample-partial.ts',
      'https://cdn.example.test/video.m3u8',
      'https://example.test/watch',
      { partial: true, missingSegments: 1, totalSegments: 10 },
    );
    expect(fixture.tasks).toHaveLength(0);
  });

  test('retains exhausted retry state so users can resume or export', async () => {
    const { id, runner } = await enqueue();
    runner.options.onProgress({
      progress: 80,
      finishNum: 8,
      targetSegment: 10,
      errorNum: 2,
      retriesExhausted: true,
      retryAttempt: 4,
      maxSegmentAttempts: 4,
    });
    runner.options.onError('Retry limit reached');
    await flush();
    expect(fixture.tasks[0]).toMatchObject({ status: 'paused', retriesExhausted: true, retryAttempt: 4 });
    expect((await message({ type: 'download-queue-resume', taskId: id }))?.success).toBe(true);
    expect(fixture.tasks[0]).toMatchObject({ status: 'downloading', retriesExhausted: false });
    expect(runner.resume).toHaveBeenCalledOnce();
  });

  test('serializes delete behind a pending pause without resurrecting the task', async () => {
    const { id, runner } = await enqueue();
    let finishPause!: () => void;
    runner.pauseSoft.mockReturnValue(
      new Promise<void>(resolve => {
        finishPause = resolve;
      }),
    );
    const pauseResponse = vi.fn();
    const deleteResponse = vi.fn();
    fixture.listener!({ type: 'download-queue-pause', taskId: id }, {}, pauseResponse);
    await flush();
    fixture.listener!({ type: 'download-queue-delete', taskId: id }, {}, deleteResponse);
    await flush();
    expect(runner.destroy).not.toHaveBeenCalled();
    finishPause();
    await flush();
    expect(pauseResponse).toHaveBeenCalledWith({ success: true });
    expect(deleteResponse).toHaveBeenCalledWith({ success: true });
    expect(fixture.tasks).toHaveLength(0);
    expect((await message({ type: 'download-queue-resume', taskId: id }))?.success).toBe(false);
    expect(runner.resume).not.toHaveBeenCalled();
  });
});
