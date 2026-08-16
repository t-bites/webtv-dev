#!/bin/bash
# webtv 部署到 GitHub Pages（站点仓 t-bites/webtv）
set -e
cd "$(dirname "$(readlink -f "$0")")/.."
SITE_REPO="git@github.com:t-bites/webtv.git"
TMP=$(mktemp -d)
cp -r site/* "$TMP/"
cd "$TMP"
git init -b main
git add -A
git commit -q -m "deploy: $(date '+%F %H:%M')"
git push -f "$SITE_REPO" main
cd - > /dev/null
rm -rf "$TMP"
echo "✅ 已部署 site/ → t-bites/webtv"
