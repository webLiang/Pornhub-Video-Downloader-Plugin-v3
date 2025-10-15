import { Parser } from 'm3u8-parser';
let cacheDate;
let pornMp4Infos;
const injectScript = (filePath, tag, datapath = '') => {
  const node = document.getElementsByTagName(tag)[0];
  const script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('src', filePath);
  script.setAttribute('id', 'main-inject-js');
  script.setAttribute('data-path', datapath);
  node?.appendChild(script);
  return script;
};
const title = document.title.replace(/[\\\\/:*?\\"<>|.-]+/g, '');
const getPornhubUrls = () =>
  new Promise(resolve2 => {
    if (pornMp4Infos) {
      resolve2(pornMp4Infos);
      return;
    }
    const handleMessage = async event => {
      if (event.data.type === 'get-ph-flashvars') {
        console.log('recived message:', event.data);
        const { data, video_title } = event.data;
        const mp4UrlInfo = data.find(val => val.format === 'mp4');
        const m3u8UrlInfo = data
          ?.filter(val => val.format === 'hls')
          .map(val => ({
            ...val,
            format: 'm3u8',
          }));
        const usr =
          document.querySelector('.video-actions-container .usernameBadgesWrapper a')?.innerHTML ||
          document.querySelector<HTMLAnchorElement>('userInfoContainer > a')?.innerText ||
          '';
        if (mp4UrlInfo) {
          const mp4InfoList = (await fetch(mp4UrlInfo.videoUrl).then(res => res.json()))?.map(val => ({
            ...val,
            title: usr + '--' + video_title,
          }));
          // console.log('🚀 ~ handleMessage ~ mp4InfoList:', mp4InfoList);
          pornMp4Infos = mp4InfoList.concat(m3u8UrlInfo ? m3u8UrlInfo : []);
          resolve2(pornMp4Infos);
          window.removeEventListener('message', handleMessage);
          script.remove();
        }
      }
    };
    window.addEventListener('message', handleMessage);
    const script = injectScript(chrome.runtime.getURL('js/get-ph-flashvars.js'), 'body');
  });

let xvideosMp4Infos;
const getXvideosUrls = () =>
  new Promise(resolve2 => {
    console.log('getXvideosUrls');
    if (xvideosMp4Infos) {
      resolve2(xvideosMp4Infos);
      return;
    }
    const handleXvMessage = async event => {
      console.log('🚀 ~ handleXvMessage ~ event:', event);
      const uploaderTxt = document.querySelector<HTMLAnchorElement>('li.main-uploader a span.name')?.innerText;
      const fileName = (uploaderTxt || '').trim() + '--' + title;
      if (event.data.type === 'main-get-xv-info') {
        const mp4list = event.data.data?.map(val => ({
          ...val,
          title: fileName,
        }));
        const m3u8List = [];
        if (event.data.hls) {
          console.log('🚀 ~ handleXvMessage ~ event.data.hls:', event.data.hls);
          const urlHLS = event.data.hls.url;
          const hls = await (await fetch(urlHLS)).text();
          const parser = new Parser();
          parser.push(hls);
          parser.end();
          const playlists = parser.manifest.playlists;
          playlists.sort((a, b) => {
            return a.attributes.BANDWIDTH - b.attributes.BANDWIDTH;
          });

          for (const item of playlists) {
            const obj = {
              quality: item.attributes.NAME,
              videoUrl: urlHLS.replace('hls.m3u8', item.uri),
              // video_title: urlTitle,
              format: 'm3u8',
              title: fileName,
            };
            m3u8List.push(obj);
          }
          console.log('🚀 ~ playlists.sort ~ playlists:', playlists, m3u8List);
        }
        // console.log(33444444, xvideosMp4Infos, m3u8List, mp4list);
        xvideosMp4Infos = mp4list.concat(m3u8List);
        resolve2(xvideosMp4Infos);
        window.removeEventListener('message', handleXvMessage);
        // script.remove();
      }
    };
    window.addEventListener('message', handleXvMessage);
    const script = injectScript(chrome.runtime.getURL('js/get-xv-info.js'), 'body');
    script.remove();
  });
let xHMp4Infos;
const getXhamsterUrls = () =>
  new Promise(resolve2 => {
    if (xHMp4Infos) {
      resolve2(xHMp4Infos);
      return;
    }

    const script = injectScript(chrome.runtime.getURL('js/get-xH-info.js'), 'body');

    const handleXvMessage = async event => {
      console.log('🚀 ~ handleXvMessage ~ event:', event);
      if (event.data.type === 'main-get-xh-info') {
        xHMp4Infos = event.data.data?.map(val => ({
          ...val,
          title,
        }));
        resolve2(xHMp4Infos);
        window.removeEventListener('message', handleXvMessage);
        script.remove();
      }
    };
    window.addEventListener('message', handleXvMessage);
  });

const getRedtube = () =>
  new Promise(resolve => {
    if (cacheDate) {
      resolve(cacheDate);
      return;
    }
    const script = injectScript(
      chrome.runtime.getURL('js/get-main-data.js'),
      'body',
      'page_params.generalVideoConfig.mainRoll.mediaDefinition',
    );

    const handleMainDataMessage = async event => {
      if (event.data.type === 'main-window-data') {
        const mainData = event.data.data?.map(val => ({
          ...val,
          title,
        }));
        const getMp4Url = mainData?.[1].videoUrl;

        const mp4List = await (await fetch(getMp4Url)).json();
        cacheDate = mp4List;
        resolve(cacheDate);
        window.removeEventListener('message', handleMainDataMessage);
        script.remove();
      }
    };
    window.addEventListener('message', handleMainDataMessage);
  });
const hostMapGetUrls = {
  'pornhub.com': {
    getUrls: getPornhubUrls,
  },
  'pornhubpremium.com': {
    getUrls: getPornhubUrls,
  },
  'pornhub.org': {
    getUrls: getPornhubUrls,
  },
  'xvideos.com': {
    getUrls: getXvideosUrls,
  },
  'xvv1deos.com': {
    getUrls: getXvideosUrls,
  },
  'xnxx.es': {
    getUrl: getXvideosUrls,
  },
  'xnxx.com': {
    getUrls: getXvideosUrls,
  },
  'xhamster.com': {
    getUrls: getXhamsterUrls,
  },
  'xhamster42.desi': {
    getUrl: getXhamsterUrls,
  },
  'xhamster1.desi': {
    getUrl: getXhamsterUrls,
  },
  'xhamster.desi': {
    getUrl: getXhamsterUrls,
  },
  'redtube.com': {
    getUrls: getRedtube,
  },
};

export default hostMapGetUrls;
