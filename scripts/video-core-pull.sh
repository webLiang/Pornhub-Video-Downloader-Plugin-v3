#!/usr/bin/env bash
# git subtree pull needs a clean working tree; stash local changes first, then pop after pull.
set -e
PREFIX="src/pages/background/utils/video-download-core"
REMOTE="video-core"
BRANCH="main"

STASHED=0
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "Working tree dirty; stashing before subtree pull…"
  git stash push -u -m "video-core:pull (auto-stash)"
  STASHED=1
fi

git subtree pull --prefix="$PREFIX" "$REMOTE" "$BRANCH" --squash

if [ "$STASHED" -eq 1 ]; then
  echo "Restoring stash with git stash pop…"
  if ! git stash pop; then
    echo "stash pop conflict; resolve manually (git status), then git stash drop when done"
    exit 1
  fi
fi
