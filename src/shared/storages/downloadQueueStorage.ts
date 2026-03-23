import { BaseStorage, createStorage, StorageType } from '@src/shared/storages/base';

export type DownloadTaskStatus = 'queued' | 'downloading' | 'paused' | 'error';

export type DownloadTaskFormat = 'm3u8' | 'mp4' | 'webm';

export type DownloadTask = {
  id: string;
  url: string;
  fileName: string;
  format: DownloadTaskFormat;
  status: DownloadTaskStatus;
  createdAt: number;
  startedAt?: number;

  progress: number; // 0-100
  error?: string;

  // segment based progress (m3u8) or a single file (mp4/webm)
  finishNum: number;
  targetSegment: number;
  errorNum: number;

  // file saving stage progress (mp4 or merged file)
  fileDownloadProgress?: number; // 0-100
  isFileDownloading?: boolean;

  // used to attach correct headers for fetch requests in background
  headers?: Record<string, string>;

  /** Deterministic OPFS blob name for this task (set on enqueue) */
  opfsCacheFileName?: string;
  /** MP4 partial OPFS size for Range resume (bytes written before pause) */
  cachedBytes?: number;
};

type DownloadQueueState = {
  tasks: DownloadTask[];
};

const defaultState: DownloadQueueState = { tasks: [] };

type DownloadQueueStorage = BaseStorage<DownloadQueueState> & {
  enqueue: (
    task: Omit<DownloadTask, 'id' | 'status' | 'createdAt' | 'progress' | 'finishNum' | 'targetSegment' | 'errorNum'>,
  ) => Promise<string>;
  updateTask: (id: string, patch: Partial<DownloadTask>) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  clearQueued: () => Promise<void>;
  clearErrors: () => Promise<void>;
};

const storage = createStorage<DownloadQueueState>('downloadQueueState', defaultState, {
  storageType: StorageType.Local,
  liveUpdate: true,
});

function genTaskId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Same naming as video-download-core/opfs-task-cache (stable OPFS name per task). */
function buildOpfsFileNameForTask(taskId: string, format: DownloadTaskFormat): string {
  const safe = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = format === 'm3u8' ? 'ts' : format === 'webm' ? 'webm' : 'mp4';
  return `vd-ext-${safe}.${ext}`;
}

const downloadQueueStorage: DownloadQueueStorage = {
  ...storage,

  enqueue: async task => {
    const id = genTaskId();
    const opfsCacheFileName = buildOpfsFileNameForTask(id, task.format);
    await storage.set(state => {
      const next: DownloadTask = {
        id,
        url: task.url,
        fileName: task.fileName || '',
        format: task.format,
        headers: task.headers,
        status: 'queued',
        createdAt: Date.now(),
        progress: 0,
        finishNum: 0,
        targetSegment: task.format === 'm3u8' ? 0 : 1,
        errorNum: 0,
        opfsCacheFileName,
      };
      return { tasks: [...state.tasks, next] };
    });
    return id;
  },

  updateTask: async (id, patch) => {
    await storage.set(state => ({
      tasks: state.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)),
    }));
  },

  removeTask: async id => {
    await storage.set(state => ({ tasks: state.tasks.filter(t => t.id !== id) }));
  },

  clearQueued: async () => {
    await storage.set(state => ({ tasks: state.tasks.filter(t => t.status !== 'queued') }));
  },

  clearErrors: async () => {
    await storage.set(state => ({ tasks: state.tasks.filter(t => t.status !== 'error') }));
  },
};

export default downloadQueueStorage;
export type { DownloadQueueState };
