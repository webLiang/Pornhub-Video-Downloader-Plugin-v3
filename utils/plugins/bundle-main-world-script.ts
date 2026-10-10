import { build } from 'esbuild';
import { resolve } from 'node:path';
import type { PluginOption } from 'vite';

/** Bundle the MAIN-world manifest entry as a classic script, without shared ESM imports. */
export default function bundleMainWorldScript(): PluginOption {
  return {
    name: 'bundle-main-world-script',
    async generateBundle(_options, bundle) {
      const entry = bundle['src/pages/injectedMain/index.js'];
      if (!entry || entry.type !== 'chunk') return;
      const result = await build({
        entryPoints: [resolve('src/pages/content/injectedMain/index.ts')],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'chrome109',
        minify: true,
        write: false,
      });
      entry.code = result.outputFiles[0].text;
      entry.imports = [];
      entry.dynamicImports = [];
      entry.exports = [];
    },
  };
}
