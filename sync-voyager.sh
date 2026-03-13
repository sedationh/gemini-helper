#!/bin/bash
# 同步 gemini-voyager 到最新版本（覆盖本地所有改动）

set -e
cd "$(dirname "$0")"

REPO_URL="https://github.com/Nagi-ovo/gemini-voyager.git"
DIR="gemini-voyager"

echo "正在同步 $DIR ..."
rm -rf "$DIR"
git clone --depth 1 "$REPO_URL" "$DIR"
rm -rf "$DIR/.git"
echo "同步完成。"
