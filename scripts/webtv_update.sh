#!/bin/bash
# webtv_update.sh — 每日自动更新：拉取 iptv-org → 重建分片 → 部署 GitHub Pages
set -e
cd "$(dirname "$(readlink -f "$0")")/.."
LOG=logs/update.log
mkdir -p logs
echo "=== $(date '+%F %H:%M') webtv 自动更新开始 ===" >> "$LOG"

# 1. 拉取 + 重建分片（--force 强制刷新缓存）
python3 scripts/pipeline.py --fetch --build --force >> "$LOG" 2>&1 || { echo "❌ pipeline 失败" >> "$LOG"; exit 1; }

# 2. 部署站点
bash scripts/deploy.sh >> "$LOG" 2>&1 || { echo "❌ deploy 失败" >> "$LOG"; exit 1; }

echo "✅ 更新完成" >> "$LOG"
