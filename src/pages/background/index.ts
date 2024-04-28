import reloadOnUpdate from 'virtual:reload-on-update-in-background-script';
import 'webextension-polyfill';

reloadOnUpdate('pages/background');

/**
 * Extension reloading is necessary because the browser automatically caches the css.
 * If you do not use the css of the content script, please delete it.
 */
reloadOnUpdate('pages/content/style.scss');

console.log('background loaded');

// chrome.action.onClicked.addListener(tab => {
//   // Do something when popup is opened
//   console.log('Popup opened on tab:', tab);
// });

// chrome.action.onClicked.addListener(tab => {
//   // 打开 popup 页面时触发的逻辑
//   // 可以在此处执行你的操作
//   console.log('Popup opened');
// });
