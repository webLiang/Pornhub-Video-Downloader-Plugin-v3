#!/usr/bin/env node
/**
 * Build CRX/ZIP artifacts and create a GitHub Release with auto-generated notes.
 * Locale diffs: public/_locales vs previous git tag.
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'public', '_locales');
const RELEASES_DIR = path.join(ROOT, 'releases');
const REPO = 'webLiang/Pornhub-Video-Downloader-Plugin-v3';
const RELEASES_URL = `https://github.com/${REPO}/releases`;

const LOCALE_LABELS = {
  en: 'English',
  zh_CN: '中文',
  es: 'Español',
  ar: 'العربية',
  hi: 'हिंदी',
};

/** @typedef {{ notesFile?: string, bodyFile?: string, assets: string[], dryRun: boolean, publish: boolean, skipBuild: boolean, title?: string }} CliOptions */

/** Parse CLI flags for release workflow. */
function parseArgs(argv) {
  /** @type {CliOptions} */
  const options = {
    assets: [],
    dryRun: false,
    publish: false,
    skipBuild: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--publish') {
      options.publish = true;
    } else if (arg === '--skip-build') {
      options.skipBuild = true;
    } else if (arg === '--notes-file') {
      options.notesFile = argv[i + 1];
      i += 1;
    } else if (arg === '--body-file') {
      options.bodyFile = argv[i + 1];
      i += 1;
    } else if (arg === '--title') {
      options.title = argv[i + 1];
      i += 1;
    } else if (arg === '--asset') {
      options.assets.push(argv[i + 1]);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  if (options.publish && options.dryRun) {
    console.error('Use either --dry-run or --publish, not both.');
    process.exit(1);
  }

  return options;
}

/** Print usage help. */
function printHelp() {
  console.log(`Usage: node scripts/github-release.mjs [options]

Options:
  --dry-run              Build + write release notes only (default when --publish omitted)
  --publish              Create git tag and GitHub release (requires gh CLI)
  --skip-build           Skip pnpm build:crx
  --body-file <path>     Use this markdown as the full release notes (skip auto-generation)
  --notes-file <path>    Append custom markdown to auto-generated release notes
  --title <text>         Override release title (default: v<package.json version>)
  --asset <path>         Extra file to attach (repeatable)

Examples:
  node scripts/github-release.mjs --dry-run
  node scripts/github-release.mjs --publish --body-file ./releases/RELEASE_NOTES_v1.2.0.md --skip-build
  node scripts/github-release.mjs --publish --notes-file ./docs/extra-notes.md
  node scripts/github-release.mjs --publish --asset ./docs/install-guide.pdf
`);
}

/** Run shell command and return stdout. */
function run(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

/** Run shell command; exit on failure. */
function runOrExit(cmd, opts = {}) {
  const result = spawnSync(cmd, {
    cwd: ROOT,
    shell: true,
    stdio: opts.inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';
    console.error(stderr || `Command failed: ${cmd}`);
    process.exit(result.status || 1);
  }
  return result.stdout?.toString().trim() ?? '';
}

/** Read package.json name and version. */
function readPackageMeta() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return { name: pkg.name, version: pkg.version };
}

/** List version tags sorted newest first (v*). */
function listVersionTags() {
  try {
    const out = run("git tag -l 'v*' --sort=-v:refname");
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Previous release tag relative to target version (latest tag strictly older). */
function getPreviousTag(version, tags) {
  const currentTag = `v${version}`;
  const older = tags.filter(tag => tag !== currentTag);
  return older[0] || null;
}

/** Load messages.json at git ref; null if missing. */
function loadMessagesAtRef(ref, locale) {
  const filePath = `public/_locales/${locale}/messages.json`;
  try {
    const raw = run(`git show ${ref}:${filePath}`);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Load messages.json from working tree. */
function loadMessagesFromDisk(locale) {
  const filePath = path.join(LOCALES_DIR, locale, 'messages.json');
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Diff locale messages between previous tag and HEAD (working tree). */
function diffLocaleMessages(prevTag, locale) {
  const before = loadMessagesAtRef(prevTag, locale);
  const after = loadMessagesFromDisk(locale);
  if (!after) return null;

  const beforeKeys = new Set(before ? Object.keys(before) : []);
  const afterKeys = new Set(Object.keys(after));
  const added = [...afterKeys].filter(key => !beforeKeys.has(key));
  const removed = [...beforeKeys].filter(key => !afterKeys.has(key));
  const changed = [...afterKeys].filter(key => {
    if (!beforeKeys.has(key)) return false;
    return before[key].message !== after[key].message;
  });

  if (!added.length && !removed.length && !changed.length) {
    return null;
  }

  return { added, removed, changed, after, before };
}

/** List locale folder names under public/_locales. */
function listLocales() {
  if (!fs.existsSync(LOCALES_DIR)) return [];
  return fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

/** Format one locale diff block for release notes. */
function formatLocaleSection(locale, diff) {
  const label = LOCALE_LABELS[locale] || locale;
  const lines = [`#### ${label} (\`${locale}\`)`];

  for (const key of diff.added) {
    lines.push(`- **Added** \`${key}\`: ${diff.after[key].message}`);
  }
  for (const key of diff.changed) {
    const oldMsg = diff.before?.[key]?.message ?? '(missing)';
    const newMsg = diff.after[key].message;
    lines.push(`- **Updated** \`${key}\`: ${oldMsg} → ${newMsg}`);
  }
  for (const key of diff.removed) {
    lines.push(`- **Removed** \`${key}\``);
  }

  return lines.join('\n');
}

/** Collect git commit one-liners since previous tag. */
function collectCommitLog(prevTag) {
  if (!prevTag) return [];
  try {
    const out = run(`git log ${prevTag}..HEAD --oneline --no-merges`);
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Build default CRX/ZIP artifact paths from package metadata. */
function defaultArtifactPaths(name, version) {
  return {
    crx: path.join(RELEASES_DIR, `${name}_v${version}.crx`),
    zip: path.join(RELEASES_DIR, `${name}_v${version}.zip`),
  };
}

/** Generate full release notes markdown. */
function buildReleaseNotes({ version, prevTag, customNotesPath, commits, localeSections }) {
  const lines = [`## v${version}`, ''];

  if (prevTag) {
    lines.push(`Compared to \`${prevTag}\`.`, '');
  }

  lines.push('### Changes', '');
  if (commits.length) {
    for (const line of commits.slice(0, 40)) {
      lines.push(`- ${line}`);
    }
    if (commits.length > 40) {
      lines.push(`- … and ${commits.length - 40} more commits`);
    }
  } else {
    lines.push('- No commits since previous tag (or first release).');
  }
  lines.push('');

  lines.push('### i18n / Locales', '');
  if (localeSections.length) {
    lines.push(...localeSections, '');
  } else {
    lines.push('No locale message changes in `public/_locales`.', '');
  }

  if (customNotesPath) {
    const abs = path.resolve(ROOT, customNotesPath);
    if (!fs.existsSync(abs)) {
      console.error(`Notes file not found: ${abs}`);
      process.exit(1);
    }
    lines.push('### Additional notes', '', fs.readFileSync(abs, 'utf8').trim(), '');
  }

  lines.push('### Install', '');
  lines.push(`Download \`.crx\` or \`.zip\` from [GitHub Releases](${RELEASES_URL}).`, '');

  return `${lines.join('\n').trim()}\n`;
}

/** Ensure gh CLI is available when publishing. */
function assertGhReady() {
  try {
    run('gh --version');
  } catch {
    console.error('GitHub CLI (gh) is required for --publish. Install: https://cli.github.com/');
    process.exit(1);
  }

  try {
    run(`gh auth status --hostname github.com`);
  } catch {
    console.error('gh is not authenticated. Run: gh auth login');
    process.exit(1);
  }
}

/** Create annotated tag locally if missing. */
function ensureTag(tag, version) {
  const tags = listVersionTags();
  if (tags.includes(tag)) {
    console.log(`Tag ${tag} already exists, reusing it.`);
    return;
  }

  const clean = run('git status --porcelain');
  if (clean) {
    console.warn('Warning: working tree has uncommitted changes; tag will point at current HEAD.');
  }

  runOrExit(`git tag -a ${tag} -m "Release v${version}"`);
  console.log(`Created tag ${tag}`);
}

/** Upload release via gh CLI. */
function publishRelease({ tag, title, notesPath, assets }) {
  const assetArgs = assets.flatMap(file => ['--attach', file]);
  const cmd = [
    'gh release create',
    tag,
    `--repo ${REPO}`,
    `--title ${JSON.stringify(title)}`,
    `--notes-file ${JSON.stringify(notesPath)}`,
    ...assetArgs,
  ].join(' ');

  runOrExit(cmd, { inherit: true });
  console.log(`\nRelease published: ${RELEASES_URL}/tag/${tag}`);
}

/** Main entry. */
function main() {
  const options = parseArgs(process.argv.slice(2));
  const { name, version } = readPackageMeta();
  const tag = `v${version}`;
  const title = options.title || tag;
  const tags = listVersionTags();

  if (tags.includes(tag) && options.publish) {
    const existing = run(`gh release view ${tag} --repo ${REPO} --json url -q .url 2>/dev/null || true`);
    if (existing) {
      console.error(`Release ${tag} already exists: ${existing}`);
      console.error('Bump package.json version before publishing a new release.');
      process.exit(1);
    }
  }

  const prevTag = getPreviousTag(version, tags);
  console.log(`Version: ${version}`);
  console.log(`Previous tag: ${prevTag || '(none)'}`);

  if (!options.skipBuild) {
    console.log('\nRunning pnpm build:crx …');
    runOrExit('pnpm build:crx', { inherit: true });
  }

  const artifacts = defaultArtifactPaths(name, version);
  for (const file of [artifacts.crx, artifacts.zip]) {
    if (!fs.existsSync(file)) {
      console.error(`Missing artifact: ${file}`);
      process.exit(1);
    }
  }

  const localeSections = [];
  for (const locale of listLocales()) {
    if (!prevTag) continue;
    const diff = diffLocaleMessages(prevTag, locale);
    if (diff) {
      localeSections.push(formatLocaleSection(locale, diff));
    }
  }

  const commits = prevTag ? collectCommitLog(prevTag) : [];
  let notes;
  if (options.bodyFile) {
    const abs = path.resolve(ROOT, options.bodyFile);
    if (!fs.existsSync(abs)) {
      console.error(`Body file not found: ${abs}`);
      process.exit(1);
    }
    notes = fs.readFileSync(abs, 'utf8').trim() + '\n';
  } else {
    notes = buildReleaseNotes({
      version,
      prevTag,
      customNotesPath: options.notesFile,
      commits,
      localeSections,
    });
  }

  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  const notesPath = path.join(RELEASES_DIR, `RELEASE_NOTES_v${version}.md`);
  fs.writeFileSync(notesPath, notes, 'utf8');
  console.log(`\nRelease notes written: ${notesPath}\n`);
  console.log(notes);

  const assets = [artifacts.crx, artifacts.zip, ...options.assets.map(p => path.resolve(ROOT, p))];
  for (const file of assets) {
    if (!fs.existsSync(file)) {
      console.error(`Asset not found: ${file}`);
      process.exit(1);
    }
  }

  if (!options.publish) {
    console.log('\nDry run complete. To publish:');
    console.log(
      `  node scripts/github-release.mjs --publish --skip-build --body-file ${path.relative(ROOT, notesPath)}`,
    );
    return;
  }

  assertGhReady();
  ensureTag(tag, version);
  publishRelease({ tag, title, notesPath, assets });

  console.log('\nPush tag to remote when ready:');
  console.log(`  git push origin ${tag}`);
}

main();
