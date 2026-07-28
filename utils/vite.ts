import { type PluginOption } from 'vite';
import makeManifest from './plugins/make-manifest';
import customDynamicImport from './plugins/custom-dynamic-import';
import addHmr from './plugins/add-hmr';
import watchRebuild from './plugins/watch-rebuild';
import fixContentImportMeta from './plugins/fix-content-import-meta';
// inlineVitePreloadScript is disabled for Vite 8 / Rolldown: it scrapes
// meta.chunks for a /preload/ chunk, which is unreliable under Rolldown.
// See utils/plugins/inline-vite-preload-script.ts (kept for reference).

export const getPlugins = (isDev: boolean): PluginOption[] => [
  makeManifest({ getCacheInvalidationKey }),
  customDynamicImport(),
  // Content scripts are classic scripts — strip Vite 8 preload import.meta usage
  fixContentImportMeta(),
  // You can toggle enable HMR in background script or view
  addHmr({ background: true, view: true, isDev }),
  isDev && watchRebuild({ afterWriteBundle: regenerateCacheInvalidationKey }),
];

const cacheInvalidationKeyRef = { current: generateKey() };

export function getCacheInvalidationKey() {
  return cacheInvalidationKeyRef.current;
}

function regenerateCacheInvalidationKey() {
  cacheInvalidationKeyRef.current = generateKey();
  return cacheInvalidationKeyRef;
}

function generateKey(): string {
  return `${Date.now().toFixed()}`;
}
