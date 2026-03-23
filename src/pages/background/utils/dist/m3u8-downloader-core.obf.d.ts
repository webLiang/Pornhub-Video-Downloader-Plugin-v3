/* eslint-disable @typescript-eslint/no-explicit-any */

interface M3U8DownloaderOptions {
  maxConcurrent?: number;
  retryInterval?: number;
  timeout?: number;
  dataTimeout?: number;
  onProgress?: (data: any) => void;
  onError?: (error: string) => void;
  onComplete?: (data: { fileName: string; duration: number; totalSegments: number }) => void;
}

interface StartOptions {
  isGetMP4?: boolean;
  startSegment?: number;
  endSegment?: number;
  streamDownload?: boolean;
  fileName?: string;
  headers?: Record<string, string>;
  opfsFileName?: string;
}

declare class M3U8Downloader {
  constructor(options?: M3U8DownloaderOptions);
  start(url: string, options?: StartOptions): void;
  destroy(purgeOpfs?: boolean): void;
  pauseSoft(): Promise<void>;
  resume(): void;
  togglePause(): void;
  retry(index: number): void;
}

export default M3U8Downloader;
