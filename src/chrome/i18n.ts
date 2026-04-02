import type EnMessages from '../../public/_locales/en/messages.json';

type MessageKey = keyof typeof EnMessages;

type Substitutions = string | string[];

export function translate(messageNameKey: MessageKey, substitutions?: Substitutions) {
  // chrome.i18n is available in extension pages. This fallback keeps tests/dev tools safe.
  const translated = chrome.i18n?.getMessage(messageNameKey, substitutions);
  return translated || String(messageNameKey);
}
