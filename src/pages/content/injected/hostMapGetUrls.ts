/* eslint-disable @typescript-eslint/no-explicit-any */
import { Parser } from 'm3u8-parser';

// Cache object
const cache: Record<string, any> = {};

// Utility function: Inject script
const injectScript = (filePath: string, tag: string, datapath = '') => {
  const node = document.getElementsByTagName(tag)[0];
  const script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('src', filePath);
  script.setAttribute('id', 'main-inject-js');
  script.setAttribute('data-path', datapath);
  node?.appendChild(script);
  return script;
};

// Utility function: Get sanitized title
const title = document.title.replace(/[\\\\/:*?\\"<>|.-]+/g, '');

// Utility function: Parse HLS m3u8 file and return playlists
const parseHLSManifest = async (urlHLS: string) => {
  const hls = await (await fetch(urlHLS)).text();
  const parser = new Parser();
  parser.push(hls);
  parser.end();
  const playlists = parser.manifest.playlists;
  playlists.sort((a, b) => a.attributes.BANDWIDTH - b.attributes.BANDWIDTH);
  return playlists;
};

// Utility function: Build HLS URL (replace last path segment)
const buildHLSUrl = (baseUrl: string, uri: string): string => {
  const urlObj = new URL(baseUrl);
  const pathParts = urlObj.pathname.split('/');
  pathParts[pathParts.length - 1] = uri;
  urlObj.pathname = pathParts.join('/');
  return urlObj.toString();
};

// Utility function: Process HLS data and generate m3u8 list
const processHLSData = async (
  hlsData: { url: string },
  fileName: string,
  urlBuilder: (baseUrl: string, uri: string) => string = buildHLSUrl,
): Promise<any[]> => {
  if (!hlsData) return [];

  const urlHLS = hlsData.url;
  const playlists = await parseHLSManifest(urlHLS);

  return playlists.map(item => ({
    quality: item.attributes.NAME ?? item.attributes.RESOLUTION?.height + 'p',
    videoUrl: urlBuilder(urlHLS, item.uri),
    format: 'm3u8',
    title: fileName,
  }));
};

// Utility function: Generic message handler factory
const createMessageHandler = <T>(config: {
  messageType: string;
  cacheKey: string;
  scriptPath: string;
  scriptDataPath?: string;
  shouldRemoveScript?: boolean;
  handler: (event: MessageEvent, resolve: (value: T) => void) => Promise<void>;
}) => {
  return (): Promise<T> => {
    return new Promise(resolve => {
      // Check cache
      if (cache[config.cacheKey]) {
        resolve(cache[config.cacheKey]);
        return;
      }

      // Inject script
      const script = injectScript(chrome.runtime.getURL(config.scriptPath), 'body', config.scriptDataPath || '');

      // Create message handler
      const handleMessage = async (event: MessageEvent) => {
        if (event.data.type === config.messageType) {
          try {
            await config.handler(event, resolve);
          } catch (error) {
            console.error('Error in message handler:', error);
          } finally {
            window.removeEventListener('message', handleMessage);
            if (config.shouldRemoveScript !== false) {
              script.remove();
            }
          }
        }
      };

      window.addEventListener('message', handleMessage);
    });
  };
};

// Get Pornhub URLs
const getPornhubUrls = createMessageHandler({
  messageType: 'get-ph-flashvars',
  cacheKey: 'pornhub',
  scriptPath: 'js/get-ph-flashvars.js',
  handler: async (event, resolve) => {
    console.log('recived message:', event.data);
    const mp4UrlInfo = event.data.data.find((val: any) => val.format === 'mp4');
    const m3u8UrlInfo = event.data?.data
      ?.filter((val: any) => val.format === 'hls')
      .map((val: any) => ({
        ...val,
        format: 'm3u8',
      }));

    const usr =
      document.querySelector('.video-actions-container .usernameBadgesWrapper a')?.innerHTML ||
      document.querySelector<HTMLAnchorElement>('userInfoContainer > a')?.innerText ||
      '';

    if (mp4UrlInfo) {
      const mp4InfoList = (await fetch(mp4UrlInfo.videoUrl).then(res => res.json()))?.map((val: any) => ({
        ...val,
        title: usr + '--' + title,
      }));

      const result = mp4InfoList.concat(m3u8UrlInfo || []);
      cache.pornhub = result;
      resolve(result);
    }
  },
});

// Get Xvideos URLs
const getXvideosUrls = createMessageHandler({
  messageType: 'main-get-xv-info',
  cacheKey: 'xvideos',
  scriptPath: 'js/get-xv-info.js',
  shouldRemoveScript: true,
  handler: async (event, resolve) => {
    console.log('🚀 ~ handleXvMessage ~ event:', event);
    const uploaderTxt = document.querySelector<HTMLAnchorElement>('li.main-uploader a span.name')?.innerText;
    const fileName = (uploaderTxt || '').trim() + '--' + title;

    const mp4list =
      event.data.data?.map((val: any) => ({
        ...val,
        title: fileName,
      })) || [];

    // Xvideos uses simple string replacement to build URL
    const urlBuilder = (baseUrl: string, uri: string) => baseUrl.replace('hls.m3u8', uri);
    const m3u8List = await processHLSData(event.data.hls, fileName, urlBuilder);

    console.log('🚀 ~ playlists.sort ~ playlists:', m3u8List);
    const result = mp4list.concat(m3u8List);
    cache.xvideos = result;
    resolve(result);
  },
});

// Get Xhamster URLs
const getXhamsterUrls = createMessageHandler({
  messageType: 'main-get-xh-info',
  cacheKey: 'xhamster',
  scriptPath: 'js/get-xH-info.js',
  handler: async (event, resolve) => {
    console.log('🚀 ~ handleXhMessage ~ event:', event);
    const m3u8List = await processHLSData(event.data.hls, title);
    console.log('🚀 ~ playlists.sort ~ playlists:', m3u8List);
    cache.xhamster = m3u8List;
    resolve(m3u8List);
  },
});

// Get Redtube URLs
const getRedtube = createMessageHandler({
  messageType: 'main-window-data',
  cacheKey: 'redtube',
  scriptPath: 'js/get-main-data.js',
  scriptDataPath: 'page_params.generalVideoConfig.mainRoll.mediaDefinition',
  handler: async (event, resolve) => {
    const mainData = event.data.data?.map((val: any) => ({
      ...val,
      title,
    }));
    const getMp4Url = mainData?.[1].videoUrl;
    const mp4List = await (await fetch(getMp4Url)).json();
    cache.redtube = mp4List;
    resolve(mp4List);
  },
});
const hostMapGetUrls = {
  'pornhub.com': {
    getUrls: getPornhubUrls,
  },
  'xvideos.com': {
    getUrls: getXvideosUrls,
  },
  'xvv1deos.com': {
    getUrls: getXvideosUrls,
  },
  'xnxx.es': {
    getUrls: getXvideosUrls,
  },
  'xnxx.com': {
    getUrls: getXvideosUrls,
  },
  'xhamster.com': {
    getUrls: getXhamsterUrls,
  },
  'xhamster42.desi': {
    getUrls: getXhamsterUrls,
  },
  'xhamster43.desi': {
    getUrls: getXhamsterUrls,
  },
  'xhamster44.desi': {
    getUrls: getXhamsterUrls,
  },
  'xhamster1.desi': {
    getUrls: getXhamsterUrls,
  },
  'xhamster.desi': {
    getUrls: getXhamsterUrls,
  },
  'redtube.com': {
    getUrls: getRedtube,
  },
};

export default hostMapGetUrls;
