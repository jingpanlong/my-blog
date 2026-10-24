import os, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(ROOT, "static")
rows = json.load(open(os.path.join(ROOT, "scripts", "cover_audit.json"), encoding="utf-8"))

bad = []
for r in rows:
    if not r["has_cover"] or r["file"] == "_index.md":
        continue
    p = os.path.join(STATIC, r["cover"].lstrip("/"))
    try:
        with Image.open(p) as im:
            w, h = im.size
    except Exception as e:
        bad.append((r["file"], r["cover"], "ERR", str(e)))
        continue
    ratio = w / h if h else 0
    r["w"], r["h"], r["ratio"] = w, h, round(ratio, 2)
    if ratio < 1.2 or ratio > 2.4 or w < 600:
        bad.append((r["file"], r["cover"], f"{w}x{h}", round(ratio, 2)))

print("covers checked:", sum(1 for r in rows if r.get("w")))
print("suspect (too wide/narrow/small):", len(bad))
for b in sorted(bad, key=lambda x: str(x[3])):
    print("  ", b[0][:46], "|", b[2], "| ratio", b[3], "|", b[1][:50])
json.dump(rows, open(os.path.join(ROOT, "scripts", "cover_audit.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
