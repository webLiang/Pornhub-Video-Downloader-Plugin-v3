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
  completedAt?: number; // 完成时间戳
  fileDownloadProgress?: number; // 文件下载进度（0-100）
  isFileDownloading?: boolean; // 是否正在文件下载阶段
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
  // 更新下载进度
  updateProgress: async (progress: Partial<M3U8DownloadState>) => {
    await storage.set(currentState => ({
      ...currentState,
      ...progress,
    }));
  },
  // 重置状态
  reset: async () => {
    await storage.set(defaultState);
  },
  // 标记为完成
  markCompleted: async (fileName: string) => {
    await storage.set(currentState => ({
      ...currentState,
      isDownloading: false,
      progress: 100,
      fileName: fileName,
      completedAt: Date.now(),
      isFileDownloading: false, // 清除文件下载状态
      fileDownloadProgress: 100, // 设置为 100%
    }));
  },
  // 标记为错误
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
