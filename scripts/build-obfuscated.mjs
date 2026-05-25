/**
 * Build & obfuscate core downloader modules.
 *
 * Pipeline per file:
 *   1. esbuild  – TS → ESM JS (tree-shake, minify identifiers)
 *   2. Skip when esbuild bundle hash matches cache (source unchanged)
 *   3. javascript-obfuscator – fixed seed per file for reproducible output
 *   4. Output to  src/pages/background/utils/dist/<name>.obf.js
 *
 * Usage:
 *   pnpm build:core          # build obfuscated modules
 *   pnpm build               # main build (Vite will pick up .obf.js via alias)
 *
 * The .ts source files should be added to .gitignore so only the
 * obfuscated .js files are committed / distributed.
 */

import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const UTILS_DIR = resolve(ROOT, 'src/pages/background/utils');
// Same path as standalone repo git@github.com:webLiang/video-download-core.git (git subtree)
const CORE_DIR = resolve(UTILS_DIR, 'video-download-core');
const OUT_DIR = resolve(UTILS_DIR, 'dist');
const CACHE_FILE = resolve(OUT_DIR, '.obf-build-cache.json');

// Files to process  { source, outputName }
const FILES = [
  { source: resolve(CORE_DIR, 'm3u8-downloader-core.ts'), outputName: 'm3u8-downloader-core.obf.js' },
  { source: resolve(CORE_DIR, 'mp4-downloader.ts'), outputName: 'mp4-downloader.obf.js' },
];

// External packages – keep as import statements, Vite will resolve them
const EXTERNAL = ['mux.js'];

// javascript-obfuscator options (medium protection, keep ESM exports working)
// reservedNames: background/index.ts calls these on downloader instances; obfuscating them breaks runtime.
const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false, // keep export names intact
  reservedNames: ['^pauseSoft$', '^resume$', '^destroy$', '^getBytesReceived$', '^start$'],
  rotateStringArray: true,
  selfDefending: false, // Service Worker doesn't support this
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  target: 'browser-no-eval', // Service Worker compatible
};

const hashContent = content => createHash('sha256').update(content).digest('hex');

const loadBuildCache = () => {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
};

const saveBuildCache = cache => {
  writeFileSync(`${CACHE_FILE}`, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8');
};

// Fixed seed per output file so obfuscation is reproducible across builds.
const getObfuscatorOptions = outputName => ({
  ...OBFUSCATOR_OPTIONS,
  seed: outputName.replace('.obf.js', ''),
});

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const buildCache = loadBuildCache();
  let cacheDirty = false;

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
    const inputHash = hashContent(jsCode);
    const outPath = resolve(OUT_DIR, outputName);
    console.log(`   esbuild ✅  ${(jsCode.length / 1024).toFixed(1)} KB`);

    if (buildCache[outputName] === inputHash && existsSync(outPath)) {
      console.log('   ⏭️  skipped (source bundle unchanged)');
      continue;
    }

    // Step 2: javascript-obfuscator (seed fixed → same input yields same output)
    const obfuscated = JavaScriptObfuscator.obfuscate(jsCode, getObfuscatorOptions(outputName));
    const obfCode = obfuscated.getObfuscatedCode();
    console.log(`   obfuscator ✅  ${(obfCode.length / 1024).toFixed(1)} KB`);

    // Step 3: Write output only when content actually changed
    const previousCode = existsSync(outPath) ? readFileSync(outPath, 'utf-8') : '';
    if (previousCode !== obfCode) {
      writeFileSync(outPath, obfCode, 'utf-8');
      console.log(`   → ${outPath}`);
    } else {
      console.log(`   → unchanged ${outPath}`);
    }

    buildCache[outputName] = inputHash;
    cacheDirty = true;
  }

  if (cacheDirty) {
    saveBuildCache(buildCache);
  }

  // NOTE: .d.ts declaration files are maintained manually in dist/
  // (self-contained, no references to source .ts files)

  console.log('\n✅  All done!\n');
}

main().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
