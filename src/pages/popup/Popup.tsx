import { useEffect, useState } from 'preact/hooks';
import logo from '@assets/img/logo.svg';
import '@pages/popup/Popup.css';

type VideoInfo = {
  videoUrl: string;
  quality: string;
  format: 'mp4' | 'webm';
  title: string;
};
const Popup = () => {
  const [videoInfos, setvideoInfos] = useState<Array<VideoInfo>>([]);
  useEffect(() => {
    sendMessageToContentScript({ command: 'get_video_info' }, function (response) {
      console.log('🚀 ~ response:', response);
      setvideoInfos(response);
      // console.log('Popup', response);
    });
    // Trigger your effect
    return () => {
      // Optional: Any cleanup code
    };
  }, []);
  const onDownload = (videoInfo: VideoInfo) => () => {
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
      </div>
      <div>
        Author By:{' '}
        <a rel="noreferrer" href="https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3" target="_blank">
          webLiang
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
                    清晰度：<span> {item.quality}</span>{' '}
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
