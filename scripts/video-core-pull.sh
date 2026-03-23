#!/usr/bin/env bash
# 拉取子模块：初始化（若未 clone）并在子仓库内 pull main
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUB_PATH="src/pages/background/utils/video-download-core"
cd "$ROOT"

if [ ! -f .gitmodules ] || ! grep -q "video-download-core" .gitmodules 2>/dev/null; then
  echo "尚未配置 submodule。请先执行: bash scripts/migrate-video-core-to-submodule.sh"
  exit 1
fi

git submodule update --init --recursive "$SUB_PATH"
git -C "$SUB_PATH" pull origin main
