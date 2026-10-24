#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""重新排版生成博客文章：保留原文案，加导语、优化结构，并精选配图。
- 复用 import_wechat 的抓取/解析能力
- 图片精选：封面(第1张) + 每 KEEP_EVERY 张取 1 张，单篇最多 MAX_PER_POST 张
- 已下载的图片复用，不重复抓取微信
- 输出 articles 到 content/posts/，引用图片清单到 scripts/referenced_imgs.txt
"""
import importlib.util, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT_DIR = os.path.join(ROOT, "content", "posts")
IMG_DIR = os.path.join(ROOT, "static", "img", "posts")
LIST_FILE = os.path.join(ROOT, "scripts", "wechat_import.txt")
spec = importlib.util.spec_from_file_location("iw", os.path.join(ROOT, "scripts", "import_wechat.py"))
iw = importlib.util.module_from_spec(spec); spec.loader.exec_module(iw)

KEEP_EVERY = 3
MAX_PER_POST = 6
FIG_RE = re.compile(r'<figure><img src="([^"]+)" alt="([^"]*)"></figure>')

def localize(md, slug):
    """把 markdown 里 mmbiz 图片下载到本地，替换路径；已存在则复用。"""
    dest_dir = os.path.join(IMG_DIR, slug)
    os.makedirs(dest_dir, exist_ok=True)
    n = 0
    def repl(m):
        nonlocal n
        src, alt = m.group(1), m.group(2)
        if src.startswith("data:"):
            return m.group(0)
        n += 1
        ext = ".jpg"
        if src.lower().endswith(".png"): ext = ".png"
        elif src.lower().endswith(".gif"): ext = ".gif"
        lpath = f"/img/posts/{slug}/{n:02d}{ext}"
        dpath = os.path.join(ROOT, "static", lpath.lstrip("/"))
        if not os.path.exists(dpath):
            iw.download(src, dpath)
        return f'<figure><img src="{lpath}" alt="{alt}"></figure>'
    return FIG_RE.sub(repl, md), n

def curate(md):
    figs = list(FIG_RE.finditer(md))
    keep = {0}
    i = 1
    while len(keep) < MAX_PER_POST and i < len(figs):
        if i % KEEP_EVERY == 0:
            keep.add(i)
        i += 1
    out, last = [], 0
    for idx, m in enumerate(figs):
        out.append(md[last:m.start()])   # 该图之前的正文
        if idx in keep:
            out.append(m.group(0))        # 完整保留 figure 标签
        last = m.end()
    out.append(md[last:])
    return "".join(out)

def count_fig(md):
    return len(FIG_RE.findall(md))

def process(url, category):
    html = iw.fetch(url)
    title = iw.get_title(html)
    slug = iw.slugify(title, url)
    date = iw.get_date(html)
    desc = iw.get_desc(html)[:130]
    content = iw.extract_content(html)
    md = iw.html_to_md(content)
    md, _ = localize(md, slug)
    md = curate(md)
    kept = count_fig(md)
    m = FIG_RE.search(md)
    cover = m.group(1) if m else ""
    lead = (f"> **导语：** {desc}\n\n" if desc else "")
    fm = (f"---\ntitle: \"{title.replace(chr(34),'')}\"\n"
          f"date: {date}\nlastmod: {date}\n"
          f"description: \"{desc.replace(chr(34),'')}\"\n"
          f"tags: ['{category}', '微信']\ncategories: ['{category}']\n"
          f"kicker: '{category}'\n"
          f"cover: '{cover}'\n"
          f"source: '{url}'\n---\n\n")
    footer = (f"\n\n---\n\n<p><small>本文首发于我的微信公众号，原文链接："
              f"<a href=\"{url}\" target=\"_blank\" rel=\"noopener\">{url}</a></small></p>\n")
    out = fm + lead + md + footer
    os.makedirs(CONTENT_DIR, exist_ok=True)
    with open(os.path.join(CONTENT_DIR, slug + ".md"), "w", encoding="utf-8") as f:
        f.write(out)
    return {"slug": slug, "title": title, "kept": kept}

def main():
    rows = []
    with open(LIST_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            p = line.split("\t")
            if len(p) >= 2:
                rows.append((p[0], p[1]))
    print(f"清单 {len(rows)} 条，开始重新排版生成")
    ok = 0
    for url, cat in rows:
        try:
            r = process(url, cat)
            ok += 1
            print(f"  ✅ {r['slug']}.md | {r['title'][:30]} | 精选配图 {r['kept']} 张")
        except Exception as e:
            print(f"  ❌ 失败 {url}: {e}")
    # 收集被引用的图片（用于后续只推送精选图）
    ref = set()
    for fn in os.listdir(CONTENT_DIR):
        if not fn.endswith(".md") or fn == "_index.md":
            continue
        with open(os.path.join(CONTENT_DIR, fn), encoding="utf-8") as f:
            t = f.read()
        for mp in re.findall(r'/img/posts/[^)\s"<>]+\.(?:jpg|jpeg|png|gif|webp)', t, re.I):
            ref.add(os.path.join(ROOT, mp.lstrip("/")))
    with open(os.path.join(ROOT, "scripts", "referenced_imgs.txt"), "w", encoding="utf-8") as f:
        for p in sorted(ref):
            f.write(p + "\n")
    print(f"完成生成 {ok}/{len(rows)}；引用图片 {len(ref)} 张，清单已写 scripts/referenced_imgs.txt")

if __name__ == "__main__":
    main()
