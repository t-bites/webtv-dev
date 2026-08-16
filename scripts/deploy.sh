#!/bin/bash
# webtv 部署到 GitHub Pages（站点仓 t-bites/webtv，公开）
set -e
cd "$(dirname "$(readlink -f "$0")")/.."
TOKEN=$(python3 -c "
import re
for line in open('/home/tao/.git-credentials'):
    m = re.match(r'https://([^:]+):([^@]+)@github.com', line)
    if m and m.group(1) == 'taoy3260-alt':
        print(m.group(2)); break
")
SITE_REPO="https://taoy3260-alt:${TOKEN}@github.com/t-bites/webtv.git"
TMP=$(mktemp -d)
cp -r site/* "$TMP/"
cd "$TMP"
git init -b main
git config user.name "t-bites"
git config user.email "taoy3260@gmail.com"
git add -A
git commit -q -m "deploy: $(date '+%F %H:%M')"
git push -f "$SITE_REPO" main
cd - > /dev/null
rm -rf "$TMP"
echo "✅ 已部署 site/ → t-bites/webtv"
