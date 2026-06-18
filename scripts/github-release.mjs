#!/usr/bin/env node
/**
 * Build CRX/ZIP artifacts and create a GitHub Release with auto-generated notes.
 * Notes: detailed git Changes + multilingual user-facing highlights (not raw i18n key diffs).
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

/** Section headings for multilingual release summaries. */
const LOCALE_SECTION_TITLES = {
  en: 'English',
  zh_CN: '简体中文',
  es: 'Español',
  ar: 'العربية',
  hi: 'हिन्दी',
};

/** Fallback line when commits exist but no mapped highlights were detected. */
const GENERIC_IMPROVEMENTS = {
  en: 'Bug fixes and performance improvements.',
  zh_CN: '问题修复与性能优化。',
  es: 'Correcciones de errores y mejoras de rendimiento.',
  ar: 'إصلاحات للأخطاء وتحسينات في الأداء.',
  hi: 'बग फ़िक्स और प्रदर्शन में सुधार।',
};

/**
 * User-facing release bullets per theme and locale.
 * Extend when adding major UI features so multilingual sections stay accurate.
 */
const THEME_HIGHLIGHTS = {
  downloadSpeed: {
    en: 'Download queue shows real-time speed with a stable single-line layout (no layout shift when speed updates).',
    zh_CN: '下载队列显示实时速度，单行布局更稳定，速度文字变化时不再抖动。',
    es: 'La cola de descargas muestra la velocidad en tiempo real con un diseño estable en una sola línea.',
    ar: 'تعرض قائمة التحميل السرعة الفعلية بتخطيط ثابت في سطر واحد دون اهتزاز عند تغيّر السرعة.',
    hi: 'डाउनलोड कतार वास्तविक समय की गति दिखाती है, गति बदलने पर लेआउट स्थिर रहता है।',
  },
  taskDetails: {
    en: 'Queue task cards show video quality (resolution) and format type.',
    zh_CN: '下载队列任务卡片显示清晰度和视频格式类型。',
    es: 'Las tarjetas de la cola muestran la calidad del vídeo y el tipo de formato.',
    ar: 'تعرض بطاقات المهام في قائمة التحميل جودة الفيديو ونوع التنسيق.',
    hi: 'कतार कार्ड पर वीडियो गुणवत्ता (रिज़ॉल्यूशन) और प्रकार दिखाया जाता है।',
  },
  historyOpenPage: {
    en: 'Click a filename in download history to reopen the source page; refreshed history list styling.',
    zh_CN: '点击下载历史中的文件名可打开来源页面；历史列表样式优化。',
    es: 'Haz clic en un nombre de archivo del historial para abrir la página de origen; diseño del historial mejorado.',
    ar: 'انقر اسم الملف في سجل التحميل لفتح صفحة المصدر؛ تحسين مظهر قائمة السجل.',
    hi: 'डाउनलोड इतिहास में फ़ाइल नाम पर क्लिक करके स्रोत पृष्ठ खोलें; इतिहास सूची की शैली बेहतर।',
  },
  toastDuration: {
    en: 'Toast notifications dismiss faster for a less intrusive experience.',
    zh_CN: 'Toast 提示显示时间缩短，减少打扰。',
    es: 'Las notificaciones toast desaparecen más rápido para molestar menos.',
    ar: 'تختفي إشعارات Toast أسرع لتجربة أقل إزعاجاً.',
    hi: 'टोस्ट सूचनाएँ तेज़ी से गायब होती हैं, कम विचलित करने वाला अनुभव।',
  },
};

/** Map i18n message keys to release themes (used with locale diffs vs previous tag). */
const KEY_TO_THEME = {
  taskSpeed: 'downloadSpeed',
  taskQuality: 'taskDetails',
  taskFormat: 'taskDetails',
  historyTooltipOpenPage: 'historyOpenPage',
};

/** Match commit subject/body text to release themes. */
const COMMIT_THEME_RULES = [
  { theme: 'downloadSpeed', test: /speed|jitter|layout|queue.*ui|task-speed/i },
  { theme: 'taskDetails', test: /quality|format|task-detail|taskQuality|taskFormat|清晰度|格式/i },
  { theme: 'historyOpenPage', test: /history|pageUrl|open.*page|download history/i },
  { theme: 'toastDuration', test: /toast/i },
];

/** @typedef {{ notesFile?: string, bodyFile?: string, assets: string[], dryRun: boolean, publish: boolean, skipBuild: boolean, commit: boolean, push: boolean, title?: string, commitMessage?: string }} CliOptions */

