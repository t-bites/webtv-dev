#!/usr/bin/env python3
"""build_epg_channels.py — 从 iptv-org guides 选热门频道子集，生成 channels.xml
供 iptv-org/epg 官方工具抓取真实节目单（tvg-id 精确匹配）。
用户决策（2026-08-16）：EPG 只准备热门频道，其余暂不加。
"""
import json
from pathlib import Path
from collections import Counter, defaultdict

BASE = Path(__file__).resolve().parent.parent
RAW = BASE / "data" / "raw"
OUT = BASE / "data" / "raw" / "webtv.channels.xml"
TOP_N = 200  # 热门频道数

def main():
    channels = json.load(open(RAW / "channels.json"))
    streams = json.load(open(RAW / "streams.json"))
    guides = json.load(open(RAW / "guides.json"))
    blocklist = json.load(open(RAW / "blocklist.json"))
    blocked = {b.get("channel") for b in blocklist if b.get("channel")}

    # 有流频道 + 流数（多源=更热门更稳）
    stream_cnt = Counter(s["channel"] for s in streams if s.get("channel") and s.get("channel") not in blocked and s.get("url"))
    # 有 EPG 源的频道
    guide_by_ch = defaultdict(list)
    for g in guides:
        if g.get("channel") and g.get("site"):
            guide_by_ch[g["channel"]].append(g)
    ch_map = {c["id"]: c for c in channels if not c.get("closed")}

    # 候选 = 有流 + 有EPG
    cand = []
    for ch, gs in guide_by_ch.items():
        if ch not in stream_cnt or ch not in ch_map:
            continue
        cand.append({
            "id": ch, "name": ch_map[ch]["name"], "streams": stream_cnt[ch],
            "guides": gs, "country": ch_map[ch].get("country", ""),
        })
    # 排序：多源优先 → 国家分布
    cand.sort(key=lambda x: -x["streams"])
    # 简单去重：每国最多取 15 个，保证全球覆盖
    per_country = defaultdict(int)
    picked = []
    for c in cand:
        if len(picked) >= TOP_N:
            break
        if per_country[c["country"]] < 15:
            per_country[c["country"]] += 1
            picked.append(c)
    print(f"候选 {len(cand)} → 选取 {len(picked)} 个热门频道（EPG 子集）")

    # 生成 channels.xml（iptv-org/epg 格式）
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', "<channels>"]
    for c in picked:
        g = c["guides"][0]
        lines.append(f'  <channel site="{g["site"]}" lang="{g.get("lang","en")}" xmltv_id="{c["id"]}" site_id="{g.get("site_id","")}">{c["name"]}</channel>')
    lines.append("</channels>")
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"✅ channels.xml: {OUT} ({len(picked)} 频道)")

    # 顺便输出选取列表供参考
    ref = BASE / "data" / "raw" / "epg_hot_channels.json"
    ref.write_text(json.dumps([{"id": c["id"], "name": c["name"], "country": c["country"], "streams": c["streams"]} for c in picked], ensure_ascii=False, indent=1))
    print(f"   参考列表: {ref.name}")

if __name__ == "__main__":
    main()
