let pornMp4Infos;
const injectScript = (filePath, tag) => {
  const node = document.getElementsByTagName(tag)[0];
  const script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('src', filePath);
  script.setAttribute('id', 'inject');
  node.appendChild(script);
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
    if (xvideosMp4Infos) {
      resolve2(xvideosMp4Infos);
      return;
    }
    const handleXvMessage = async event => {
      console.log('🚀 ~ handleXvMessage ~ event:', event);
      if (event.data.type === 'main-get-xv-info') {
        xvideosMp4Infos = event.data.data;
        resolve2(xvideosMp4Infos);
        window.removeEventListener('message', handleXvMessage);
        script.remove();
      }
    };
    window.addEventListener('message', handleXvMessage);
    const script = injectScript(chrome.runtime.getURL('js/get-xv-info.js'), 'body');
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
};

export default hostMapGetUrls;
