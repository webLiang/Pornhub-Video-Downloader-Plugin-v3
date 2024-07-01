import { Parser } from 'm3u8-parser';
let pornMp4Infos;
const injectScript = (filePath, tag) => {
  const node = document.getElementsByTagName(tag)[0];
  const script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('src', filePath);
  script.setAttribute('id', 'inject');
  node?.appendChild(script);
  return script;
};

const title = document.title.replace(/[\\\\/:*?\\"<>\s|.]/g, '');
const getPornhubUrls = () =>
  new Promise(resolve2 => {
    if (pornMp4Infos) {
      resolve2(pornMp4Infos);
      return;
    }
    const handleMessage = async event => {
      if (event.data.type === 'get-ph-flashvars') {
        console.log('recived message:', event.data);
        const mp4UrlInfo = event.data.data.find(val => val.format === 'mp4');

        if (mp4UrlInfo) {
          const mp4InfoList = (await fetch(mp4UrlInfo.videoUrl).then(res => res.json()))?.map(val => ({
            ...val,
            title: title,
          }));
          console.log('🚀 ~ handleMessage ~ mp4InfoList:', mp4InfoList);
          pornMp4Infos = mp4InfoList;
          resolve2(mp4InfoList);
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
      if (event.data.type === 'main-get-xv-info') {
        const mp4list = event.data.data;
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
            };
            m3u8List.push(obj);
          }
          console.log('🚀 ~ playlists.sort ~ playlists:', playlists, m3u8List);
        }
        console.log(33444444, xvideosMp4Infos, m3u8List, mp4list);
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
        xHMp4Infos = event.data.data;
        resolve2(xHMp4Infos);
        window.removeEventListener('message', handleXvMessage);
        script.remove();
      }
    };
    window.addEventListener('message', handleXvMessage);
  });
const hostMapGetUrls = {
  'pornhub.com': {
    getUrls: getPornhubUrls,
  },
  'xvideos.com': {
    getUrls: getXvideosUrls,
  },
  'xnxx.com': {
    getUrls: getXvideosUrls,
  },
  'xhamster.com': {
    getUrls: getXhamsterUrls,
  },
};

export default hostMapGetUrls;
