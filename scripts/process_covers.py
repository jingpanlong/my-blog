import os, re, glob, shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(ROOT, "static", "img", "covers-gen")
POSTS = os.path.join(ROOT, "content", "posts")

MAP = {
    "flowshift-intro": "flowshift-intro",
    "family-order-intro": "family-order-intro",
    "desktop-critters-intro": "desktop-critters-intro",
    "mima-guanjia": "拒绝-忘记密码-我用Python撸了一个高颜值的-本地加密-账号管家-真香-2759b4",
    "nihao": "你好",
    "bitlocker": "电脑开机卡BitLocker-3分钟找到恢复密钥-附避坑指南-2bdd20",
    "daan-zhishu": "纠结到失眠-这本-答案之书-藏着你心里的答案-0c0555",
    "rename-tool": "还在手动改文件名-这个免费工具让我彻底告别重复劳动-效率飙升-7e39d5",
    "tizhong-jiankang": "体重超标竟藏这么多隐患-免费工具一键测出你的健康密码-bd46fc",
    "zcgl-asset": "zcgl-asset-intro",
}

TW, TH = 1280, 800  # 16:10

for src_dir, slug in MAP.items():
    d = os.path.join(GEN, src_dir)
    files = sorted(glob.glob(os.path.join(d, "*.png"))) + sorted(glob.glob(os.path.join(d, "*.jpg")))
    if not files:
        print("MISSING image:", src_dir)
        continue
    src = files[0]
    with Image.open(src) as im:
        im = im.convert("RGB")
        w, h = im.size
        want = TW / TH
        cur = w / h
        if cur > want:          # too wide -> crop sides
            nw = int(h * want)
            left = (w - nw) // 2
            im = im.crop((left, 0, left + nw, h))
        else:                   # too tall -> crop top/bottom, bias slightly up
            nh = int(w / want)
            top = int((h - nh) * 0.42)
            im = im.crop((0, top, w, top + nh))
        im = im.resize((TW, TH), Image.LANCZOS)

    out_dir = os.path.join(ROOT, "static", "img", "posts", slug)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "cover-ai.jpg")
    im.save(out, "JPEG", quality=86, optimize=True, progressive=True)

    # 更新 front matter 的 cover
    md = os.path.join(POSTS, slug + ".md")
    txt = open(md, encoding="utf-8").read()
    new_cover = f"/img/posts/{slug}/cover-ai.jpg"
    if re.search(r"^cover:.*$", txt, re.M):
        txt = re.sub(r"^cover:.*$", f"cover: {new_cover}", txt, count=1, flags=re.M)
    else:
        txt = re.sub(r"^(---\s*\n)", r"\1", txt, count=1)
        txt = txt.replace("---\n", f"cover: {new_cover}\n---\n", 1) if False else txt
    open(md, "w", encoding="utf-8", newline="\n").write(txt)
    print(f"OK {slug[:34]:<36} {os.path.getsize(out)//1024}KB -> {new_cover}")

# 清理临时目录
shutil.rmtree(GEN, ignore_errors=True)
print("temp cleaned:", not os.path.exists(GEN))
