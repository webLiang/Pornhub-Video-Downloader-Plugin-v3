/* eslint-disable */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-nocheck
import { mp4 } from 'mux.js';

// TypeScript 类型定义
interface M3U8DownloaderOptions {
  maxConcurrent?: number;
  retryInterval?: number;
  timeout?: number; // 请求超时时间（毫秒），默认 60000ms (60秒) - 等待响应头的超时时间
  dataTimeout?: number; // 数据传输超时时间（毫秒），默认 300000ms (5分钟) - 响应头返回后的数据传输超时
  onProgress?: (data: ProgressData) => void;
  onError?: (error: string) => void;
  onComplete?: (data: CompleteData) => void;
}

interface ProgressData {
  finishNum: number;
  targetSegment: number;
  errorNum: number;
  progress: number;
  finishList: FinishItem[];
  fileDownloadProgress?: number; // 文件下载进度（0-100）
  isFileDownloading?: boolean; // 是否正在文件下载阶段
}

interface CompleteData {
  fileName: string;
  duration: number;
  totalSegments: number;
}

interface FinishItem {
  title: string;
  status: string;
}

interface RangeDownload {
  startSegment: number;
  endSegment: number;
  targetSegment: number;
}

interface AESConfig {
  method: string;
  uri: string;
  iv: string | Uint8Array;
  key: ArrayBuffer | null;
  decryptor: any;
  stringToBuffer: (str: string) => Uint8Array;
}

interface AjaxOptions {
  url: string;
  type?: 'file' | 'text';
  success?: (data: ArrayBuffer | string) => void;
  fail?: (status: number, errorInfo?: any) => void;
}

interface StartOptions {
  isGetMP4?: boolean;
  startSegment?: number;
  endSegment?: number;
  streamDownload?: boolean;
  fileName?: string;
}

class M3U8Downloader {
  private options: Required<M3U8DownloaderOptions>;
  private url: string = '';
  private title: string = '';
  private finalFileName: string = '';
  private isPause: boolean = false;
  private isGetMP4: boolean = false;
  private downloading: boolean = false;
  private beginTime: Date | null = null;
  private errorNum: number = 0;
  private finishNum: number = 0;
  private downloadIndex: number = 0;
  private finishList: FinishItem[] = [];
  private tsUrlList: string[] = [];
  private mediaFileList: (ArrayBuffer | null)[] = [];
  private durationSecond: number = 0;
  private rangeDownload: RangeDownload;
  private aesConf: AESConfig;
  private isSupperStreamWrite: boolean;
  private streamWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private streamDownloadIndex: number = 0;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private abortControllers: AbortController[] = [];
  private timeoutTimers: Map<AbortController, ReturnType<typeof setTimeout>> = new Map(); // 超时定时器映射
  private timeoutHandled: Set<AbortController> = new Set(); // 已处理的超时请求（避免重复处理）

  // Debug mode flag - set to false in production to reduce console output
  private readonly DEBUG = false;

  // OPFS 流式写入相关
  private opfsFileHandle: FileSystemFileHandle | null = null;
  private opfsWritable: FileSystemWritableFileStream | null = null;
  private opfsWriteIndex: number = 0; // 当前写入的片段索引（用于确保按顺序写入）
  private opfsFileName: string = ''; // OPFS 文件名
  private opfsInitPromise: Promise<void> | null = null; // OPFS 初始化 Promise
  private opfsWriteQueue: Map<number, ArrayBuffer> = new Map(); // 写入队列（index -> data）
  private opfsFinalizing: boolean = false; // 是否正在完成 OPFS 写入（防止重复触发）
  private opfsWritingPromise: Promise<void> | null = null; // 当前正在执行的写入 Promise（用于防止并发写入）

  // 内存追踪（调试用）
  private memoryTracker = {
    totalBytesReceived: 0, // 从网络接收的总字节数
    totalBytesStored: 0, // 存储到数组/队列的总字节数
    writeCount: 0, // 写入次数
    segmentSizes: new Map<number, number>(), // 每个片段的大小
  };

  constructor(options: M3U8DownloaderOptions = {}) {
    // 配置选项
    this.options = {
      maxConcurrent: options.maxConcurrent ?? 6,
      retryInterval: options.retryInterval ?? 2000,
      timeout: options.timeout ?? 60000, // 默认 60 秒超时（等待响应头）
      dataTimeout: options.dataTimeout ?? 300000, // 默认 5 分钟超时（数据传输）
      onProgress: options.onProgress ?? null,
      onError: options.onError ?? null,
      onComplete: options.onComplete ?? null,
    };

    // 范围下载
    this.rangeDownload = {
      startSegment: 1,
      endSegment: 0,
      targetSegment: 0,
    };

    // AES 加密配置
    this.aesConf = {
      method: '',
      uri: '',
      iv: '',
      key: null,
      decryptor: null,
      stringToBuffer: (str: string) => new TextEncoder().encode(str),
    };

    // 流式下载支持（使用 self 或 globalThis 替代 window）
    const global = (typeof self !== 'undefined' ? self : globalThis) as any;
    this.isSupperStreamWrite = global.streamSaver && !global.streamSaver.useBlobFallback;
  }

  /**
   * Debug log - only outputs when DEBUG is true
   */
  private log(...args: any[]): void {
    if (this.DEBUG) {
      console.log('[M3U8Downloader]', ...args);
    }
  }

  /**
   * Warning log - always outputs
   */
  private warn(...args: any[]): void {
    console.warn('[M3U8Downloader]', ...args);
  }

  /**
   * Error log - always outputs
   */
  private error(...args: any[]): void {
    console.error('[M3U8Downloader]', ...args);
  }

