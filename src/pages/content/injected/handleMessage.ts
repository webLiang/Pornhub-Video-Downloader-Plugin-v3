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
    // Only return true for async get_video_info; otherwise the sendMessage channel stays open
    // and popup → background download-queue-* messages never get sendResponse.
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
