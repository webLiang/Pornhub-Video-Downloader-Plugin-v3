import { BaseStorage, createStorage, StorageType } from '@src/shared/storages/base';

type M3U8DownloadState = {
  isDownloading: boolean;
  progress: number;
  fileName: string;
  errorNum: number;
  finishNum: number;
  targetSegment: number;
  error?: string;
  url?: string;
  isGetMP4?: boolean;
  completedAt?: number; // completion timestamp
  fileDownloadProgress?: number; // file save progress (0-100)
  isFileDownloading?: boolean; // whether in file-save phase
};

const defaultState: M3U8DownloadState = {
  isDownloading: false,
  progress: 0,
  fileName: '',
  errorNum: 0,
  finishNum: 0,
  targetSegment: 0,
};

type M3U8DownloadStorage = BaseStorage<M3U8DownloadState> & {
  updateProgress: (progress: Partial<M3U8DownloadState>) => Promise<void>;
  reset: () => Promise<void>;
  markCompleted: (fileName: string) => Promise<void>;
  markError: (error: string) => Promise<void>;
};

const storage = createStorage<M3U8DownloadState>('m3u8DownloadState', defaultState, {
  storageType: StorageType.Local,
  liveUpdate: true,
});

const m3u8DownloadStorage: M3U8DownloadStorage = {
  ...storage,
  // Update download progress
  updateProgress: async (progress: Partial<M3U8DownloadState>) => {
    await storage.set(currentState => ({
      ...currentState,
      ...progress,
    }));
  },
  // Reset state
  reset: async () => {
    await storage.set(defaultState);
  },
  // Mark completed
  markCompleted: async (fileName: string) => {
    await storage.set(currentState => ({
      ...currentState,
      isDownloading: false,
      progress: 100,
      fileName: fileName,
      completedAt: Date.now(),
      isFileDownloading: false, // clear file-save flag
      fileDownloadProgress: 100, // set to 100%
    }));
  },
  // Mark error
  markError: async (error: string) => {
    await storage.set(currentState => ({
      ...currentState,
      isDownloading: false,
      error: error,
    }));
  },
};

export default m3u8DownloadStorage;
export type { M3U8DownloadState };