  /**
   * Fetch 请求封装（替代 AJAX）
   * 支持通过 AbortController 取消请求
   * 支持超时自动取消和重试
   */
  private ajax(options: AjaxOptions): void {
    const { url, type = 'text', success, fail } = options;

    // 如果已暂停/取消，不发起新请求
    if (this.isPause || !this.downloading) {
      this.log('下载已取消，跳过请求:', url);
      fail?.(0, { error: '下载已取消', url });
      return;
    }

    // 创建 AbortController 用于取消请求
    const abortController = new AbortController();
    this.abortControllers.push(abortController);

    // 标记请求是否已完成（用于防止重复处理）
    let isRequestCompleted = false;

    // 设置第一阶段超时定时器（等待响应头）
    const headerTimeoutTimer = setTimeout(() => {
      // 如果请求已完成，不再处理
      if (isRequestCompleted) {
        return;
      }

      // 标记为已处理的超时请求
      this.timeoutHandled.add(abortController);

      // 超时后取消请求（响应头未返回）
      this.warn(`等待响应头超时 (${this.options.timeout}ms)，取消请求:`, url);

      // 确保 abort 被调用
      try {
        abortController.abort();
      } catch (e) {
        this.warn('取消请求时出错:', e);
      }

      // 清理定时器
      const timer = this.timeoutTimers.get(abortController);
      if (timer) {
        clearTimeout(timer);
        this.timeoutTimers.delete(abortController);
      }

      // 触发失败回调，让调用方可以重试
      fail?.(0, {
        error: `等待响应头超时 (${this.options.timeout}ms)`,
        timeout: true,
        url,
      });
    }, this.options.timeout);
    this.timeoutTimers.set(abortController, headerTimeoutTimer);

    // 在控制台输出 fetch 请求信息（用于调试）
    this.log(`Fetching: ${url.substring(0, 80)}...`);

    fetch(url, {
      signal: abortController.signal,
    })
      .then(async (response: Response) => {
        // 检查是否已超时
        if (this.timeoutHandled.has(abortController)) {
          this.log('请求已超时，忽略响应:', url);
          return undefined;
        }

        // 响应头已返回，清除第一阶段超时定时器
        const headerTimer = this.timeoutTimers.get(abortController);
        if (headerTimer) {
          clearTimeout(headerTimer);
          this.timeoutTimers.delete(abortController);
        }

        this.log('Response:', response.status, response.statusText);

        // 响应头已返回，设置第二阶段超时定时器（数据传输）
        const dataTimeoutTimer = setTimeout(() => {
          // 如果请求已完成，不再处理
          if (isRequestCompleted) {
            return;
          }

          // 标记为已处理的超时请求
          this.timeoutHandled.add(abortController);

          // 数据传输超时，取消请求
          this.warn(`数据传输超时 (${this.options.dataTimeout}ms)，取消请求`);

          // 确保 abort 被调用
          try {
            abortController.abort();
          } catch (e) {
            this.warn('取消请求时出错:', e);
          }

          // 清理定时器
          this.timeoutTimers.delete(abortController);

          // 触发失败回调，让调用方可以重试
          fail?.(0, {
            error: `数据传输超时 (${this.options.dataTimeout}ms)`,
            timeout: true,
            url,
          });
        }, this.options.dataTimeout);

        this.timeoutTimers.set(abortController, dataTimeoutTimer);

        if (!response.ok) {
          // 清除数据传输超时定时器（响应头已返回，但状态码错误）
          const dataTimer = this.timeoutTimers.get(abortController);
          if (dataTimer) {
            clearTimeout(dataTimer);
            this.timeoutTimers.delete(abortController);
          }

          // 输出详细错误信息（仅在 DEBUG 模式）
          this.log('Request failed:', response.status, response.statusText);

          // 传递状态码和错误信息给失败回调
          fail?.(response.status, {
            status: response.status,
            statusText: response.statusText,
            url,
          });
          return undefined;
        }

        // 在读取响应体之前，再次检查是否已超时
        if (this.timeoutHandled.has(abortController)) {
          return undefined;
        }

        // 根据 type 决定返回类型
        try {
          return type === 'file' ? await response.arrayBuffer() : await response.text();
        } catch (readError: any) {
          // 如果读取时出错（可能是超时导致的），检查是否已超时
          if (this.timeoutHandled.has(abortController)) {
            return undefined;
          }
          // 如果不是超时错误，重新抛出
          throw readError;
        }
      })
      .then((data: ArrayBuffer | string | undefined) => {
        // 标记请求已完成
        isRequestCompleted = true;

        // 清除超时定时器和标记
        const timeoutTimer = this.timeoutTimers.get(abortController);
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          this.timeoutTimers.delete(abortController);
        }
        this.timeoutHandled.delete(abortController);

        // 从列表中移除已完成的 AbortController
        const index = this.abortControllers.indexOf(abortController);
        if (index > -1) {
          this.abortControllers.splice(index, 1);
        }

        // 如果已取消或已超时，不处理响应
        if (this.isPause || !this.downloading || this.timeoutHandled.has(abortController)) {
          return;
        }

        // 只有在成功获取数据时才调用 success
        if (data !== undefined && success) {
          success(data);
        }
      })
      .catch((error: Error & { status?: number }) => {
        // 标记请求已完成（即使是错误）
        isRequestCompleted = true;

        // 清除超时定时器和标记
        const timeoutTimer = this.timeoutTimers.get(abortController);
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          this.timeoutTimers.delete(abortController);
        }

        // 从列表中移除已完成的 AbortController
        const index = this.abortControllers.indexOf(abortController);
        if (index > -1) {
          this.abortControllers.splice(index, 1);
        }

        // 如果是超时取消或取消操作，不处理错误
        if (error.name === 'AbortError' || this.isPause || !this.downloading) {
          this.timeoutHandled.delete(abortController);
          return;
        }

        // 处理网络错误或其他异常
        this.log('Fetch error:', error.message);

        fail?.(error.status ?? 0, {
          error: error.message,
          name: error.name,
          url,
        });
      });
  }

  /**
   * URL 合成工具
   */
  private applyURL(targetURL: string, baseURL?: string): string {
    // 在 background 脚本中，如果没有 baseURL，尝试从当前 URL 获取
    let resolvedBaseURL = baseURL ?? this.url;
    if (!resolvedBaseURL && typeof location !== 'undefined' && location.href) {
      resolvedBaseURL = location.href;
    }

    if (targetURL.startsWith('http')) {
      // 如果 baseURL 使用 https 协议，强制使 ts 资源也使用 https 协议获取
      if (resolvedBaseURL.startsWith('https')) {
        return targetURL.replace('http://', 'https://');
      }
      return targetURL;
    } else if (targetURL.startsWith('/')) {
      const [protocol, , domain] = resolvedBaseURL.split('/');
      return `${protocol}//${domain}${targetURL}`;
    } else {
      const parts = resolvedBaseURL.split('/');
      parts.pop();
      return `${parts.join('/')}/${targetURL}`;
    }
  }

  /**
   * 格式化时间
   */
  private formatTime(date: Date, formatStr: string): string {
    const formatType: Record<string, number> = {
      Y: date.getFullYear(),
      M: date.getMonth() + 1,
      D: date.getDate(),
      h: date.getHours(),
      m: date.getMinutes(),
      s: date.getSeconds(),
    };
    return formatStr.replace(/Y+|M+|D+|h+|m+|s+/g, (target: string) => {
      const value = formatType[target[0]] ?? 0;
      return ('0'.repeat(target.length) + String(value)).slice(-target.length);
    });
  }

  /**
   * 获取文档标题（处理跨域）
   * 在 background 脚本中，返回默认标题或使用 this.title
   */
  private getDocumentTitle(): string {
    // 在 background 脚本中，document 不存在
    if (typeof document !== 'undefined' && document.title) {
      try {
        const global = typeof self !== 'undefined' ? self : globalThis;
        if (global.top && global.top.document && global.top.document.title) {
          return global.top.document.title;
        }
        return document.title;
      } catch (error) {
        console.log(error);
      }
    }
    // 如果没有 document，返回 this.title 或默认值
    return this.title || 'm3u8 downloader';
  }

  /**
   * 重置所有状态（释放内存）
   */
  private reset(): void {
    // 输出内存追踪汇总
    console.log(
      `[Memory] 重置前汇总: 接收=${(this.memoryTracker.totalBytesReceived / 1024 / 1024).toFixed(2)} MB, 存储=${(this.memoryTracker.totalBytesStored / 1024 / 1024).toFixed(2)} MB, 写入次数=${this.memoryTracker.writeCount}`,
    );

    // 重置内存追踪
    this.memoryTracker.totalBytesReceived = 0;
    this.memoryTracker.totalBytesStored = 0;
    this.memoryTracker.writeCount = 0;
    this.memoryTracker.segmentSizes.clear();

    // 清空数据数组（释放内存！）
    this.mediaFileList.length = 0;
    this.mediaFileList = [];
    this.finishList.length = 0;
    this.finishList = [];
    this.tsUrlList.length = 0;
    this.tsUrlList = [];

    // 重置状态
    this.url = '';
    this.title = '';
    this.finalFileName = '';
    this.isPause = false;
    this.isGetMP4 = false;
    this.downloading = false;
    this.beginTime = null;
    this.errorNum = 0;
    this.finishNum = 0;
    this.downloadIndex = 0;
    this.durationSecond = 0;
    this.streamDownloadIndex = 0;

    // 重置范围下载
    this.rangeDownload = {
      startSegment: 1,
      endSegment: 0,
      targetSegment: 0,
    };

    // 重置 AES 配置
    this.aesConf = {
      method: '',
      uri: '',
      iv: '',
      key: null,
      decryptor: null,
      stringToBuffer: (str: string) => new TextEncoder().encode(str),
    };

    // 重置 OPFS 相关状态
    this.opfsWriteIndex = 0;
    this.opfsFileName = '';
    this.opfsInitPromise = null;
    this.opfsWriteQueue.clear();
    this.opfsFinalizing = false;
    this.opfsWritingPromise = null;
  }

  /**
   * 开始下载
   */
  public start(url: string, options: StartOptions = {}): void {
    if (!url) {
      this.triggerError('请输入链接');
      return;
    }
    if (!url.toLowerCase().includes('m3u8')) {
      this.triggerError('链接有误，请重新输入');
      return;
    }
    if (this.downloading) {
      this.triggerError('资源下载中，请稍后');
      return;
    }

    // 重置状态（释放之前下载的内存）
    this.reset();

    this.url = url;
    this.isGetMP4 = options.isGetMP4 ?? false;
    this.title = options.fileName ?? '';

    // 解析 URL 参数中的 title
    try {
      const urlObj = new URL(url);
      this.title = urlObj.searchParams.get('title') ?? this.title;
    } catch {
      // 忽略 URL 解析错误
    }

    // 流式下载初始化
    if (options.streamDownload && this.isSupperStreamWrite) {
      const fileName = this.title || this.formatTime(new Date(), 'YYYY_MM_DD hh_mm_ss');
      const finalFileName = this.getDocumentTitle() !== 'm3u8 downloader' ? this.getDocumentTitle() : fileName;
      // 保存最终使用的文件名，用于完成回调
      this.finalFileName = finalFileName;
      const ext = this.isGetMP4 ? 'mp4' : 'ts';
      const global = (typeof self !== 'undefined' ? self : globalThis) as any;
      this.streamWriter = global.streamSaver.createWriteStream(`${finalFileName}.${ext}`).getWriter();
    }

    // 设置下载范围
    if (options.startSegment) {
      this.rangeDownload.startSegment = options.startSegment;
    }
    if (options.endSegment) {
      this.rangeDownload.endSegment = options.endSegment;
    }

    // 如果支持 OPFS，提前初始化（用于流式写入）
    if (
      !options.streamDownload &&
      typeof chrome !== 'undefined' &&
      chrome.offscreen &&
      chrome.downloads &&
      navigator.storage &&
      navigator.storage.getDirectory
    ) {
      this.initOPFSStreamWrite();
    }

    this.getM3U8();
  }

  /**
   * 初始化 OPFS 流式写入
   * 提前创建 OPFS 文件，用于边转码边写入，减少内存占用
   */
  private async initOPFSStreamWrite(): Promise<void> {
    if (this.opfsInitPromise) {
      return this.opfsInitPromise;
    }

    this.opfsInitPromise = (async () => {
      try {
        const ext = this.isGetMP4 ? 'mp4' : 'ts';
        this.opfsFileName = `m3u8-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;

        const root = await navigator.storage.getDirectory();
        this.opfsFileHandle = await root.getFileHandle(this.opfsFileName, { create: true });
        this.opfsWritable = await this.opfsFileHandle.createWritable();
        // opfsWriteIndex 从 0 开始，与 listIndex 保持一致（listIndex = index - startSegment）
        this.opfsWriteIndex = 0;

        this.log('OPFS 流式写入已初始化');
      } catch (error) {
        this.error('OPFS 初始化失败:', error);
        // 如果初始化失败，回退到原来的方式（等所有片段完成后再写入）
        this.opfsFileHandle = null;
        this.opfsWritable = null;
      }
    })();

    return this.opfsInitPromise;
  }

  /**
   * 获取并解析 M3U8 文件
   */
  private getM3U8(): void {
    this.downloading = true;
    this.beginTime = new Date();
    this.errorNum = 0;
    this.finishNum = 0;
    this.downloadIndex = 0;
    this.durationSecond = 0;

    this.ajax({
      url: this.url,
      success: (m3u8Str: ArrayBuffer | string) => {
        // 检查是否已取消
        if (this.isPause || !this.downloading) {
          return;
        }

        // 确保 m3u8Str 是字符串
        const m3u8Text = typeof m3u8Str === 'string' ? m3u8Str : new TextDecoder().decode(m3u8Str);

        this.tsUrlList = [];
        this.finishList = [];

        // 提取 TS 视频片段地址
        const lines = m3u8Text.split('\n');
        lines.forEach(item => {
          // 下载非 # 开头的链接片段
          if (/^[^#]/.test(item.trim())) {
            const tsUrl = this.applyURL(item.trim(), this.url);
            this.tsUrlList.push(tsUrl);
            this.finishList.push({
              title: item.trim(),
              status: '',
            });
          }
        });

        if (this.tsUrlList.length === 0) {
          this.triggerError('资源为空，请查看链接是否有效');
          return;
        }

        // 设置下载范围
        const startSegment = Math.max(this.rangeDownload.startSegment || 1, 1);
        let endSegment = Math.max(this.rangeDownload.endSegment || this.tsUrlList.length, 1);
        endSegment = Math.min(endSegment, this.tsUrlList.length);
        this.rangeDownload.startSegment = Math.min(startSegment, endSegment);
        this.rangeDownload.endSegment = Math.max(startSegment, endSegment);
        this.rangeDownload.targetSegment = this.rangeDownload.endSegment - this.rangeDownload.startSegment + 1;
        this.downloadIndex = this.rangeDownload.startSegment - 1;

        // 计算 MP4 视频总时长
        if (this.isGetMP4) {
          let infoIndex = 0;
          lines.forEach(item => {
            if (item.toUpperCase().indexOf('#EXTINF:') > -1) {
              infoIndex++;
              if (this.rangeDownload.startSegment <= infoIndex && infoIndex <= this.rangeDownload.endSegment) {
                const durationStr = item.split('#EXTINF:')[1];
                this.durationSecond += parseFloat(durationStr || '0');
              }
            }
          });
        }

        // 检测 AES 加密
        if (m3u8Text.includes('#EXT-X-KEY')) {
          const methodMatch = m3u8Text.match(/(.*METHOD=([^,\s]+))/);
          const uriMatch = m3u8Text.match(/(.*URI="([^"]+))"/);
          const ivMatch = m3u8Text.match(/(.*IV=([^,\s]+))/);

          this.aesConf.method = methodMatch?.[2] ?? '';
          this.aesConf.uri = uriMatch?.[2] ?? '';
          const ivStr = ivMatch?.[2] ?? '';
          this.aesConf.iv = ivStr ? this.aesConf.stringToBuffer(ivStr) : '';
          this.aesConf.uri = this.applyURL(this.aesConf.uri, this.url);
          this.getAES();
        } else {
          this.downloadTS();
        }
      },
      fail: (status, errorInfo) => {
        let errorMessage = '链接不正确，请查看链接是否有效';

        if (errorInfo) {
          if (errorInfo.status) {
            errorMessage = `请求失败: HTTP ${errorInfo.status} ${errorInfo.statusText || ''}`;
          } else if (errorInfo.error) {
            errorMessage = `网络错误: ${errorInfo.error}`;
          }
        }

        this.error('M3U8 获取失败:', errorMessage);
        this.triggerError(errorMessage);
      },
    });
  }

  /**
   * 获取 AES 密钥
   */
  private getAES(): void {
    this.ajax({
      type: 'file',
      url: this.aesConf.uri,
      success: (key: ArrayBuffer | string) => {
        // 检查是否已取消
        if (this.isPause || !this.downloading) {
          return;
        }

        this.aesConf.key = key instanceof ArrayBuffer ? key : null;
        const global = typeof self !== 'undefined' ? self : globalThis;
        if (global.AESDecryptor) {
          this.aesConf.decryptor = new global.AESDecryptor();
          this.aesConf.decryptor.constructor();
          this.aesConf.decryptor.expandKey(this.aesConf.key);
          this.downloadTS();
        } else {
          this.triggerError('AES 解密器未加载，请确保已加载 aes-decryptor.js');
        }
      },
      fail: () => {
        this.error('AES 密钥获取失败');
        this.triggerError('视频已加密，无法获取解密密钥');
      },
    });
  }

  /**
   * AES 解密
   */
  private aesDecrypt(data: ArrayBuffer, index: number): ArrayBuffer {
    if (!this.aesConf.decryptor) {
      return data;
    }
    const iv =
      this.aesConf.iv instanceof Uint8Array
        ? this.aesConf.iv
        : new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, index]);
    return this.aesConf.decryptor.decrypt(data, 0, iv.buffer, true);
  }

  /**
   * 下载 TS 片段
   * 优化：查找下一个未完成的片段，而不是依赖 downloadIndex（避免高并发时进度卡住）
   */
  private downloadTS(): void {
    console.log(
      `[Memory] downloadTS 启动, downloadIndex=${this.downloadIndex}, finishNum=${this.finishNum}, targetSegment=${this.rangeDownload.targetSegment}`,
    );

    /**
     * 查找下一个需要下载的片段索引
     * 返回 -1 表示没有需要下载的片段
     */
    const findNextSegmentToDownload = (): number => {
      const startIndex = this.rangeDownload.startSegment - 1;
      const endIndex = this.rangeDownload.endSegment - 1;

      // 从 downloadIndex 开始查找，如果找不到则从头开始查找
      for (let i = Math.max(this.downloadIndex, startIndex); i <= endIndex; i++) {
        if (this.finishList[i] && this.finishList[i].status === '') {
          return i;
        }
      }

      // 如果从 downloadIndex 开始没找到，从头开始查找（处理循环查找）
      for (let i = startIndex; i < Math.min(this.downloadIndex, endIndex); i++) {
        if (this.finishList[i] && this.finishList[i].status === '') {
          return i;
        }
      }

      return -1; // 没有找到需要下载的片段
    };

    const download = () => {
      // 检查是否已取消，如果已取消则不继续下载
      if (this.isPause || !this.downloading) {
        return;
      }

      // 查找下一个需要下载的片段（而不是使用 downloadIndex）
      const index = findNextSegmentToDownload();

      if (index === -1) {
        // 没有找到需要下载的片段，检查是否所有片段都已完成
        const allFinished = this.finishNum >= this.rangeDownload.targetSegment;
        if (!allFinished) {
          // 可能还有正在下载的片段，等待它们完成
          console.log(
            `[Memory] 没有找到待下载片段，但 finishNum=${this.finishNum} < targetSegment=${this.rangeDownload.targetSegment}，可能还有正在下载的片段`,
          );
        }
        return;
      }

      // 更新 downloadIndex（用于下次查找的起始位置）
      this.downloadIndex = Math.max(this.downloadIndex, index + 1);

      // 标记为正在下载
      this.finishList[index].status = 'downloading';
      console.log(`[Memory] 开始下载片段 ${index}, finishNum=${this.finishNum}`);

      this.ajax({
        url: this.tsUrlList[index],
        type: 'file',
        success: file => {
          // 再次检查是否已取消
          if (this.isPause || !this.downloading) {
            return;
          }
          if (file instanceof ArrayBuffer) {
            this.dealTS(file, index, () => {
              // 继续下载下一个片段（不依赖 downloadIndex，而是查找下一个未完成的片段）
              if (!this.isPause && this.downloading) {
                download();
              }
            });
          }
        },
        fail: (status, errorInfo) => {
          // 如果是取消操作，不处理错误
          if (this.isPause || !this.downloading) {
            return;
          }

          this.errorNum++;
          this.finishList[index].status = 'error';

          // 只在错误较多时输出日志，避免刷屏
          if (this.errorNum <= 3 || this.errorNum % 10 === 0) {
            this.warn(`TS 片段下载失败 [${index}], 总错误: ${this.errorNum}`);
          }

          this.updateProgress();
          // 继续下载下一个片段
          if (!this.isPause && this.downloading) {
            download();
          }
        },
      });
    };

    // 启动并发下载
    const concurrent = Math.min(this.options.maxConcurrent, this.rangeDownload.targetSegment - this.finishNum);
    console.log(`[Memory] 启动 ${concurrent} 个并发下载`);

    for (let i = 0; i < concurrent; i++) {
      download();
    }

    // 启动自动重试
    this.startAutoRetry();
  }

  /**
   * 处理 TS 片段（解密、转码）
   * 优化：转码后立即写入 OPFS（如果已初始化），减少内存占用
   */
  private dealTS(file: ArrayBuffer, index: number, callback?: () => void): void {
    // 防止同一片段被重复处理（可能因为 retryAll 导致同一请求被发起多次）
    if (this.finishList[index] && this.finishList[index].status === 'finish') {
      this.warn(`片段 ${index} 已处理，跳过重复处理`);
      callback?.();
      return;
    }

    // 内存追踪：记录接收到的数据
    const fileSize = file.byteLength;
    this.memoryTracker.totalBytesReceived += fileSize;
    console.log(
      `[Memory] dealTS 接收片段 ${index}, 大小: ${(fileSize / 1024).toFixed(2)} KB, 累计接收: ${(this.memoryTracker.totalBytesReceived / 1024 / 1024).toFixed(2)} MB`,
    );

    // 检查该片段是否已经记录过（重复下载检测）
    if (this.memoryTracker.segmentSizes.has(index)) {
      console.warn(`[Memory] ⚠️ 片段 ${index} 重复接收! 之前大小: ${this.memoryTracker.segmentSizes.get(index)} bytes`);
    }
    this.memoryTracker.segmentSizes.set(index, fileSize);

    // AES 解密
    const data = this.aesConf.uri ? this.aesDecrypt(file, index) : file;

    // MP4 转码
    // 注意：使用同步回调避免创建过多 Promise（Promise 会持有数据引用导致内存泄漏）
    this.conversionMp4(data, index, (afterData: ArrayBuffer) => {
      // 再次检查是否已处理（防止重复处理）
      if (this.finishList[index] && this.finishList[index].status === 'finish') {
        this.warn(`片段 ${index} 已处理（回调中），跳过重复处理`);
        callback?.();
        return;
      }

      // index 是数组索引（从 0 开始），startSegment 和 endSegment 是片段编号（从 1 开始）
      // 所以 index 的范围应该是 startSegment - 1 到 endSegment - 1
      // listIndex 从 0 开始，用于数组索引
      // 例如：startSegment=1, index=0 => listIndex=0; startSegment=1, index=84 => listIndex=84
      const listIndex = index - (this.rangeDownload.startSegment - 1);

      // 验证 index 范围（index 是数组索引，应该 >= startSegment - 1 且 <= endSegment - 1）
      const minIndex = this.rangeDownload.startSegment - 1;
      const maxIndex = this.rangeDownload.endSegment - 1;
      if (index < minIndex || index > maxIndex) {
        this.error(`index ${index} 超出范围 [${minIndex}, ${maxIndex}]`);
        callback?.();
        return;
      }

      // 验证 listIndex 范围
      if (listIndex < 0 || listIndex >= this.rangeDownload.targetSegment) {
        this.error(`listIndex ${listIndex} 超出范围 [0, ${this.rangeDownload.targetSegment})`);
        callback?.();
        return;
      }

      this.finishList[index].status = 'finish';
      this.finishNum++;
      this.updateProgress();

      // 内存追踪：记录存储的数据
      const afterDataSize = afterData.byteLength;
      this.memoryTracker.writeCount++;
      this.memoryTracker.totalBytesStored += afterDataSize;
      console.log(
        `[Memory] 存储片段 ${index} (listIndex=${listIndex}), 大小: ${(afterDataSize / 1024).toFixed(2)} KB, 写入次数: ${this.memoryTracker.writeCount}, 累计存储: ${(this.memoryTracker.totalBytesStored / 1024 / 1024).toFixed(2)} MB`,
      );

      // 流式写入（streamSaver）
      if (this.streamWriter) {
        console.log(`[Memory] -> streamWriter 存储 listIndex=${listIndex}`);
        // 先存入数组
        this.mediaFileList[listIndex] = afterData;

        // 按顺序写入
        for (let i = this.streamDownloadIndex; i < this.mediaFileList.length; i++) {
          if (this.mediaFileList[i]) {
            this.streamWriter.write(new Uint8Array(this.mediaFileList[i]));
            // 写入后立即释放内存
            this.mediaFileList[i] = null;
            this.streamDownloadIndex = i + 1;
          } else {
            break;
          }
        }
        if (this.streamDownloadIndex >= this.rangeDownload.targetSegment) {
          this.streamWriter.close();
          this.streamWriter = null;
          this.downloading = false;
          this.stopAutoRetry();
          this.triggerComplete();
        }
        callback?.();
        return;
      }

      // OPFS 流式写入（优化：转码后立即写入，减少内存占用）
      if (this.opfsWritable) {
        // 检查是否重复写入队列
        if (this.opfsWriteQueue.has(listIndex)) {
          console.warn(
            `[Memory] ⚠️ opfsWriteQueue 重复写入 listIndex=${listIndex}! 队列大小: ${this.opfsWriteQueue.size}`,
          );
          callback?.();
          return;
        }

        // 在加入队列前，再次验证 listIndex 是否在有效范围内（防止超出范围的数据进入队列）
        if (listIndex < 0 || listIndex >= this.rangeDownload.targetSegment) {
          callback?.();
          return;
        }

        console.log(`[Memory] -> opfsWriteQueue.set(${listIndex}), 队列大小: ${this.opfsWriteQueue.size + 1}`);
        // 将转码后的数据加入队列
        this.opfsWriteQueue.set(listIndex, afterData);

        // 使用 Promise.resolve().then() 避免在回调中直接 await（减少 Promise 链）
        // 但确保错误能被捕获
        // 注意：不等待 Promise 完成，避免阻塞和创建过多 Promise 链
        Promise.resolve()
          .then(async () => {
            // 确保 OPFS 已初始化
            if (this.opfsInitPromise) {
              await this.opfsInitPromise;
            }
            // 尝试按顺序写入队列中的数据
            await this.processOPFSWriteQueue();
            // 只在所有片段都完成时才检查完成（减少 Promise 创建）
            if (this.finishNum === this.rangeDownload.targetSegment) {
              await this.checkAndFinalizeOPFS();
            }
          })
          .catch(error => {
            this.error('OPFS 写入失败:', error);
            // 如果 OPFS 写入失败，回退到原来的方式
            console.log(`[Memory] -> OPFS 失败，回退到 mediaFileList[${listIndex}]`);
            this.opfsWriteQueue.delete(listIndex); // 从队列中删除
            this.mediaFileList[listIndex] = afterData;
            if (this.finishNum === this.rangeDownload.targetSegment) {
              this.fallbackToArrayDownload().catch(err => {
                this.error('fallbackToArrayDownload 失败:', err);
              });
            }
          })
          .finally(() => {
            callback?.();
          });
        return;
      }

      // 传统方式：存入数组，等所有片段完成后再写入
      console.log(`[Memory] -> mediaFileList[${listIndex}], 数组长度: ${this.mediaFileList.length}`);
      this.mediaFileList[listIndex] = afterData;
      if (this.finishNum === this.rangeDownload.targetSegment) {
        // 所有片段下载完成，合并下载
        const fileName = this.title || this.formatTime(this.beginTime, 'YYYY_MM_DD hh_mm_ss');
        const finalFileName = this.getDocumentTitle() !== 'm3u8 downloader' ? this.getDocumentTitle() : fileName;
        // 保存最终使用的文件名，用于完成回调
        this.finalFileName = finalFileName;
        // 等待 downloadFile 真正完成（文件下载到本地）后再触发完成回调
        this.downloadFile(this.mediaFileList, finalFileName)
          .then(() => {
            this.downloading = false;
            this.stopAutoRetry();
            this.triggerComplete();
          })
          .catch(error => {
            console.error('[M3U8Downloader] 下载文件时出错:', error);
            this.downloading = false;
            this.stopAutoRetry();
            this.triggerError('下载文件失败: ' + (error.message || error));
          });
      }

      callback?.();
    });
  }

  /**
   * 按顺序处理 OPFS 写入队列
   * 确保即使片段并发完成，也能按顺序写入 OPFS
   * 使用 Promise 链确保同一时间只有一个写入流程在执行
   * 优化：避免递归调用，使用循环处理队列，减少 Promise 创建
   */
  private async processOPFSWriteQueue(): Promise<void> {
    if (!this.opfsWritable) {
      return;
    }

    // 如果已经有写入流程在执行，等待它完成后再继续（避免并发写入）
    if (this.opfsWritingPromise) {
      await this.opfsWritingPromise;
      // 等待完成后，如果队列中还有数据，继续处理（但不递归，而是继续当前流程）
      if (!this.opfsWriteQueue.has(this.opfsWriteIndex)) {
        return;
      }
      // 继续执行下面的 while 循环处理剩余数据
    }

    // 创建新的写入 Promise（只创建一个，避免递归创建多个）
    this.opfsWritingPromise = (async () => {
      try {
        // 使用循环处理所有可写入的数据，而不是递归
        while (this.opfsWriteQueue.has(this.opfsWriteIndex)) {
          // 在写入前检查 opfsWriteIndex 是否在有效范围内
          if (this.opfsWriteIndex < 0 || this.opfsWriteIndex >= this.rangeDownload.targetSegment) {
            console.warn(
              `[Memory] ⚠️ opfsWriteIndex ${this.opfsWriteIndex} 超出范围 [0, ${this.rangeDownload.targetSegment})，清理队列`,
            );
            // 清理超出范围的数据（释放内存）
            this.opfsWriteQueue.clear();
            break;
          }

          // 双重检查：在写入前再次确认数据还在队列中（防止并发问题）
          const currentWriteIndex = this.opfsWriteIndex;
          const data = this.opfsWriteQueue.get(currentWriteIndex);

          if (!data) {
            // 数据已被其他流程处理，退出循环
            break;
          }

          try {
            const dataSize = data.byteLength;
            console.log(
              `[Memory] OPFS 写入片段 ${currentWriteIndex}, 大小: ${(dataSize / 1024).toFixed(2)} KB, 队列剩余: ${this.opfsWriteQueue.size}`,
            );

            // 执行写入操作（创建 Uint8Array 视图，不复制数据）
            await this.opfsWritable.write(new Uint8Array(data));

            // 写入成功后，立即删除数据释放内存
            this.opfsWriteQueue.delete(currentWriteIndex);
            this.opfsWriteIndex++;
            console.log(`[Memory] OPFS 写入完成 ${currentWriteIndex}, 队列剩余: ${this.opfsWriteQueue.size}`);
          } catch (error) {
            this.error(`OPFS 写入片段 ${currentWriteIndex} 失败:`, error);
            // 写入失败也要删除，避免内存泄漏
            this.opfsWriteQueue.delete(currentWriteIndex);
            throw error;
          }
        }
      } finally {
        // 清除写入 Promise，允许后续调用继续执行
        this.opfsWritingPromise = null;
      }
    })();

    // 等待写入完成
    await this.opfsWritingPromise;
  }

  /**
   * 检查并完成 OPFS 写入
   * 确保所有片段都已写入，且不会重复触发
   */
  private async checkAndFinalizeOPFS(): Promise<void> {
    // 防止重复触发
    if (this.opfsFinalizing) {
      return;
    }

    // 检查是否所有片段都已处理完成
    // 条件1：所有片段都已下载完成（finishNum === targetSegment）
    // 条件2：所有数据都已写入（opfsWriteIndex >= targetSegment 且队列为空）
    const allSegmentsProcessed = this.finishNum === this.rangeDownload.targetSegment;
    const allDataWritten = this.opfsWriteIndex >= this.rangeDownload.targetSegment && this.opfsWriteQueue.size === 0;

    if (allSegmentsProcessed && allDataWritten) {
      this.opfsFinalizing = true;
      this.log(`所有片段处理完成 ${this.finishNum}/${this.rangeDownload.targetSegment}`);
      await this.finalizeOPFSWrite();
    } else if (allSegmentsProcessed && this.opfsWriteQueue.size > 0) {
      // 所有片段都处理完了，但队列中还有数据，继续处理
      await this.processOPFSWriteQueue();
      // 再次检查
      if (this.opfsWriteIndex >= this.rangeDownload.targetSegment && this.opfsWriteQueue.size === 0) {
        this.opfsFinalizing = true;
        await this.finalizeOPFSWrite();
      }
    }
  }

  /**
   * 完成 OPFS 写入并触发下载
   */
  private async finalizeOPFSWrite(): Promise<void> {
    if (!this.opfsWritable || !this.opfsFileHandle) {
      return;
    }

    try {
      // 关闭写入流
      await this.opfsWritable.close();
      // 标记已关闭，避免后续重复 close 触发错误
      this.opfsWritable = null;

      // 获取文件名
      const fileName = this.title || this.formatTime(this.beginTime, 'YYYY_MM_DD hh_mm_ss');
      const finalFileName = this.getDocumentTitle() !== 'm3u8 downloader' ? this.getDocumentTitle() : fileName;
      this.finalFileName = finalFileName;

      // 从 OPFS 创建 Blob URL 并下载
      await this.downloadFromOPFS(this.opfsFileName, finalFileName);

      // 下载完成后，触发完成回调
      this.downloading = false;
      this.stopAutoRetry();
      this.triggerComplete();
    } catch (error) {
      this.error('完成 OPFS 写入失败:', error);
      this.downloading = false;
      this.stopAutoRetry();
      this.triggerError('完成文件写入失败: ' + (error?.message || String(error)));
    }
  }

  /**
   * 从 OPFS 文件下载
   */
  private async downloadFromOPFS(opfsFileName: string, fileName: string): Promise<void> {
    const ext = this.isGetMP4 ? 'mp4' : 'ts';
    const fullFileName = `${fileName}.${ext}`;
    const mimeType = this.isGetMP4 ? 'video/mp4' : 'video/MP2T';

    try {
      // 确保 offscreen 文档存在
      await this.ensureOffscreenDocument();

      // 从 offscreen 获取 blob URL
      const downloadId = `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const response = await chrome.runtime.sendMessage({
        type: 'OPFS_TO_BLOB_URL',
        filename: opfsFileName,
        mimeType: mimeType,
        downloadId: downloadId,
      });

      if (!response || !response.ok || !response.blobUrl) {
        throw new Error(response?.error || '创建 blob URL 失败');
      }

      const blobUrl = response.blobUrl;

      // 获取文件大小（用于进度计算）
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(opfsFileName);
      const file = await fileHandle.getFile();
      const fileSize = file.size;

      // 使用 chrome.downloads.download 下载
      await this.startChromeDownload(blobUrl, fullFileName, opfsFileName, mimeType, fileSize);
    } catch (error) {
      this.error('从 OPFS 下载失败:', error);
      throw error;
    }
  }

  /**
   * 启动 Chrome 下载并监听进度
   */
  private async startChromeDownload(
    blobUrl: string,
    fullFileName: string,
    opfsFileName: string,
    mimeType: string,
    fileSize: number,
  ): Promise<void> {
    const ext = this.isGetMP4 ? 'mp4' : 'ts';
    const downloadFileName = fullFileName.endsWith(`.${ext}`) ? fullFileName : `${fullFileName}.${ext}`;
    const downloadId = `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      // 设置超时，避免无限等待
      const timeout = setTimeout(() => {
        downloadListener && chrome.downloads.onChanged.removeListener(downloadListener);
        // 清理 OPFS 文件
        this.cleanupOPFSFile(opfsFileName).catch(() => {});
        reject(new Error('下载超时：等待下载完成超时'));
      }, 300000); // 5分钟超时

      let chromeDownloadId: number | null = null;
      let fileTotalBytes: number = fileSize;
      const downloadStartTime = Date.now();

      // 监听 chrome.downloads.onChanged 事件来确认下载完成和更新进度
      const downloadListener = (downloadDelta: chrome.downloads.DownloadDelta) => {
        // 只处理我们发起的下载
        if (downloadDelta.id !== chromeDownloadId) {
          return;
        }

        // 更新文件下载进度（从 chrome.downloads API 获取）
        const downloadDeltaAny = downloadDelta as any;
        const bytesReceived = downloadDeltaAny.bytesReceived?.current as number | undefined;
        const totalBytes = downloadDeltaAny.totalBytes?.current as number | undefined;

        // 如果获取到 totalBytes，更新文件总大小
        if (totalBytes !== undefined && totalBytes > 0) {
          fileTotalBytes = totalBytes;
        }

        // 更新进度
        if (bytesReceived !== undefined && fileTotalBytes > 0) {
          const fileDownloadProgress = Math.min((bytesReceived / fileTotalBytes) * 100, 100);

          // 片段下载进度（90%）+ 文件下载进度（10%）
          // 片段下载已完成，所以基础进度是 90%
          const totalProgress = 90 + fileDownloadProgress * 0.1;

          // 更新进度到 UI
          if (this.options.onProgress) {
            this.options.onProgress({
              finishNum: this.finishNum,
              targetSegment: this.rangeDownload.targetSegment,
              errorNum: this.errorNum,
              progress: Math.min(totalProgress, 100),
              finishList: this.finishList,
              fileDownloadProgress: fileDownloadProgress,
              isFileDownloading: true,
            });
          }
        }

        // 检查下载是否完成
        if (downloadDelta.state?.current === 'complete') {
          // 清理 OPFS 文件
          this.cleanupOPFSFile(opfsFileName).catch(() => {});

          clearTimeout(timeout);
          chrome.downloads.onChanged.removeListener(downloadListener);
          resolve(undefined);
        } else if (downloadDelta.state?.current === 'interrupted') {
          this.error('下载被中断:', downloadDelta.error);
          // 清理 OPFS 文件
          this.cleanupOPFSFile(opfsFileName).catch(() => {});
          clearTimeout(timeout);
          chrome.downloads.onChanged.removeListener(downloadListener);
          reject(new Error(downloadDelta.error?.current || '下载被中断'));
        }
      };

      // 注册下载状态监听器
      chrome.downloads.onChanged.addListener(downloadListener);

      chrome.downloads.download(
        {
          url: blobUrl,
          filename: downloadFileName,
          saveAs: false,
          conflictAction: 'uniquify',
        },
        id => {
          if (chrome.runtime.lastError) {
            // 清理 OPFS 文件
            this.cleanupOPFSFile(opfsFileName).catch(() => {});
            clearTimeout(timeout);
            chrome.downloads.onChanged.removeListener(downloadListener);
            reject(new Error(chrome.runtime.lastError.message || '下载启动失败'));
            return;
          }

          chromeDownloadId = id;

          // 立即查询下载项信息以获取 totalBytes
          chrome.downloads.search({ id }, results => {
            if (results && results.length > 0 && results[0].totalBytes) {
              fileTotalBytes = results[0].totalBytes;

              // 通知开始文件下载阶段
              if (this.options.onProgress) {
                this.options.onProgress({
                  finishNum: this.finishNum,
                  targetSegment: this.rangeDownload.targetSegment,
                  errorNum: this.errorNum,
                  progress: 90, // 片段下载完成，开始文件下载
                  finishList: this.finishList,
                  fileDownloadProgress: 0,
                  isFileDownloading: true,
                });
              }
            }
          });
        },
      );
    });
  }

  /**
   * 清理 OPFS 文件
   */
  private async cleanupOPFSFile(opfsFileName: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(opfsFileName);
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * 回退到数组方式下载（当 OPFS 写入失败时）
   */
  private async fallbackToArrayDownload(): Promise<void> {
    const fileName = this.title || this.formatTime(this.beginTime, 'YYYY_MM_DD hh_mm_ss');
    const finalFileName = this.getDocumentTitle() !== 'm3u8 downloader' ? this.getDocumentTitle() : fileName;
    this.finalFileName = finalFileName;

    this.downloadFile(this.mediaFileList, finalFileName)
      .then(() => {
        this.downloading = false;
        this.stopAutoRetry();
        this.triggerComplete();
      })
      .catch(error => {
        this.error('下载文件时出错:', error);
        this.downloading = false;
        this.stopAutoRetry();
        this.triggerError('下载文件失败: ' + (error.message || error));
      });
  }

  /**
   * MP4 转码
   * 注意：确保 callback 只被调用一次，且返回数据的副本（避免引用 mux.js 内部缓冲区）
   */
  private conversionMp4(data: ArrayBuffer, index: number, callback: (data: ArrayBuffer) => void): void {
    if (this.isGetMP4) {
      const transmuxer = new mp4.Transmuxer({
        keepOriginalTimestamps: true,
        duration: Math.floor(this.durationSecond),
      });

      // 使用标志确保 callback 只被调用一次（mux.js 可能多次触发 'data' 事件）
      let callbackCalled = false;

      // 清理 Transmuxer 资源的函数
      const cleanupTransmuxer = () => {
        try {
          transmuxer.off('data');
          if (typeof transmuxer.dispose === 'function') {
            transmuxer.dispose();
          }
          // 尝试清理内部缓冲区
          if (typeof transmuxer.reset === 'function') {
            transmuxer.reset();
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      };

      transmuxer.on('data', segment => {
        // 防止重复调用 callback
        if (callbackCalled) {
          this.warn('conversionMp4: callback already called, ignoring duplicate data event');
          return;
        }
        callbackCalled = true;

        try {
          if (index === this.rangeDownload.startSegment - 1) {
            // 第一个片段包含 initSegment
            // 创建数据副本，避免引用 mux.js 内部缓冲区
            const initData = new Uint8Array(segment.initSegment);
            const segmentData = new Uint8Array(segment.data);
            const combined = new Uint8Array(initData.byteLength + segmentData.byteLength);
            combined.set(initData, 0);
            combined.set(segmentData, initData.byteLength);
            callback(combined.buffer);
          } else {
            // 创建数据副本，避免引用 mux.js 内部缓冲区
            const dataCopy = new Uint8Array(segment.data).slice().buffer;
            callback(dataCopy);
          }
        } finally {
          // 清理 Transmuxer 资源
          cleanupTransmuxer();
        }
      });

      try {
        transmuxer.push(new Uint8Array(data));
        transmuxer.flush();
      } catch (e) {
        this.error('MP4 转码失败:', e);
        // 转码失败时也要清理资源，并回退到原始数据
        cleanupTransmuxer();
        callback(data);
      }

      // 如果 flush 后没有触发 data 事件（可能是输入数据无效），使用原始数据并清理
      // 使用微任务确保在 data 事件之后检查
      Promise.resolve().then(() => {
        if (!callbackCalled) {
          this.warn('conversionMp4: no data event triggered, using original data');
          callbackCalled = true;
          cleanupTransmuxer();
          callback(data);
        }
      });
    } else {
      callback(data);
    }
  }

  /**
   * 下载合并后的文件
   * 使用 OPFS (Origin Private File System) 流式写入，避免大文件占用内存
   * 返回 Promise，在文件真正下载到本地后 resolve
   */
  private async downloadFile(fileDataList: (ArrayBuffer | null)[], fileName: string): Promise<void> {
    const ext = this.isGetMP4 ? 'mp4' : 'ts';
    const fullFileName = `${fileName}.${ext}`;
    const mimeType = this.isGetMP4 ? 'video/mp4' : 'video/MP2T';

    // 在 background 脚本中，使用 OPFS (Origin Private File System) 流式写入，避免大文件占用内存
    if (
      typeof chrome !== 'undefined' &&
      chrome.offscreen &&
      chrome.downloads &&
      navigator.storage &&
      navigator.storage.getDirectory
    ) {
      try {
        // 确保 offscreen 文档存在（使用 FILE_SYSTEM 原因）
        await this.ensureOffscreenDocument();

        // 生成唯一的文件名和下载 ID
        const opfsFileName = `m3u8-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
        const downloadId = `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 1. 流式写入 OPFS 文件
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(opfsFileName, { create: true });
        const writable = await fileHandle.createWritable();

        let totalWritten = 0;
        const totalLength = fileDataList.reduce((sum: number, data: ArrayBuffer | null) => {
          if (data instanceof ArrayBuffer) {
            return sum + data.byteLength;
          }
          return sum;
        }, 0);

        // 流式写入所有数据块
        for (let i = 0; i < fileDataList.length; i++) {
          const data = fileDataList[i];

          if (!(data instanceof ArrayBuffer)) {
            continue; // 跳过无效数据
          }

          const uint8Array = new Uint8Array(data);
          await writable.write(uint8Array);
          totalWritten += uint8Array.length;

          // 写入后立即释放内存
          fileDataList[i] = null;
        }

        await writable.close();

        // 清空数组释放内存
        fileDataList.length = 0;

        // 2. 从 offscreen 获取 blob URL
        const response = await chrome.runtime.sendMessage({
          type: 'OPFS_TO_BLOB_URL',
          filename: opfsFileName,
          mimeType: mimeType,
          downloadId: downloadId,
        });

        if (!response || !response.ok || !response.blobUrl) {
          // 清理 OPFS 文件
          try {
            await root.removeEntry(opfsFileName);
          } catch (e) {
            // Ignore cleanup errors
          }
          throw new Error(response?.error || '创建 blob URL 失败');
        }

        const blobUrl = response.blobUrl;

        // 3. 使用 chrome.downloads.download 下载
        await this.startChromeDownload(blobUrl, fullFileName, opfsFileName, mimeType, totalLength);
      } catch (error) {
        this.error('OPFS 下载失败:', error);
        throw error;
      }
    } else if (typeof document !== 'undefined') {
      // 如果在 content script 或普通页面中，使用传统方式
      const fileBlob = new Blob(fileDataList, { type: mimeType });
      const a = document.createElement('a');
      const blobUrl = URL.createObjectURL(fileBlob);
      a.href = blobUrl;
      a.download = fullFileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 清理 blob URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      // 在 content script 中，下载是同步的，直接返回
      return Promise.resolve(undefined);
    } else {
      throw new Error('无法下载文件：当前环境不支持下载功能');
    }
  }

  /**
   * 确保 offscreen 文档已创建
   * 使用 FILE_SYSTEM 原因以支持 OPFS 访问
   */
  private async ensureOffscreenDocument(): Promise<void> {
    if (!chrome.offscreen) {
      throw new Error('chrome.offscreen API 不可用');
    }

    const OFFSCREEN_DOCUMENT_PATH = 'src/pages/offscreen/index.html';

    // 检查是否已存在 offscreen 文档
    try {
      const globalScope = self as any;
      const clients = await globalScope.clients?.matchAll();
      const hasOffscreen = clients.some(client => client.url && client.url.includes(OFFSCREEN_DOCUMENT_PATH));

      if (hasOffscreen) {
        return;
      }
    } catch (error) {
      // 如果 clients API 不可用，继续尝试创建
    }

    try {
      // 使用 FILE_SYSTEM 原因以支持 OPFS 访问
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification: 'Access OPFS files and create blob URLs for M3U8 downloader',
      });
    } catch (error) {
      // 如果文档已存在，忽略错误
      if (error.message && error.message.includes('already exists')) {
        return;
      }
      this.error('创建 offscreen 文档失败:', error);
      throw error;
    }
  }

  /**
   * 暂停/恢复下载
   */
  public togglePause(): void {
    this.isPause = !this.isPause;
    if (!this.isPause) {
      this.retryAll(true);
    }
  }

  /**
   * 重试单个片段
   */
  public retry(index: number): void {
    if (this.finishList[index] && this.finishList[index].status === 'error') {
      this.finishList[index].status = '';
      this.ajax({
        url: this.tsUrlList[index],
        type: 'file',
        success: (file: ArrayBuffer | string) => {
          if (file instanceof ArrayBuffer) {
            this.errorNum--;
            this.dealTS(file, index);
          }
        },
        fail: () => {
          this.finishList[index].status = 'error';
          this.errorNum++;
        },
      });
    }
  }

  /**
   * 重试所有错误片段
   */
  public retryAll(forceRestart?: boolean): void {
    if (!this.finishList.length || this.isPause) {
      return;
    }

    // 只在有错误时才处理
    if (this.errorNum === 0 && !forceRestart) {
      return;
    }

    console.log(
      `[Memory] retryAll 触发, errorNum=${this.errorNum}, forceRestart=${forceRestart}, downloadIndex=${this.downloadIndex}`,
    );

    let firstErrorIndex = this.downloadIndex;
    let hasError = false;
    let errorCount = 0;
    this.finishList.forEach((item, index) => {
      if (item.status === 'error') {
        item.status = '';
        firstErrorIndex = Math.min(firstErrorIndex, index);
        hasError = true;
        errorCount++;
      }
    });

    console.log(`[Memory] retryAll 找到 ${errorCount} 个错误片段, firstErrorIndex=${firstErrorIndex}`);

    // 如果没有错误且不是强制重启，直接返回
    if (!hasError && !forceRestart) {
      return;
    }

    this.errorNum = 0;

    if (this.downloadIndex >= this.rangeDownload.endSegment || forceRestart) {
      console.log(`[Memory] retryAll 调用 downloadTS, downloadIndex=${firstErrorIndex}`);
      this.downloadIndex = firstErrorIndex;
      this.downloadTS();
    } else {
      this.downloadIndex = firstErrorIndex;
    }
  }

  /**
   * 启动自动重试
   */
  private startAutoRetry(): void {
    this.stopAutoRetry();
    this.retryTimer = setInterval(() => {
      this.retryAll();
    }, this.options.retryInterval);
  }

  /**
   * 停止自动重试
   */
  private stopAutoRetry(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * 更新进度
   */
  private updateProgress(): void {
    if (this.options.onProgress) {
      const progress =
        this.rangeDownload.targetSegment > 0
          ? ((this.finishNum / this.rangeDownload.targetSegment) * 100).toFixed(2)
          : 0;

      this.options.onProgress({
        finishNum: this.finishNum,
        targetSegment: this.rangeDownload.targetSegment,
        errorNum: this.errorNum,
        progress: Number(progress),
        finishList: this.finishList,
      });
    }
  }

  /**
   * 触发错误回调
   */
  private triggerError(message: string): void {
    this.downloading = false;
    this.stopAutoRetry();
    if (this.options.onError) {
      this.options.onError(message);
    } else {
      console.error('M3U8Downloader Error:', message);
    }
  }

  /**
   * 触发完成回调
   */
  private triggerComplete(): void {
    // 保存回调需要的数据
    const fileName =
      this.finalFileName || this.title || this.formatTime(this.beginTime || new Date(), 'YYYY_MM_DD hh_mm_ss');
    const ext = this.isGetMP4 ? 'mp4' : 'ts';
    const fullFileName = fileName.endsWith(`.${ext}`) ? fileName : `${fileName}.${ext}`;
    const duration = this.durationSecond;
    const totalSegments = this.rangeDownload.targetSegment;

    // 清理内存（在回调前释放大数据）
    this.mediaFileList.length = 0;
    this.mediaFileList = [];
    this.opfsWriteQueue.clear();

    if (this.options.onComplete) {
      this.options.onComplete({
        fileName: fullFileName,
        duration: duration,
        totalSegments: totalSegments,
      });
    }
  }

  /**
   * 强制下载现有片段
   */
  public forceDownload(): void {
    if (this.mediaFileList.length) {
      const fileName = this.title || this.formatTime(this.beginTime, 'YYYY_MM_DD hh_mm_ss');
      const finalFileName = this.getDocumentTitle() !== 'm3u8 downloader' ? this.getDocumentTitle() : fileName;
      this.downloadFile(this.mediaFileList, finalFileName).catch(error => {
        this.error('强制下载时出错:', error);
        this.triggerError('下载失败: ' + (error?.message || String(error)));
      });
    } else {
      this.triggerError('当前无已下载片段');
    }
  }

  /**
   * 销毁下载器
   */
  public destroy(): void {
    // 停止自动重试
    this.stopAutoRetry();

    // 设置状态为已取消
    this.downloading = false;
    this.isPause = true;

    // 取消所有正在进行的 fetch 请求
    this.abortControllers.forEach(controller => {
      try {
        controller.abort();
      } catch (e) {
        // Ignore abort errors
      }
    });

    // 清除所有超时定时器和标记
    this.timeoutTimers.forEach(timer => {
      clearTimeout(timer);
    });
    this.timeoutTimers.clear();
    this.timeoutHandled.clear();

    // 清空 AbortController 列表
    this.abortControllers.length = 0;
    this.abortControllers = [];

    // 关闭流式写入器
    if (this.streamWriter) {
      try {
        this.streamWriter.close();
      } catch (e) {
        // Ignore close errors
      }
      this.streamWriter = null;
    }

    // 清理 OPFS 资源
    if (this.opfsWritable) {
      try {
        this.opfsWritable.close();
      } catch (e) {
        // Ignore close errors
      }
      this.opfsWritable = null;
    }

    // 清理 OPFS 文件（如果存在）
    const opfsFileToClean = this.opfsFileName;
    if (opfsFileToClean) {
      this.cleanupOPFSFile(opfsFileToClean).catch(() => {
        // Ignore cleanup errors
      });
    }

    this.opfsFileHandle = null;

    // 重置所有状态并释放内存
    this.reset();
  }
}

// 导出（支持多种模块系统，兼容 background 脚本）
if (typeof module !== 'undefined' && module.exports) {
  (module as any).exports = M3U8Downloader;
} else if (typeof (globalThis as any).define === 'function' && (globalThis as any).define.amd) {
  (globalThis as any).define([], () => M3U8Downloader);
} else {
  // 在 background 脚本中使用 self 或 globalThis
  const global = (typeof self !== 'undefined' ? self : globalThis) as any;
  global.M3U8Downloader = M3U8Downloader;
}

export default M3U8Downloader;
