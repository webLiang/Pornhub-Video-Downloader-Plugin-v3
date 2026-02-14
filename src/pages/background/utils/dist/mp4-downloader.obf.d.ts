export interface MP4DownloadOptions {
  url: string;
  fileName: string;
  headers?: Record<string, string>;
  onProgress?: (data: MP4ProgressData) => void;
  onComplete?: (data: { fileName: string }) => void;
  onError?: (error: string) => void;
}

export interface MP4ProgressData {
  progress: number;
  bytesReceived: number;
  totalBytes: number;
  isFileDownloading: boolean;
}

export declare class MP4Downloader {
  start(opts: MP4DownloadOptions): Promise<void>;
  destroy(): void;
}

export default MP4Downloader;
