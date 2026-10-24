# -*- coding: utf-8 -*-
"""清理 53 篇公众号文章：
1) 还原 &quot; / &#39; / \\x26quot; 等实体（front matter 用 YAML 转义，正文用字面量）
2) 删除装饰性 <figure>（装饰图清单 decorative_A.txt）
3) 封面若指向被删图/不存在，重指到文中第一张有效图
输出：逐篇报告 + 需要生成封面的文章清单
"""
import os, re, glob

REPO = r"C:\Users\IFAN\WorkBuddy\搭建个人博客"
POSTS = os.path.join(REPO, "content", "posts")
STATIC = os.path.join(REPO, "static")

with open(os.path.join(REPO, "scripts", "decorative_A.txt"), encoding="utf-8") as f:
    A = {os.path.normpath(l.strip()) for l in f if l.strip()}

IMG_RE = re.compile(r'<img[^>]+src="([^"]+)"', re.I)
FIG_RE = re.compile(r'<figure[^>]*>[\s\S]*?</figure>', re.I)


def fix_fm(s):
    s = s.replace("\\x26quot;", '\\"').replace("&quot;", '\\"').replace("&#34;", '\\"')
    s = s.replace("\\x26#39;", "'").replace("&#39;", "'")
    s = s.replace("\\x26apos;", "'").replace("&apos;", "'")
    s = s.replace("\\x26amp;", "&").replace("&amp;", "&")
    s = s.replace("\\x26lt;", "<").replace("\\x26gt;", ">")
    s = s.replace("\\x26nbsp;", " ").replace("&nbsp;", " ")
    return s


def fix_body(s):
    s = s.replace("\\x26quot;", '"').replace("&quot;", '"').replace("&#34;", '"')
    s = s.replace("\\x26#39;", "'").replace("&#39;", "'")
    s = s.replace("\\x26apos;", "'").replace("&apos;", "'")
    s = s.replace("\\x26amp;", "&").replace("&amp;", "&")
    s = s.replace("\\x26lt;", "<").replace("\\x26gt;", ">")
    s = s.replace("\\x26nbsp;", " ").replace("&nbsp;", " ")
    return s


def to_path(src):
    return os.path.normpath(os.path.join(STATIC, src.lstrip("/")))


report = []
needs_cover = []
deleted_files = set()

for md in sorted(glob.glob(os.path.join(POSTS, "*.md"))):
    name = os.path.basename(md)
    if name == "_index.md":
        continue
    with open(md, encoding="utf-8") as f:
        txt = f.read()
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$", txt)
    if not m:
        report.append(f"SKIP(no fenced front matter): {name}")
        continue
    fm, body = m.group(1), m.group(2)
    fm = fix_fm(fm)
    body = fix_body(body)

    # remove decorative figures
    removed = [0]

    def repl(mt):
        block = mt.group(0)
        im = IMG_RE.search(block)
        if im and to_path(im.group(1)) in A:
            deleted_files.add(to_path(im.group(1)))
            removed[0] += 1
            return ""
        return block

    body = FIG_RE.sub(repl, body)
    # tidy: collapse 3+ blank lines to 1 blank line
    body = re.sub(r"\n[ \t]*\n(?:[ \t]*\n)+", "\n\n", body)

    # cover handling
    cov_m = re.search(r"(?m)^cover:\s*(['\"])(.*?)\1\s*$", fm)
    cur_cover = cov_m.group(2).strip() if cov_m else None
    remaining = IMG_RE.findall(body)
    cover_bad = cur_cover is None or to_path(cur_cover) in A or not os.path.exists(to_path(cur_cover))
    new_cover = None
    if cover_bad:
        new_cover = remaining[0] if remaining else None
        if cov_m and new_cover:
            fm = fm[:cov_m.start(2)] + new_cover + fm[cov_m.end(2):]
        if new_cover is None:
            needs_cover.append(name)

    out = "---\n" + fm + "\n---\n" + body
    with open(md, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)

    if removed[0] or cover_bad:
        report.append(f"{name[:38]:38} removed={removed[0]:2d} remain={len(remaining):2d} "
                      f"cover={'-> '+os.path.basename(new_cover) if new_cover and cover_bad else ('OK' if not cover_bad else 'NONE')}")

print("=== changed posts ===")
for r in report:
    print(" ", r)
print(f"\ntotal posts changed: {len(report)}")
print(f"images dereferenced: {len(deleted_files)}")
print(f"\n=== posts with NO image left (need generated cover): {len(needs_cover)} ===")
for n in needs_cover:
    print("  ", n)

with open(os.path.join(REPO, "scripts", "deleted_imgs.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(sorted(deleted_files)))
with open(os.path.join(REPO, "scripts", "needs_cover.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(needs_cover))
