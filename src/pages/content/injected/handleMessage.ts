// import exampleThemeStorage from '@src/shared/storages/exampleThemeStorage';
import hostMapGetUrls from './hostMapGetUrls';
import { getTopDomain } from './utils';
import refreshOnUpdate from 'virtual:reload-on-update-in-view';

refreshOnUpdate('pages/content/injected/toggleTheme');
const curTopDomain = getTopDomain();
// cache
hostMapGetUrls[curTopDomain]?.getUrls();

async function handleMessage() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('recived message:', message, sender);
    if (sender.id != chrome.runtime.id)
      // Accept only messages from our extension
      return;
    if (message.command === 'get_video_info') {
      (async function () {
        const videoUrls = await hostMapGetUrls[curTopDomain]?.getUrls();
        sendResponse(videoUrls);
      })();
    }
    return true;
  });
}

void handleMessage();
