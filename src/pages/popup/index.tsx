import { render } from 'preact';
import '@pages/popup/index.css';
import Popup from '@pages/popup/Popup';
import refreshOnUpdate from 'virtual:reload-on-update-in-view';
import { translate } from '@src/chrome/i18n';

refreshOnUpdate('pages/popup');

function init() {
  const appContainer = document.querySelector('#app-container');
  document.title = translate('popupTitle');

  return render(<Popup />, appContainer);
}

init();
