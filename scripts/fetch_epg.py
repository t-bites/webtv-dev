#!/usr/bin/env python3
"""fetch_epg.py — 分批抓取 EPG（规避 Node OOM）
将 channels.xml 拆成 N 批，每批单独跑 iptv-org/epg grab，最后合并为 webtv-guide.xml。
用法: python3 scripts/fetch_epg.py [--batches 4] [--days 2] [--max 200]
"""
import re, subprocess, sys, time
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
RAW = BASE / "data" / "raw"
EPG_DIR = Path("/tmp/epg")
CHANNELS = RAW / "webtv.channels.xml"
OUT = RAW / "webtv-guide.xml"

def split_channels(n):
    """把 channels.xml 拆成 n 批文件"""
    text = CHANNELS.read_text(encoding="utf-8")
    lines = [l for l in text.splitlines() if l.strip().startswith("<channel")]
    total = len(lines)
    per = max(1, total // n)
    parts = []
    for i in range(n):
        chunk = lines[i * per:(i + 1) * per] if i < n - 1 else lines[i * per:]
        if not chunk:
            break
        p = RAW / f"webtv.channels.part{i + 1}.xml"
        p.write_text('<?xml version="1.0" encoding="UTF-8"?>\n<channels>\n' + "\n".join(chunk) + "\n</channels>\n", encoding="utf-8")
        parts.append(p)
    return parts, total

def main():
    n = 4
    days = 2
    parts, total = split_channels(n)
    print(f"📄 拆成 {len(parts)} 批，共 {total} 个频道（EPG 子集）")
    xmls = []
    for i, p in enumerate(parts, 1):
        out = RAW / f"webtv-guide.part{i}.xml"
        cmd = ["npm", "run", "grab", "--",
               f"--channels={p}", f"--output={out}", f"--days={days}"]
        print(f"⏳ 批次 {i}/{len(parts)}: {len(parts[i-1].read_text().count('<channel'))} 频道 ...")
        t0 = time.time()
        r = subprocess.run(cmd, cwd=EPG_DIR, capture_output=True, text=True,
                           env={**__import__("os").environ, "NODE_OPTIONS": "--max-old-space-size=4096"})
        dt = time.time() - t0
        if out.exists() and out.stat().st_size > 0:
            xmls.append(out)
            print(f"  ✅ 批次 {i} 完成 ({dt:.0f}s, {out.stat().st_size//1024}KB)")
        else:
            print(f"  ❌ 批次 {i} 失败 ({dt:.0f}s)")
            print("   " + (r.stderr.strip().splitlines()[-3:] or ["无错误"]).__str__())
    # 合并
    if not xmls:
        print("❌ 所有批次失败"); sys.exit(1)
    channels_sec, progs = [], []
    for x in xmls:
        t = x.read_text(encoding="utf-8")
        m = re.search(r"<channel[^>]*>[^<]*(?:<[^>]*>[^<]*)*</channel>", t)
        # 简单合并：抽 channel 和 programme 行
        for line in t.splitlines():
            s = line.strip()
            if s.startswith("<channel") or s.startswith("<programme"):
                (channels_sec if s.startswith("<channel") else progs).append(s)
    header = '<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n'
    body = "\n".join(channels_sec) + "\n" + "\n".join(progs)
    OUT.write_text(header + body + "\n</tv>\n", encoding="utf-8")
    for x in xmls:
        x.unlink()
    for p in RAW.glob("webtv.channels.part*.xml"):
        p.unlink()
    print(f"✅ 合并完成: {OUT} ({len(channels_sec)} 频道, {len(progs)} 节目)")

if __name__ == "__main__":
    main()
