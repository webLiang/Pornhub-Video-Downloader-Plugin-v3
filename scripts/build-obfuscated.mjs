/**
 * Build & obfuscate core downloader modules.
 *
 * Pipeline per file:
 *   1. esbuild  – TS → ESM JS (tree-shake, minify identifiers)
 *   2. javascript-obfuscator – rename, flatten control-flow, etc.
 *   3. Output to  src/pages/background/utils/dist/<name>.obf.js
 *
 * Usage:
 *   pnpm build:core          # build obfuscated modules
 *   pnpm build               # main build (Vite will pick up .obf.js via alias)
 *
 * The .ts source files should be added to .gitignore so only the
 * obfuscated .js files are committed / distributed.
 */

import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const UTILS_DIR = resolve(ROOT, 'src/pages/background/utils');
const OUT_DIR = resolve(UTILS_DIR, 'dist');

// Files to process  { source, outputName }
const FILES = [
  { source: resolve(UTILS_DIR, 'm3u8-downloader-core.ts'), outputName: 'm3u8-downloader-core.obf.js' },
  { source: resolve(UTILS_DIR, 'mp4-downloader.ts'), outputName: 'mp4-downloader.obf.js' },
];

// External packages – keep as import statements, Vite will resolve them
const EXTERNAL = ['mux.js'];

// javascript-obfuscator options (medium protection, keep ESM exports working)
const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false, // keep export names intact
  rotateStringArray: true,
  selfDefending: false, // Service Worker doesn't support this
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  target: 'browser-no-eval', // Service Worker compatible
};

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const { source, outputName } of FILES) {
    console.log(`\n📦  Processing: ${source}`);

    // Step 1: esbuild  TS → JS (ESM)
    const result = await build({
      entryPoints: [source],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'esnext',
      minifySyntax: true,
      minifyWhitespace: false, // let obfuscator handle whitespace
      external: EXTERNAL,
      write: false,
    });

    const jsCode = result.outputFiles[0].text;
    console.log(`   esbuild ✅  ${(jsCode.length / 1024).toFixed(1)} KB`);

    // Step 2: javascript-obfuscator
    const obfuscated = JavaScriptObfuscator.obfuscate(jsCode, OBFUSCATOR_OPTIONS);
    const obfCode = obfuscated.getObfuscatedCode();
    console.log(`   obfuscator ✅  ${(obfCode.length / 1024).toFixed(1)} KB`);

    // Step 3: Write output
    const outPath = resolve(OUT_DIR, outputName);
    writeFileSync(outPath, obfCode, 'utf-8');
    console.log(`   → ${outPath}`);
  }

  // NOTE: .d.ts declaration files are maintained manually in dist/
  // (self-contained, no references to source .ts files)

  console.log('\n✅  All done!\n');
}

main().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
