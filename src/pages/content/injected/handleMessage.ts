// import exampleThemeStorage from '@src/shared/storages/exampleThemeStorage';
import hostMapGetUrls from './hostMapGetUrls';
import { curTopDomain } from '@src/shared/utils';
import refreshOnUpdate from 'virtual:reload-on-update-in-view';

refreshOnUpdate('pages/content/injected/toggleTheme');
// cache
hostMapGetUrls[curTopDomain]?.getUrls();

async function handleMessage() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('recived message:', message, sender);
    if (sender.id != chrome.runtime.id) {
      // Accept only messages from our extension
      return false;
    }
    // 只对 get_video_info 异步响应；不可对所有消息 return true，否则会占住 sendMessage 通道，
    // 导致 popup → background 的 download-queue-* 等消息收不到 sendResponse。
    if (message.command === 'get_video_info') {
      void (async function () {
        const videoUrls = await hostMapGetUrls[curTopDomain]?.getUrls();
        const pageTitle = document.title || '';
        sendResponse({
          pageTitle,
          videoInfos: videoUrls || [],
        });
      })();
      return true;
    }
    return false;
  });
}

void handleMessage();