/** Parse CLI flags for release workflow. */
function parseArgs(argv) {
  /** @type {CliOptions} */
  const options = {
    assets: [],
    dryRun: false,
    publish: false,
    skipBuild: false,
    commit: false,
    push: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--publish') {
      options.publish = true;
    } else if (arg === '--full') {
      options.publish = true;
      options.commit = true;
      options.push = true;
    } else if (arg === '--commit') {
      options.commit = true;
    } else if (arg === '--push') {
      options.push = true;
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
    } else if (arg === '--commit-message') {
      options.commitMessage = argv[i + 1];
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
  --full                 Shorthand: --publish --commit --push (one-shot release)
  --commit               git add -A && git commit before tagging (use with --publish)
  --push                 git push current branch + release tag after publish
  --skip-build           Skip pnpm build:crx
  --body-file <path>     Use this markdown as the full release notes (skip auto-generation)
  --notes-file <path>    Append custom markdown to auto-generated release notes
  --commit-message <msg> Commit message (default: chore: release v<version>)
  --title <text>         Override release title (default: v<package.json version>)
  --asset <path>         Extra file to attach (repeatable)

Examples:
  node scripts/github-release.mjs --dry-run
  node scripts/github-release.mjs --full
  node scripts/github-release.mjs --publish --commit --push
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

/** Collect i18n keys added or changed in en since previous tag. */
function collectChangedMessageKeys(prevTag) {
  if (!prevTag) return [];
  const diff = diffLocaleMessages(prevTag, 'en');
  if (!diff) return [];
  return [...new Set([...diff.added, ...diff.changed])];
}

/** Detect release themes from locale diffs and commit messages. */
function detectReleaseThemes(prevTag, commits) {
  const themes = new Set();
  for (const key of collectChangedMessageKeys(prevTag)) {
    const theme = KEY_TO_THEME[key];
    if (theme) themes.add(theme);
  }
  for (const commit of commits) {
    const text = `${commit.subject} ${commit.body}`;
    for (const rule of COMMIT_THEME_RULES) {
      if (rule.test.test(text)) themes.add(rule.theme);
    }
  }
  return [...themes];
}

/** Collect git commits with hash, subject, and body since previous tag. */
function collectDetailedCommits(prevTag) {
  if (!prevTag) return [];
  try {
    const out = run(`git log ${prevTag}..HEAD --no-merges --format=%H%x09%s%x09%b%x1e`);
    return out
      .split('\x1e')
      .map(block => block.trim())
      .filter(Boolean)
      .map(block => {
        const [hash, subject, ...bodyParts] = block.split('\t');
        return {
          hash: (hash || '').slice(0, 7),
          subject: subject || '',
          body: bodyParts.join('\t').trim(),
        };
      })
      .filter(commit => commit.subject);
  } catch {
    return [];
  }
}

/** True when commit should be excluded from release notes. */
function isExcludedCommit(subject) {
  if (/^chore(\([^)]*\))?:\s*release\b/i.test(subject)) return true;
  if (/^chore(\([^)]*\))?:\s*bump version/i.test(subject)) return true;
  return false;
}

/** True when commit subject is worth an English user-facing bullet. */
function isUserFacingCommit(subject) {
  if (/^(docs|style)(\(|:)/i.test(subject)) return false;
  if (/documentation|comments and documentation|readme/i.test(subject)) return false;
  return true;
}

/** Strip conventional-commit prefix for English summary bullets. */
function commitToSummary(subject) {
  const match = subject.match(/^(?:feat|fix|perf|refactor|style|docs)(?:\([^)]*\))?:\s*(.+)$/i);
  if (match) return match[1];
  if (/^chore/i.test(subject)) return null;
  return subject;
}

/** Format detailed Changes section from commit list. */
function formatChangesSection(commits) {
  const releaseCommits = commits.filter(commit => !isExcludedCommit(commit.subject));
  if (!releaseCommits.length) {
    return ['- No commits since previous tag (or first release).'];
  }

  const lines = [];
  for (const commit of releaseCommits.slice(0, 40)) {
    lines.push(`- **${commit.subject}** (\`${commit.hash}\`)`);
    if (commit.body) {
      for (const line of commit.body.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) lines.push(`  ${trimmed}`);
      }
    }
  }
  if (releaseCommits.length > 40) {
    lines.push(`- … and ${releaseCommits.length - 40} more commits`);
  }
  return lines;
}

/** Build multilingual user-facing highlight sections (not raw i18n key diffs). */
function buildMultilingualSections(prevTag, commits) {
  const themes = detectReleaseThemes(prevTag, commits);
  const releaseCommits = commits.filter(commit => !isExcludedCommit(commit.subject));
  if (!themes.length && !releaseCommits.length) return [];

  const localeOrder = ['en', 'zh_CN', 'es', 'ar', 'hi'];
  const sections = [];

  for (const locale of localeOrder) {
    const bullets = [];
    const seen = new Set();

    for (const theme of themes) {
      const text = THEME_HIGHLIGHTS[theme]?.[locale];
      if (text && !seen.has(text)) {
        bullets.push(`- ${text}`);
        seen.add(text);
      }
    }

    if (locale === 'en') {
      for (const commit of releaseCommits) {
        if (!isUserFacingCommit(commit.subject)) continue;
        const summary = commitToSummary(commit.subject);
        if (summary && !seen.has(summary)) {
          bullets.push(`- ${summary}`);
          seen.add(summary);
        }
      }
    }

    if (!bullets.length && releaseCommits.length) {
      bullets.push(`- ${GENERIC_IMPROVEMENTS[locale] || GENERIC_IMPROVEMENTS.en}`);
    }
    if (!bullets.length) continue;

    const title = LOCALE_SECTION_TITLES[locale] || locale;
    sections.push(`### ${title}`, '', ...bullets, '');
  }

  return sections;
}

