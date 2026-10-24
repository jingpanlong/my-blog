# -*- coding: utf-8 -*-
"""为 53 篇微信文章统一封面 + 为删空的文章补正文截图"""
import os, re, glob
from PIL import Image

REPO = r"C:\Users\IFAN\WorkBuddy\搭建个人博客"
POSTS = os.path.join(REPO, "content", "posts")
STATIC = os.path.join(REPO, "static")
IMGDIR = os.path.join(STATIC, "img", "posts")

A = {os.path.normpath(l.strip()) for l in open(os.path.join(REPO, "scripts", "decorative_A.txt"), encoding="utf-8") if l.strip()}


def usable(p):
    if not os.path.isfile(p):
        return False
    if os.path.basename(p).lower() == "cover.jpg":
        return False
    if os.path.normpath(p) in A:
        return False
    try:
        w, h = Image.open(p).size
    except Exception:
        return False
    if w / h >= 4 or h <= 90:
        return False
    return True


def dir_for(slug):
    d = os.path.join(IMGDIR, slug)
    if os.path.isdir(d):
        return d
    # fallback: same hash suffix
    suffix = slug[-6:]
    for cand in os.listdir(IMGDIR):
        if cand.endswith(suffix) and os.path.isdir(os.path.join(IMGDIR, cand)):
            return os.path.join(IMGDIR, cand)
    return None


usables_used = []
report = []
for md in sorted(glob.glob(os.path.join(POSTS, "*.md"))):
    name = os.path.basename(md)
    txt = open(md, encoding="utf-8").read()
    if "source: 'https://mp.weixin.qq.com" not in txt:
        continue  # 只处理 53 篇微信文章
    slug = name[:-3]
    d = dir_for(slug)
    if not d:
        report.append(f"NO DIR: {name}")
        continue
    dname = os.path.basename(d)

    # choose cover
    cj = os.path.join(d, "cover.jpg")
    if os.path.isfile(cj):
        cover_src = f"/img/posts/{dname}/cover.jpg"
        cover_file = cj
    else:
        cands = [os.path.join(d, f) for f in os.listdir(d) if usable(os.path.join(d, f))]
        cands.sort(key=lambda p: os.path.getsize(p), reverse=True)
        if not cands:
            report.append(f"NO COVER CANDIDATE: {name}")
            continue
        cover_file = cands[0]
        cover_src = f"/img/posts/{dname}/{os.path.basename(cover_file)}"

    # update cover line
    m = re.search(r"(?m)^cover:\s*(['\"])(.*?)\1\s*$", txt)
    if m:
        txt = txt[:m.start(2)] + cover_src + txt[m.end(2):]
    else:
        txt = txt.replace("categories:", f"cover: '{cover_src}'\ncategories:", 1)

    # split front matter/body to count & insert images
    m2 = re.match(r"^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$", txt)
    fmblock, body = m2.group(1), m2.group(2)
    n_img = len(re.findall(r"<img\b", body))
    inserted = 0
    if n_img == 0:
        picks = [os.path.join(d, f) for f in os.listdir(d) if usable(os.path.join(d, f))]
        if cj and os.path.normpath(cover_file) == os.path.normpath(cj):
            pass
        picks.sort()  # numeric order
        picks = picks[:2]
        if picks:
            seg = "".join(
                f'<figure><img src="/img/posts/{dname}/{os.path.basename(p)}" alt=""></figure>\n\n'
                for p in picks
            )
            lines = body.split("\n")
            idx = next((i for i, l in enumerate(lines) if l.startswith("> **导语")), None)
            if idx is not None:
                j = idx + 1
                while j < len(lines) and lines[j].strip() == "":
                    j += 1
                insert_at = j
            else:
                insert_at = 0
            lines.insert(insert_at, seg.rstrip("\n"))
            body = "\n".join(lines)
            inserted = len(picks)
            for p in picks:
                usables_used.append(p)

    if m2:
        txt = fmblock + body
    with open(md, "w", encoding="utf-8", newline="\n") as f:
        f.write(txt)

    if inserted or os.path.isfile(cj):
        pass
    report.append(f"{name[:36]:36} cover={os.path.basename(cover_file):10} inserted={inserted}")

print("=== per post ===")
for r in report:
    print(" ", r)
print(f"\nposts processed: {len(report)}")
print(f"inline images inserted: {len(usables_used)}")
