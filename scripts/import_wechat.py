#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把微信公众号文章批量搬运到 Hugo 博客（content/posts/）。
纯标准库实现：urllib 抓取 + html.parser 转 Markdown + 下载配图 + 文末带原文链接。

用法：
  python scripts/import_wechat.py probe    # 只处理清单首行，打印解析结果不落盘
  python scripts/import_wechat.py run      # 处理全部清单并写文件（默认）
清单：scripts/wechat_import.txt，每行： URL<TAB>分类(随笔/文章/项目)
"""
import sys, os, re, json, time, hashlib, urllib.request, urllib.parse
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT_DIR = os.path.join(ROOT, "content", "posts")
IMG_DIR = os.path.join(ROOT, "static", "img", "posts")
LIST_FILE = os.path.join(ROOT, "scripts", "wechat_import.txt")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

# ------------------------- 抓取 -------------------------
def fetch(url, referer="https://mp.weixin.qq.com/"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": referer})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "ignore")

def get_meta(html, prop):
    m = re.search(r'<meta[^>]+property=["\']' + prop + r'["\'][^>]+content=["\']([^"\']+)["\']', html)
    if m: return m.group(1)
    m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']' + prop + r'["\']', html)
    return m.group(1) if m else ""

def get_title(html):
    m = re.search(r'<h1[^>]*id="activity-name"[^>]*>(.*?)</h1>', html, re.S)
    if m: return strip_tags(m.group(1)).strip()
    t = get_meta(html, "og:title")
    return t.strip() if t else "未命名文章"

def get_cover(html):
    c = get_meta(html, "og:image")
    if c: return c.strip()
    m = re.search(r'<img[^>]+id="js_cover"[^>]+src="([^"]+)"', html)
    return m.group(1).strip() if m else ""

def get_date(html):
    for pat in [r'ct\s*=\s*"?(\d{10,13})"?', r'publish_time\s*=\s*"?(\d{10,13})"?',
                r'"pub_time"\s*:\s*(\d{10,13})', r'ct"\s*:\s*"?(\d{10,13})"?']:
        m = re.search(pat, html)
        if m:
            ts = int(m.group(1))
            if ts > 1e12: ts //= 1000
            return time.strftime("%Y-%m-%d", time.localtime(ts))
    return "2026-01-01"

def get_desc(html):
    d = get_meta(html, "og:description")
    if d: return d.strip()
    m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']', html)
    return m.group(1).strip() if m else ""

def extract_content(html):
    idx = html.find('id="js_content"')
    if idx == -1: return ""
    gt = html.find('>', idx)
    depth, i = 1, gt + 1
    while i < len(html):
        if html[i:i+4] == "<div": depth += 1; i += 4
        elif html[i:i+6] == "</div>": depth -= 1; i += 6; 
        if depth == 0: break
        else: i += 1
    return html[gt+1:i]

def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s)

# ------------------------- HTML -> Markdown -------------------------
class MD(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []; self.cur = []
        self.bold = 0; self.ital = 0
        self.in_list = None; self.ol = 0
        self.skip = 0; self.link_href = ""

    def flush(self):
        if self.cur:
            self.out.append("".join(self.cur)); self.cur = []

    def rbuf(self, t):  # 追加到当前行缓冲
        self.cur.append(t)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style"): self.skip += 1; return
        if self.skip: return
        if tag == "h1": self.flush(); self.out.append("\n# ")
        elif tag == "h2": self.flush(); self.out.append("\n## ")
        elif tag == "h3": self.flush(); self.out.append("\n### ")
        elif tag == "h4": self.flush(); self.out.append("\n#### ")
        elif tag in ("p", "section"): self.flush(); self.rbuf("\n")
        elif tag == "br": self.rbuf("\n")
        elif tag in ("strong", "b"): self.bold += 1; self.rbuf("**")
        elif tag in ("em", "i"): self.ital += 1; self.rbuf("*")
        elif tag == "blockquote": self.flush(); self.out.append("\n> ")
        elif tag == "ul": self.flush(); self.in_list = "ul"
        elif tag == "ol": self.flush(); self.in_list = "ol"; self.ol = 0
        elif tag == "li":
            self.flush()
            if self.in_list == "ol": self.ol += 1; self.rbuf(f"{self.ol}. ")
            else: self.rbuf("- ")
        elif tag == "img": self.handle_img(a)
        elif tag == "a":
            self.rbuf("["); self.link_href = a.get("href", "")
        elif tag in ("code", "pre"): self.rbuf("`")
        elif tag == "hr": self.flush(); self.out.append("\n---\n")

    def handle_endtag(self, tag):
        if self.skip:
            if tag in ("script", "style"): self.skip -= 1
            return
        if tag == "h1": self.flush(); self.out.append("\n\n")
        elif tag == "h2": self.flush(); self.out.append("\n\n")
        elif tag == "h3": self.flush(); self.out.append("\n\n")
        elif tag == "h4": self.flush(); self.out.append("\n\n")
        elif tag in ("p", "section"): self.flush(); self.out.append("\n")
        elif tag in ("strong", "b"): self.bold = max(0, self.bold-1); self.rbuf("**")
        elif tag in ("em", "i"): self.ital = max(0, self.ital-1); self.rbuf("*")
        elif tag == "blockquote": self.flush(); self.out.append("\n")
        elif tag in ("ul", "ol"): self.flush(); self.in_list = None; self.out.append("\n")
        elif tag == "a":
            txt = "".join(self.cur); self.cur = []
            self.out.append(f"]({self.link_href})")
        elif tag in ("code", "pre"): self.rbuf("`")

    def handle_data(self, data):
        if self.skip: return
        self.cur.append(data)

    def handle_img(self, a):
        src = a.get("data-src") or a.get("src") or ""
        alt = a.get("alt", "")
        self.flush()
        self.out.append(f'\n<figure><img src="{src}" alt="{alt}"></figure>\n')

def html_to_md(html):
    p = MD(); p.feed(html); p.flush()
    md = "".join(p.out)
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md.strip() + "\n"

# ------------------------- 配图下载 -------------------------
def download(src, dest):
    try:
        req = urllib.request.Request(src, headers={"User-Agent": UA, "Referer": "https://mp.weixin.qq.com/"})
        with urllib.request.urlopen(req, timeout=25) as r:
            data = r.read()
        with open(dest, "wb") as f: f.write(data)
        return True
    except Exception as e:
        print(f"  图片下载失败 {src[:60]} -> {e}")
        return False

def localize_images(md, slug):
    """把 markdown 里 mmbiz 图片下载到本地，替换路径。"""
    dest_dir = os.path.join(IMG_DIR, slug)
    os.makedirs(dest_dir, exist_ok=True)
    n = 0
    def repl(m):
        nonlocal n
        tag, src, alt = m.group(0), m.group(1), m.group(2)
        if src.startswith("data:"): return tag
        n += 1
        ext = ".jpg"
        if src.lower().endswith(".png"): ext = ".png"
        elif src.lower().endswith(".gif"): ext = ".gif"
        lpath = f"/img/posts/{slug}/{n:02d}{ext}"
        dpath = os.path.join(ROOT, "static", lpath.lstrip("/"))
        if download(src, dpath):
            return f'<figure><img src="{lpath}" alt="{alt}"></figure>'
        return f'<figure><img src="{src}" alt="{alt}"></figure>'
    return re.sub(r'<figure><img src="([^"]+)" alt="([^"]*)"></figure>', repl, md), n

def slugify(title, url):
    s = re.sub(r"[^\w一-鿿-]+", "-", title).strip("-")
    if not s: s = "post"
    s = s[:40]
    h = hashlib.md5(url.encode()).hexdigest()[:6]
    return f"{s}-{h}"

# ------------------------- 主流程 -------------------------
def process(url, category, write=True):
    print(f"\n>>> 抓取 {url}")
    html = fetch(url)
    title = get_title(html)
    slug = slugify(title, url)
    date = get_date(html)
    desc = get_desc(html)[:90]
    cover = get_cover(html)
    content = extract_content(html)
    md = html_to_md(content)
    if write:
        dest_dir = os.path.join(IMG_DIR, slug)
        os.makedirs(dest_dir, exist_ok=True)
        cover_local = ""
        if cover and cover.startswith("http"):
            cp = os.path.join(dest_dir, "cover.jpg")
            if download(cover, cp):
                cover_local = f"/img/posts/{slug}/cover.jpg"
        md, img_n = localize_images(md, slug)
        fm = (f"---\ntitle: \"{title.replace(chr(34),'')}\"\n"
              f"date: {date}\nlastmod: {date}\n"
              f"description: \"{desc.replace(chr(34),'')}\"\n"
              f"tags: ['{category}', '微信']\ncategories: ['{category}']\n"
              f"kicker: '{category}'\n"
              f"cover: '{cover_local or (f'/img/posts/{slug}/01.jpg' if img_n else '')}'\n"
              f"source: '{url}'\n---\n\n")
        footer = (f"\n\n---\n\n"
                  f"<p><small>本文搬运自微信公众号，原文链接："
                  f"<a href=\"{url}\" target=\"_blank\" rel=\"noopener\">{url}</a></small></p>\n")
        out = fm + md + footer
        os.makedirs(CONTENT_DIR, exist_ok=True)
        with open(os.path.join(CONTENT_DIR, slug + ".md"), "w", encoding="utf-8") as f:
            f.write(out)
        print(f"   ✅ {slug}.md | 标题={title} | 日期={date} | 配图={img_n}")
        return {"slug": slug, "title": title, "date": date, "imgs": img_n}
    else:
        print(f"   标题: {title}\n   日期: {date}\n   封图: {cover[:60]}\n"
              f"   描述: {desc}\n   正文长度: {len(md)} 字符\n   预览:\n{md[:600]}")
        return None

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "run"
    rows = []
    with open(LIST_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line: continue
            parts = line.split("\t")
            if len(parts) < 2: continue
            rows.append((parts[0], parts[1]))
    print(f"清单共 {len(rows)} 条，模式={mode}")
    if mode == "probe":
        process(rows[0][0], rows[0][1], write=False)
    else:
        ok = 0
        for url, cat in rows:
            try:
                if process(url, cat, write=True): ok += 1
            except Exception as e:
                print(f"   ❌ 失败 {url}: {e}")
        print(f"\n完成：成功 {ok}/{len(rows)}")

if __name__ == "__main__":
    main()
