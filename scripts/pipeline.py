#!/usr/bin/env python3
"""webtv pipeline — 拉取 iptv-org 数据 → 清洗 → 生成站点分片
用法: python3 scripts/pipeline.py [--fetch] [--build]
  --fetch  从 GitHub 拉取原始数据（幂等，缓存存在则跳过）
  --build  生成站点分片 JSON（channels 索引 + 频道详情 + 多源 + EPG 子集）
默认两步都跑。

数据来源（全部公开）：
  iptv-org/api: channels/streams/guides/categories/languages/countries/blocklist
"""
import argparse, json, time, urllib.request
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).resolve().parent.parent
RAW = BASE / "data" / "raw"
SITE = BASE / "site"   # 站点部署根（site/data/ 数据产物 gitignore）
API_BASE = "https://iptv-org.github.io/api"
UA = {"User-Agent": "Mozilla/5.0 WebTV pipeline"}
EP_FRESH = 6 * 3600  # 6 小时缓存

# 热门频道阈值：EPG 只做这些（用户决策：EPG 仅热门）
TOP_CHANNELS = 300

def fetch_json(name, force=False):
    out = RAW / f"{name}.json"
    if out.exists() and not force and (time.time() - out.stat().st_mtime) < EP_FRESH:
        return json.load(open(out))
    url = f"{API_BASE}/{name}.json"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.load(r)
    out.write_text(json.dumps(d, ensure_ascii=False))
    print(f"  📥 {name}: {len(d)} 条")
    return d

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    do_fetch = args.fetch or not (args.build)
    do_build = args.build or not (args.fetch)
    RAW.mkdir(parents=True, exist_ok=True)
    SITE.mkdir(parents=True, exist_ok=True)

    # ---------- 1. 拉取 ----------
    if do_fetch:
        print("📦 拉取 iptv-org 数据...")
        channels = fetch_json("channels", args.force)
        streams = fetch_json("streams", args.force)
        guides = fetch_json("guides", args.force)
        categories = fetch_json("categories", args.force)
        languages = fetch_json("languages", args.force)
        countries = fetch_json("countries", args.force)
        blocklist = fetch_json("blocklist", args.force)
        logos = fetch_json("logos", args.force)
    else:
        channels = json.load(open(RAW / "channels.json"))
        streams = json.load(open(RAW / "streams.json"))
        guides = json.load(open(RAW / "guides.json"))
        categories = json.load(open(RAW / "categories.json"))
        languages = json.load(open(RAW / "languages.json"))
        countries = json.load(open(RAW / "countries.json"))
        blocklist = json.load(open(RAW / "blocklist.json"))
        logos = json.load(open(RAW / "logos.json"))

    # ---------- 2. 清洗 ----------
    print("🧹 清洗合并...")
    blocked = {b.get("channel") for b in blocklist if b.get("channel")}
    ch_map = {c["id"]: c for c in channels if not c.get("closed")}
    # 频道 → 流列表（多源）
    streams_by_ch = defaultdict(list)
    for s in streams:
        ch = s.get("channel")
        if ch and ch in ch_map and ch not in blocked and s.get("url"):
            streams_by_ch[ch].append(s)
    # 有流的频道（有效源）
    live_ch = {ch: ss for ch, ss in streams_by_ch.items() if ss}
    print(f"  有效频道: {len(live_ch)}（blocklist 过滤 {len(blocked)} 个频道）")

    # 国家/语言元数据
    cc_map = {c["code"]: c for c in countries}
    lang_map = {l["code"]: l for l in languages}
    # logo 映射（channel → url，取 in_use 优先）
    logo_map = {}
    for lo in logos:
        ch = lo.get("channel")
        if ch and ch not in blocked:
            if ch not in logo_map or (lo.get("in_use") and not logo_map[ch].get("in_use")):
                logo_map[ch] = lo

    # ---------- 3. 生成分片 ----------
    print("🗂️ 生成分片...")
    # 3.1 频道列表分片（按国家前缀分片，前端按需 fetch）
    # 条目字段：{id, n: name, c: country, g: categories, l: languages, lg: logo}
    ch_items = []
    for ch in sorted(live_ch, key=lambda x: ch_map[x]["name"].lower()):
        c = ch_map[ch]
        ch_items.append({
            "id": ch,
            "n": c["name"],
            "c": c.get("country", ""),
            "g": c.get("categories", []),
            "lg": (logo_map.get(ch) or {}).get("url") or "",
        })

    # 国家分片：country → channels
    by_country = defaultdict(list)
    for it in ch_items:
        by_country[it["c"]].append(it)
    countries_idx = {}
    for cc, items in sorted(by_country.items()):
        countries_idx[cc] = {"code": cc, "name": (cc_map.get(cc) or {}).get("name", cc), "count": len(items)}
        # 每国一文件
        (SITE / "data" / "by_country").mkdir(parents=True, exist_ok=True)
        (SITE / "data" / "by_country" / f"{cc}.json").write_text(
            json.dumps(items, ensure_ascii=False))

    # 分类分片
    by_cat = defaultdict(list)
    for it in ch_items:
        for g in it["g"]:
            by_cat[g].append(it)
    (SITE / "data" / "by_cat").mkdir(parents=True, exist_ok=True)
    for cat, items in by_cat.items():
        (SITE / "data" / "by_cat" / f"{cat}.json").write_text(
            json.dumps(items, ensure_ascii=False))

    # 3.2 频道详情 + 多源（每频道一文件，前端播放页用）
    (SITE / "data" / "ch").mkdir(parents=True, exist_ok=True)
    for ch, ss in live_ch.items():
        c = ch_map[ch]
        detail = {
            "id": ch,
            "name": c["name"],
            "alt_names": c.get("alt_names", []),
            "country": c.get("country", ""),
            "categories": c.get("categories", []),
            "website": c.get("website"),
            "network": c.get("network"),
            "logo": (logo_map.get(ch) or {}).get("url") or "",
            "sources": [{
                "url": s["url"],
                "quality": s.get("quality") or "",
                "title": s.get("title") or "",
                "ua": s.get("user_agent") or "",
                "referrer": s.get("referrer") or "",
                "origin": "iptv-org/iptv",
            } for s in ss],
        }
        (SITE / "data" / "ch" / f"{ch}.json").write_text(
            json.dumps(detail, ensure_ascii=False))

    # 3.3 索引
    idx = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M"),
        "total_channels": len(ch_items),
        "total_streams": sum(len(v) for v in streams_by_ch.values()),
        "multi_source": sum(1 for v in streams_by_ch.values() if len(v) >= 2),
        "countries": countries_idx,
        "categories": {c: len(by_cat[c]) for c in sorted(by_cat)},
        "data_sources": [
            {"name": "iptv-org/api", "url": "https://github.com/iptv-org/api", "type": "频道元数据/流地址/EPG索引"},
            {"name": "iptv-org/iptv", "url": "https://github.com/iptv-org/iptv", "type": "播放列表(多源流地址)"},
            {"name": "iptv-org/epg", "url": "https://github.com/iptv-org/epg", "type": "节目单"},
        ],
    }
    (SITE / "data" / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1))
    print(f"✅ 分片完成: {len(ch_items)} 频道 / {len(streams_by_ch)} 流 / {len(by_country)} 国 / {len(by_cat)} 分类")
    print(f"   索引: data/site/data/index.json")

if __name__ == "__main__":
    main()
