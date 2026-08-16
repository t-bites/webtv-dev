# WebTV — 开源 IPTV 播放平台

各国电视直播频道筛选、多源自动切换、EPG 节目单、多语言。

**数据来源**：[iptv-org](https://github.com/iptv-org) 生态（公开免费 IPTV 频道集合）
- [iptv-org/api](https://github.com/iptv-org/api) — 频道元数据 / 流地址 / EPG 索引（channels.json / streams.json / guides.json）
- [iptv-org/iptv](https://github.com/iptv-org/iptv) — 按国 m3u 播放列表（同频道多流 = 多源）
- [iptv-org/epg](https://github.com/iptv-org/epg) — 节目单（仅热门频道子集）

## 功能
- 🌍 按国家 / 🎭 分类 / 🗣️ 语言筛选频道
- ▶️ 网页内播放（hls.js），同频道多流失败自动切换
- 📋 EPG 节目单（热门频道）
- 🌐 多语言 UI + 频道多语言名
- 🔄 数据自动更新（cron 定期拉取重建）

## 架构
```
数据层（GitHub 直取）→ 处理层（pipeline 清洗/分片/来源标注）→ 站点层（静态站 + GitHub Pages）
```

## 目录规范
- `scripts/` — 数据拉取/处理/构建脚本
- `data/raw/` — 原始拉取数据（gitignore）
- `data/site/` — 站点产物（gitignore，单独发布）
- `docs/` — 项目文档
- `tests/` — 验证脚本

## 来源标注
所有频道/流均标注来源（iptv-org + 原始 provider）。版权归原频道所有，本项目仅聚合公开免费源。

## 法律声明
仅聚合公开可用流地址，不托管任何视频内容。侵权请联系移除（见 iptv-org blocklist 机制）。
