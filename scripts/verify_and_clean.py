# -*- coding: utf-8 -*-
"""校验 + 清理：
1) 删除重复空文 未命名文章-986448
2) 确认无 md 再引用装饰图，然后删除 108 张装饰图文件
3) 校验所有 cover 与正文 <img> 路径存在
"""
import os, re, glob, shutil

REPO = r"C:\Users\IFAN\WorkBuddy\搭建个人博客"
POSTS = os.path.join(REPO, "content", "posts")
STATIC = os.path.join(REPO, "static")
IMGDIR = os.path.join(STATIC, "img", "posts")

A = {os.path.normpath(l.strip()) for l in open(os.path.join(REPO, "scripts", "decorative_A.txt"), encoding="utf-8") if l.strip()}


def to_path(src):
    return os.path.normpath(os.path.join(STATIC, src.lstrip("/")))


# 1) delete duplicate
dup_md = os.path.join(POSTS, "未命名文章-986448.md")
dup_dir = os.path.join(IMGDIR, "未命名文章-986448")
if os.path.isfile(dup_md):
    os.remove(dup_md)
    print("deleted md:", dup_md)
if os.path.isdir(dup_dir):
    shutil.rmtree(dup_dir)
    print("deleted dir:", dup_dir)

# 2) collect all referenced paths across md
referenced = set()
mds = sorted(glob.glob(os.path.join(POSTS, "*.md")))
for md in mds:
    t = open(md, encoding="utf-8").read()
    for s in re.findall(r'<img[^>]+src="([^"]+)"', t):
        referenced.add(to_path(s))
    m = re.search(r"(?m)^cover:\s*(['\"])(.*?)\1\s*$", t)
    if m:
        referenced.add(to_path(m.group(2)))

still_ref = A & referenced
print("\nA files still referenced (should be 0):", len(still_ref))
for r in still_ref:
    print("  STILL REF:", r)

deleted = 0
for p in A:
    if p in still_ref:
        continue
    if os.path.isfile(p):
        os.remove(p)
        deleted += 1
print(f"deleted decorative files: {deleted} / {len(A)}")

# 3) validate covers & img srcs
bad = 0
for md in mds:
    t = open(md, encoding="utf-8").read()
    base = os.path.basename(md)
    m = re.search(r"(?m)^cover:\s*(['\"])(.*?)\1\s*$", t)
    if m:
        cp = to_path(m.group(2))
        if not os.path.isfile(cp):
            bad += 1; print("  BAD COVER:", base, m.group(2))
    for s in re.findall(r'<img[^>]+src="([^"]+)"', t):
        if not os.path.isfile(to_path(s)):
            bad += 1; print("  BAD IMG:", base, s)
print(f"\nbroken cover/img refs: {bad}")

# 4) count posts & images
posts = [m for m in mds if os.path.basename(m) != "_index.md"]
print("posts now:", len(posts))
imgs = sum(len(re.findall(r"<img\b", open(m, encoding="utf-8").read())) for m in posts)
print("inline images total:", imgs)
