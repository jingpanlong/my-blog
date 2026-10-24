import os, re, json, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS = os.path.join(ROOT, "content", "posts")
STATIC = os.path.join(ROOT, "static")

cover_re = re.compile(r'^cover:\s*(.+?)\s*$', re.M)
img_re = re.compile(r'<img[^>]+src="([^"]+)"', re.I)
md_img_re = re.compile(r'!\[[^\]]*\]\(([^)]+)\)')

rows = []
for path in sorted(glob.glob(os.path.join(POSTS, "*.md"))):
    name = os.path.basename(path)
    txt = open(path, encoding="utf-8").read()
    fm_end = txt.find("\n---", 3)
    fm = txt[:fm_end] if fm_end > 0 else txt
    m = cover_re.search(fm)
    cover = m.group(1).strip().strip('"').strip("'") if m else ""
    cover_ok = False
    if cover:
        p = os.path.join(STATIC, cover.lstrip("/"))
        cover_ok = os.path.isfile(p)
    imgs = img_re.findall(txt) + md_img_re.findall(txt)
    valid_imgs = []
    for s in imgs:
        s = s.strip()
        if s.startswith("/"):
            if os.path.isfile(os.path.join(STATIC, s.lstrip("/"))):
                valid_imgs.append(s)
        elif s.startswith("http"):
            valid_imgs.append(s)
    rows.append({
        "file": name,
        "slug": re.sub(r"\.md$", "", name),
        "cover": cover,
        "cover_ok": cover_ok,
        "has_cover": bool(cover),
        "n_valid_imgs": len(valid_imgs),
        "first_valid_img": valid_imgs[0] if valid_imgs else "",
    })

print("total posts:", len(rows))
no_cover = [r for r in rows if not r["has_cover"]]
broken = [r for r in rows if r["has_cover"] and not r["cover_ok"]]
print("no cover field:", len(no_cover))
for r in no_cover:
    print("  NOCOVER ", r["file"], "| imgs:", r["n_valid_imgs"])
print("cover field but file missing:", len(broken))
for r in broken:
    print("  BROKEN  ", r["file"], "->", r["cover"], "| imgs:", r["n_valid_imgs"])

json.dump(rows, open(os.path.join(ROOT, "scripts", "cover_audit.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("wrote scripts/cover_audit.json")
