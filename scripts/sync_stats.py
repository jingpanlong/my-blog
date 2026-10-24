#!/usr/bin/env python3
"""同步文章浏览量 / 点赞数到 data/post-stats.json。

背景：Hugo 是纯静态站，浏览量与点赞存在 Cloudflare Worker(KV) 里，
构建时无法直接读取。本脚本在构建前（或每日定时任务中）遍历所有文章，
从 Worker 拉取最新计数，写入 data/post-stats.json，供首页「精选文章」
按「浏览量 + 点赞量」加权排序。

用法：
    python scripts/sync_stats.py
"""
import os
import re
import json
import sys
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS_DIR = os.path.join(ROOT, "content", "posts")
OUT = os.path.join(ROOT, "data", "post-stats.json")

API_VIEWS = "https://like-counter.470918507.workers.dev/views"
API_LIKES = "https://like-counter.470918507.workers.dev"

# 直连，忽略系统代理（CI / 本机代理环境下都能用）
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def fetch_json(url, timeout=12):
    req = urllib.request.Request(url, headers={"User-Agent": "blog-stats-sync/1.0"})
    with _opener.open(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def count_of(url, path):
    try:
        d = fetch_json(url + "?path=" + urllib.parse.quote(path, safe=""))
        return int(d.get("count") or 0)
    except Exception:
        return None


def main():
    names = [
        n[:-3]
        for n in os.listdir(POSTS_DIR)
        if n.endswith(".md") and n != "_index.md"
    ]
    names.sort()

    old = {}
    if os.path.isfile(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            old = {}

    def work(slug):
        path = f"/posts/{slug}/"
        v = count_of(API_VIEWS, path)
        l = count_of(API_LIKES, path)
        prev = old.get(path) or {}
        if v is None:
            v = int(prev.get("views") or 0)
        if l is None:
            l = int(prev.get("likes") or 0)
        return path, {"views": v, "likes": l}

    stats = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for path, rec in ex.map(work, names):
            stats[path] = rec

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(dict(sorted(stats.items())), f, ensure_ascii=False, indent=2)
        f.write("\n")

    tv = sum(r["views"] for r in stats.values())
    tl = sum(r["likes"] for r in stats.values())
    top = sorted(stats.items(), key=lambda kv: (kv[1]["views"] + 3 * kv[1]["likes"]), reverse=True)[:5]
    print(f"synced {len(stats)} posts | total views={tv} likes={tl} -> {os.path.relpath(OUT, ROOT)}")
    for p, r in top:
        print(f"  TOP {r['views']:>6}v {r['likes']:>4}l  {p}")


if __name__ == "__main__":
    main()
