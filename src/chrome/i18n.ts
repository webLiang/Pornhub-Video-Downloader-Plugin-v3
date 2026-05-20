import type EnMessages from '../../public/_locales/en/messages.json';
import enMessages from '../../public/_locales/en/messages.json';
import zhCNMessages from '../../public/_locales/zh_CN/messages.json';
import esMessages from '../../public/_locales/es/messages.json';
import arMessages from '../../public/_locales/ar/messages.json';
import hiMessages from '../../public/_locales/hi/messages.json';

type MessageKey = keyof typeof EnMessages;

type Substitutions = string | string[];

type MessagesShape = Record<MessageKey, { message: string }>;

export type SupportedLocale = 'en' | 'zh_CN' | 'es' | 'ar' | 'hi';
export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'zh_CN', 'es', 'ar', 'hi'];

const LOCALE_STORAGE_KEY = 'preferred_locale';
const DEFAULT_LOCALE: SupportedLocale = 'en';

const LOCALE_MESSAGES: Record<SupportedLocale, MessagesShape> = {
  en: enMessages as MessagesShape,
  zh_CN: zhCNMessages as MessagesShape,
  es: esMessages as MessagesShape,
  ar: arMessages as MessagesShape,
  hi: hiMessages as MessagesShape,
};

const localeListeners = new Set<(locale: SupportedLocale) => void>();

let activeLocale: SupportedLocale = resolveBrowserLocale();
let hasInitialized = false;

function resolveBrowserLocale(): SupportedLocale {
  const language = (navigator.language || '').toLowerCase();
  if (language.startsWith('zh')) return 'zh_CN';
  if (language.startsWith('es')) return 'es';
  if (language.startsWith('ar')) return 'ar';
  if (language.startsWith('hi')) return 'hi';
  return DEFAULT_LOCALE;
}

function isSupportedLocale(locale: unknown): locale is SupportedLocale {
  return typeof locale === 'string' && locale in LOCALE_MESSAGES;
}

function applySubstitutions(template: string, substitutions?: Substitutions) {
  if (!substitutions) return template;

  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  return values.reduce((text, value, index) => text.replaceAll(`$${index + 1}`, value), template);
}

function notifyLocaleChange() {
  localeListeners.forEach(listener => listener(activeLocale));
}

export function getCurrentLocale() {
  return activeLocale;
}

export async function initI18n() {
  if (hasInitialized) return activeLocale;
  hasInitialized = true;

  try {
    const result = await chrome.storage.local.get(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(result?.[LOCALE_STORAGE_KEY])) {
      activeLocale = result[LOCALE_STORAGE_KEY];
    }
  } catch (error) {
    console.warn('Failed to read preferred locale from storage', error);
  }

  return activeLocale;
}

export async function setCurrentLocale(locale: SupportedLocale) {
  if (!isSupportedLocale(locale)) return;
  activeLocale = locale;

  try {
    await chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: locale });
  } catch (error) {
    console.warn('Failed to persist preferred locale', error);
  }

  notifyLocaleChange();
}

export function subscribeLocaleChange(listener: (locale: SupportedLocale) => void) {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

export function translate(messageNameKey: MessageKey, substitutions?: Substitutions) {
  const currentBundle = LOCALE_MESSAGES[activeLocale];
  const fallbackBundle = LOCALE_MESSAGES[DEFAULT_LOCALE];
  const rawMessage = currentBundle?.[messageNameKey]?.message || fallbackBundle?.[messageNameKey]?.message;

  if (rawMessage) {
    return applySubstitutions(rawMessage, substitutions);
  }

  const translated = chrome.i18n?.getMessage(messageNameKey, substitutions);
  return translated || String(messageNameKey);
}
