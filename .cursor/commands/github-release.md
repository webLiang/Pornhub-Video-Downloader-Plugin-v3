---
name: /github-release
id: github-release
category: Release
description: Build CRX/ZIP, diff _locales vs previous tag, create GitHub Release (webLiang/Pornhub-Video-Downloader-Plugin-v3)
---

Publish a GitHub Release: https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3/releases

**Script**: `scripts/github-release.mjs`  
**Build**: `pnpm build:crx` (outputs `releases/<name>_v<version>.crx` and `.zip`)  
**Version**: root `package.json` `version` (must be bumped before release; `v<version>` must not already exist on GitHub)

---

## Pre-flight checks

1. Confirm `package.json` version is updated and higher than the latest tag (`git tag -l 'v*' --sort=-v:refname | head -1`).
2. Confirm GitHub CLI is installed and authenticated: `gh auth status`.
3. Working tree changes should be committed (the tag points at current HEAD).

---

## Workflow

### 1. Dry run (default)

```bash
node scripts/github-release.mjs --dry-run
```

Or:

```bash
pnpm release:github:dry
```

This will:

- Run `pnpm build:crx`
- Diff `public/_locales/**/messages.json` between the **previous tag** and **current HEAD** (Added/Updated/Removed per locale)
- Collect `git log <prevTag>..HEAD --oneline`
- Write `releases/RELEASE_NOTES_v<version>.md` and print it to the terminal

**Do not** create a tag or GitHub Release in this step.

### 2. User confirmation

Show the generated Release Notes summary to the user. If they need extra copy, ask for a markdown file path or bullet points from the conversation.

### 3. Publish

After the user confirms, run (skip rebuild if dry run already built):

```bash
node scripts/github-release.mjs --publish --skip-build --body-file releases/RELEASE_NOTES_v<version>.md
```

Optional flags:

| Flag | Description |
|------|-------------|
| `--body-file <path>` | Use this markdown as the full release body (skip auto-generation) |
| `--notes-file <path>` | Append markdown to the auto-generated "Additional notes" section |
| `--title "v1.2.0"` | Override release title (default: `v<version>`) |
| `--asset <path>` | Extra attachment (repeatable) |
| `--skip-build` | Skip `build:crx` (use after a successful dry run) |

Example (custom notes + extra attachment):

```bash
node scripts/github-release.mjs --publish \
  --skip-build \
  --notes-file ./docs/RELEASE_v1.2.0.md \
  --asset ./docs/install-guide.pdf
```

The script will:

1. Create an annotated tag `v<version>` (if it does not exist)
2. Run `gh release create` and upload `.crx`, `.zip`, and any `--asset` files
3. Remind the user to run `git push origin v<version>`

### 4. Push tag

```bash
git push origin v<version>
```

---

## Auto-generated Release Notes shape

```markdown
## vX.Y.Z

Compared to `vA.B.C`.

### Changes
- <git log one-liners>

### i18n / Locales
#### English (`en`)
- **Added** `key`: message
- **Updated** `key`: old → new

#### Chinese (`zh_CN`)
...

### Additional notes
<from --notes-file, optional>

### Install
Download `.crx` or `.zip` from GitHub Releases.
```

All locale folders under `public/_locales` are diffed (e.g. `en`, `zh_CN`, `es`, `ar`, `hi`).

---

## Example invocations

```
/github-release
```

Dry run only:

```
/github-release dry-run
```

Publish with a custom notes file (after user confirms):

```
/github-release publish notes ./docs/RELEASE_v1.2.0.md
```

With extra attachments:

```
/github-release publish notes ./RELEASE.md asset ./extra/readme.txt
```

---

## Do not

- **Do not** republish the same tag without bumping `package.json` version.
- **Do not** run `git push` or `git push --tags` unless the user explicitly asks.
- **Do not** auto-commit; the user must commit before tagging.
- If `gh release create` fails, fix the error and retry. Delete a local tag with `git tag -d vX.Y.Z` if needed (remote tag deletion is the user's decision).
