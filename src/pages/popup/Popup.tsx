import { useEffect, useState } from 'preact/hooks';
import logo from '@assets/img/logo.svg';
import '@pages/popup/Popup.css';

type VideoInfo = {
  videoUrl: string;
  quality: string;
  format: 'mp4' | 'webm' | 'm3u8';
  title: string;
};
const manifestData = chrome.runtime.getManifest();
const Popup = () => {
  const [videoInfos, setvideoInfos] = useState<Array<VideoInfo>>([]);
  const [remoteVersion, setRemoteVersion] = useState('0.0.0');
  useEffect(() => {
    sendMessageToContentScript({ command: 'get_video_info' }, function (response) {
      console.log('🚀 ~ response:', response);
      setvideoInfos(response);
      // console.log('Popup', response);
    });

    function fetchVersion() {
      fetch('https://raw.githubusercontent.com/webLiang/Pornhub-Video-Downloader-Plugin-v3/master/package.json')
        .then(response => response.json())
        .then(data => {
          const version = data.version;
          setRemoteVersion(version);
          console.log('Version updated:', version, data);
        })
        .catch(error => console.error('Error fetching version:', error));
    }
    fetchVersion();
    // Trigger your effect
    return () => {
      // Optional: Any cleanup code
    };
  }, []);
  const onDownload = (videoInfo: VideoInfo) => () => {
    if (videoInfo.format === 'm3u8') {
      let url = 'https://blog.luckly-mjw.cn/tool-show/m3u8-downloader/index.html';
      url += `?source=${decodeURIComponent(videoInfo.videoUrl)}`;
      window.open(url);
      return;
    }
    chrome.downloads.download({
      url: videoInfo.videoUrl,
      filename: `${videoInfo.title}.${videoInfo.format}`,
    });
  };

  const onCopy = (videoInfo: VideoInfo) => () => {
    navigator.clipboard.writeText(videoInfo.videoUrl);
  };
  return (
    <div className="App" style={{}}>
      {videoInfos.length > 0 && <img src={logo} className="App-logo" alt="logo" />}
      <div>
        <h2>视频下载插件</h2>
        <h3>
          当前版本：{manifestData.version} --- 远程版本：{remoteVersion}
        </h3>
      </div>
      <div>
        Author By:{' '}
        <a rel="noreferrer" href="https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3" target="_blank">
          webLiang
        </a>
        <br />
        <a
          rel="noreferrer"
          href="https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3/releases"
          target="_blank">
          获取最新版本
        </a>
      </div>
      <div className="box">
        <ul>
          {videoInfos &&
            videoInfos.length > 0 &&
            videoInfos.map(item => {
              return (
                <li key={item.videoUrl}>
                  <label>
                    清晰度：<span style={{ display: 'inline-block', width: '60px' }}> {item.quality}</span>
                  </label>
                  <label>
                    类型： <span style={{ display: 'inline-block', width: '40px' }}> {item.format}</span>
                  </label>
                  <button className="button down" onClick={onDownload(item)}>
                    下载
                  </button>{' '}
                  <button className="button copy" onClick={onCopy(item)}>
                    复制
                  </button>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
};

function sendMessageToContentScript(message, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    // 向当前选中的tab发送消息
    // console.log('popup send')
    chrome.tabs.sendMessage(tabs[0].id, message, function (response) {
      // console.log(response);
      if (callback) callback(response);
      return true;
    });
  });
}

export default Popup;
