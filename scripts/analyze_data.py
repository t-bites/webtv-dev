#!/usr/bin/env python3
"""分析 iptv-org 数据关联结构（channels ↔ streams ↔ blocklist）"""
import json
from pathlib import Path
from collections import Counter

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
channels = json.load(open(RAW / "channels.json"))
streams = json.load(open(RAW / "streams.json"))
blocklist = json.load(open(RAW / "blocklist.json"))

# 1. streams 关联
with_ch = sum(1 for s in streams if s.get("channel"))
print(f"streams 总数: {len(streams)}, 关联频道: {with_ch} ({with_ch*100//len(streams)}%)")
ch_ids = {c["id"] for c in channels}
valid_ch = sum(1 for s in streams if s.get("channel") in ch_ids)
print(f"streams 关联到有效频道: {valid_ch}")

# 2. 频道有多少有流
ch_with_stream = {s["channel"] for s in streams if s.get("channel") in ch_ids}
print(f"有流的频道数: {len(ch_with_stream)} / {len(ch_ids)}")

# 3. 多源分布（同频道多个流）
cnt = Counter(s["channel"] for s in streams if s.get("channel") in ch_ids)
multi = sum(1 for c in cnt.values() if c >= 2)
print(f"多源频道(≥2流): {multi}")

# 4. blocklist 覆盖
bl_ids = {b["channel"] for b in blocklist if b.get("channel")}
print(f"blocklist 频道数: {len(bl_ids)}")

# 5. channels 字段结构
print("\nchannels 字段:", sorted(channels[0].keys()))
# 6. 国家/分类/语言 覆盖
countries = Counter(c.get("country") for c in channels)
print(f"国家数: {len(countries)}, top10: {countries.most_common(10)}")
cats = Counter()
for c in channels:
    for cat in c.get("categories", []):
        cats[cat] += 1
print(f"分类 top15: {cats.most_common(15)}")

# 7. stream 字段
print("\nstream 字段:", sorted(streams[0].keys()))
ua = sum(1 for s in streams if s.get("user_agent"))
ref = sum(1 for s in streams if s.get("referrer"))
print(f"带 user_agent: {ua}, 带 referrer: {ref}")
qual = Counter(s.get("quality") for s in streams)
print(f"质量分布: {qual.most_common(10)}")
