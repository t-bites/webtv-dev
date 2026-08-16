#!/usr/bin/env python3
"""探测 iptv-org/api 各端点可用性 + 规模，输出到 data/raw/"""
import json, urllib.request, time
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)
BASE = "https://iptv-org.github.io/api"
UA = {"User-Agent": "Mozilla/5.0 WebTV research"}

ENDPOINTS = ["channels", "streams", "guides", "categories", "languages", "countries", "regions", "blocklist"]

def fetch(name):
    url = f"{BASE}/{name}.json"
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=60) as r:
            d = json.load(r)
        out = RAW / f"{name}.json"
        out.write_text(json.dumps(d, ensure_ascii=False))
        print(f"✅ {name}.json: {len(d)} 条 → {out.name}")
        return d
    except Exception as e:
        print(f"❌ {name}: {e}")
        return None

for ep in ENDPOINTS:
    d = fetch(ep)
    if d and ep == "streams":
        print("   stream 样例:", json.dumps(d[0], ensure_ascii=False)[:250])
    time.sleep(0.3)
