import { BaseStorage, createStorage, StorageType } from '@src/shared/storages/base';

/** A single completed download record */
export type DownloadRecord = {
  id: string; // unique ID (timestamp-based)
  fileName: string;
  url: string;
  completedAt: number; // epoch ms
};

type DownloadHistoryState = {
  records: DownloadRecord[];
};

const defaultState: DownloadHistoryState = { records: [] };

// Max history entries to keep (prevent unbounded growth)
const MAX_HISTORY = 50;

type DownloadHistoryStorage = BaseStorage<DownloadHistoryState> & {
  /** Add a completed download to the history list */
  addRecord: (fileName: string, url: string) => Promise<void>;
  /** Remove a single record by id */
  removeRecord: (id: string) => Promise<void>;
  /** Clear all history */
  clearAll: () => Promise<void>;
};

const storage = createStorage<DownloadHistoryState>('m3u8DownloadHistory', defaultState, {
  storageType: StorageType.Local,
  liveUpdate: true,
});

const downloadHistoryStorage: DownloadHistoryStorage = {
  ...storage,

  addRecord: async (fileName: string, url: string) => {
    await storage.set(state => {
      const record: DownloadRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName,
        url,
        completedAt: Date.now(),
      };
      // Prepend new record, trim to max length
      const records = [record, ...state.records].slice(0, MAX_HISTORY);
      return { records };
    });
  },

  removeRecord: async (id: string) => {
    await storage.set(state => ({
      records: state.records.filter(r => r.id !== id),
    }));
  },

  clearAll: async () => {
    await storage.set(defaultState);
  },
};

export default downloadHistoryStorage;
