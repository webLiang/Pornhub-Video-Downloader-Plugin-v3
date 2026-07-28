import type { PluginOption } from 'vite';

/**
 * Rewrite relative dynamic import() paths for Firefox content scripts.
 * Vite 8 / Rolldown removed the renderDynamicImport hook, so we rewrite
 * string-literal import() calls in renderChunk instead.
 *
 * Relative import() in Firefox content scripts can resolve against the page URL;
 * prefixing with browser.runtime.getURL("./") and stripping "../" keeps chunks
 * loadable from the extension package.
 */
export default function customDynamicImport(): PluginOption {
  return {
    name: 'custom-dynamic-import',
    renderChunk(code) {
      if (process.env.__FIREFOX__ !== 'true') {
        return null;
      }

      // Match import("rel"), import('rel'), and import(`rel`) (Oxc may emit backticks).
      // Skip variables and absolute URLs; only rewrite relative string literals.
      const rewritten = code.replace(/\bimport\((['"`])(\.\.?\/[^'"`]+)\1\)/g, (match, quote, relPath) => {
        return `{const dynamicImport=(path)=>import(path);dynamicImport(browser.runtime.getURL("./")+${quote}${relPath}${quote}.split("../").join(""))}`;
      });

      if (rewritten === code) {
        return null;
      }

      return { code: rewritten, map: null };
    },
  };
}
