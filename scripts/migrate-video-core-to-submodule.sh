#!/usr/bin/env bash
# 一次性迁移：把「主仓库内联的 video-download-core」改为子模块。
# 前置：远端 git@github.com:webLiang/video-download-core.git 的 main 已有代码
#       （可先执行旧命令：pnpm exec git subtree split ... push，或在本目录单独 push 过）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUB_PATH="src/pages/background/utils/video-download-core"
SUB_URL="${VIDEO_CORE_URL:-git@github.com:webLiang/video-download-core.git}"

cd "$ROOT"

if [ -f .gitmodules ] && grep -q "video-download-core" .gitmodules 2>/dev/null; then
  echo "已存在 submodule 配置，无需再迁移。拉代码: pnpm video-core:init"
  exit 0
fi

if [ ! -d .git ]; then
  echo "错误：请在主仓库根目录执行"
  exit 1
fi

if ! git ls-remote --heads "$SUB_URL" main >/dev/null 2>&1; then
  echo "警告：无法访问 $SUB_URL 的 main，请先确认远端存在且本机有权限。"
  echo "可先推送一次子树: pnpm video-core:push-subtree-once"
  exit 1
fi

echo ">>> 从主仓库移除目录（仅索引+工作区）: $SUB_PATH"
if [ -d "$SUB_PATH" ]; then
  git rm -rf "$SUB_PATH"
else
  echo "目录不存在，跳过 git rm"
fi

echo ">>> 添加 submodule: $SUB_URL -> $SUB_PATH"
git submodule add "$SUB_URL" "$SUB_PATH"

echo ">>> 完成。请检查差异后提交主仓库，例如："
echo "    git add .gitmodules $SUB_PATH"
echo "    git commit -m 'chore: 将 video-download-core 改为 git submodule'"
echo "之后子仓库开发: cd $SUB_PATH && 改代码 && git push origin main"
echo "主仓库更新指针: cd $ROOT && git add $SUB_PATH && git commit -m 'chore: bump video-download-core'"
