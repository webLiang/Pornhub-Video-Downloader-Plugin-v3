import type { PluginOption } from 'vite';

/**
 * Content scripts are classic scripts (not type=module), so `import.meta` is a SyntaxError.
 * Vite 8's __vitePreload helper injects `import.meta.resolve` / `import.meta.url` even when
 * modulePreload is false — replace them with classic-script-safe fallbacks.
 */
export default function fixContentImportMeta(): PluginOption {
  return {
    name: 'fix-content-import-meta',
    renderChunk(code, chunk) {
      if (!/content/i.test(chunk.fileName)) {
        return null;
      }
      if (!code.includes('import.meta')) {
        return null;
      }

      // resolve is unused when preload deps are empty; url fallback keeps relative resolution sane
      // if deps are ever non-empty in a future Vite build.
      const rewritten = code
        .replace(/\bimport\.meta\.resolve\b/g, 'undefined')
        .replace(/\bimport\.meta\.url\b/g, '(document.currentScript&&document.currentScript.src||location.href)');

      if (rewritten === code) {
        return null;
      }

      return { code: rewritten, map: null };
    },
  };
}