/** Build default CRX/ZIP artifact paths from package metadata. */
function defaultArtifactPaths(name, version) {
  return {
    crx: path.join(RELEASES_DIR, `${name}_v${version}.crx`),
    zip: path.join(RELEASES_DIR, `${name}_v${version}.zip`),
  };
}

/** Generate full release notes markdown. */
function buildReleaseNotes({ version, prevTag, customNotesPath, commits, multilingualSections }) {
  const lines = [`## v${version}`, ''];

  if (prevTag) {
    lines.push(`Compared to \`${prevTag}\`.`, '');
  }

  lines.push('### Changes', '');
  lines.push(...formatChangesSection(commits), '');

  if (multilingualSections.length) {
    lines.push('### Release highlights', '', ...multilingualSections);
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

/** Ensure gh CLI is installed and authenticated before publish/commit steps. */
function assertGhReady() {
  let ghMissing = false;
  try {
    run('gh --version');
  } catch {
    ghMissing = true;
  }

  if (ghMissing) {
    console.error('\nGitHub CLI (gh) is required for --publish / --full.\n');
    console.error('Install:');
    console.error('  macOS:   brew install gh');
    console.error('  Windows: winget install GitHub.cli');
    console.error('  Linux:   see https://github.com/cli/cli#installation');
    console.error('\nThen authenticate:');
    console.error('  gh auth login');
    console.error('\nDocs: https://cli.github.com/\n');
    process.exit(1);
  }

  try {
    run('gh auth status --hostname github.com');
  } catch {
    console.error('\ngh is installed but not authenticated.\n');
    console.error('Run:  gh auth login\n');
    process.exit(1);
  }
}

/** Return true when the working tree has staged or unstaged changes. */
function hasWorkingTreeChanges() {
  return Boolean(run('git status --porcelain'));
}

/** Stage all changes and commit; no-op when tree is clean. */
function commitRelease(version, commitMessage) {
  if (!hasWorkingTreeChanges()) {
    console.log('Working tree clean; skipping commit.');
    return false;
  }

  const message = commitMessage || `chore: release v${version}`;
  runOrExit('git add -A');
  runOrExit(`git commit -m ${JSON.stringify(message)}`);
  console.log(`Committed: ${message}`);
  return true;
}

/** Push current branch and release tag to origin. */
function pushRelease(tag) {
  const branch = run('git rev-parse --abbrev-ref HEAD');
  runOrExit(`git push origin ${branch}`, { inherit: true });

  const tagPush = spawnSync(`git push origin ${tag}`, {
    cwd: ROOT,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (tagPush.status === 0) {
    console.log(`Pushed branch ${branch} and tag ${tag} to origin.`);
    return;
  }

  const stderr = tagPush.stderr?.toString() || '';
  if (stderr.includes('already exists') || stderr.includes('rejected')) {
    console.warn(`Tag ${tag} already exists on origin; branch push succeeded, skipping tag push.`);
    return;
  }

  console.error(stderr || `git push origin ${tag} failed`);
  process.exit(tagPush.status || 1);
}

/** Create annotated tag locally if missing. */
function ensureTag(tag, version) {
  const tags = listVersionTags();
  if (tags.includes(tag)) {
    console.log(`Tag ${tag} already exists, reusing it.`);
    return;
  }

  if (hasWorkingTreeChanges()) {
    console.warn('Warning: working tree has uncommitted changes; tag will point at current HEAD.');
  }

  runOrExit(`git tag -a ${tag} -m "Release v${version}"`);
  console.log(`Created tag ${tag}`);
}

/** Upload release via gh CLI (assets are positional file args in gh 2.x+). */
function publishRelease({ tag, title, notesPath, assets }) {
  const parts = [
    'gh release create',
    tag,
    `--repo ${REPO}`,
    `--title ${JSON.stringify(title)}`,
    `--notes-file ${JSON.stringify(notesPath)}`,
    ...assets.map(file => JSON.stringify(file)),
  ];
  runOrExit(parts.join(' '), { inherit: true });
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

  const commits = prevTag ? collectDetailedCommits(prevTag) : [];
  const multilingualSections = prevTag ? buildMultilingualSections(prevTag, commits) : [];
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
      multilingualSections,
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
    console.log(`  pnpm release:github:full`);
    console.log('Or step by step:');
    console.log(
      `  node scripts/github-release.mjs --publish --commit --push --body-file ${path.relative(ROOT, notesPath)}`,
    );
    return;
  }

  // Check gh before commit so a failed publish does not leave a release commit without a tag.
  assertGhReady();

  if (options.commit) {
    commitRelease(version, options.commitMessage);
  } else if (hasWorkingTreeChanges()) {
    console.warn('Warning: uncommitted changes remain; tag will not include them unless you use --commit.');
  }

  ensureTag(tag, version);
  publishRelease({ tag, title, notesPath, assets });

  if (options.push) {
    pushRelease(tag);
  } else {
    console.log('\nPush when ready:');
    console.log(`  git push origin HEAD && git push origin ${tag}`);
  }
}

main();
