#!/usr/bin/env python3
"""
部署/重部署 like-counter Worker（文章点赞 + 浏览量计数）。
只依赖标准库。需要以下环境变量：
  CF_API_TOKEN     Cloudflare API Token（需 Workers Scripts:Edit 权限）
  CF_ACCOUNT_ID    Cloudflare 账户 ID

与 deploy_oauth_worker.py 同款做法：把脚本 + KV binding 打包成 multipart 一次性 PUT 上传。
KV 绑定：LIKES -> 已有的 blog-likes 命名空间（id 见下方 LIKES_ID）。
"""
import json
import os
import sys
import urllib.request
import urllib.error

SCRIPT = "like-counter"
HERE = os.path.dirname(os.path.abspath(__file__))
JS_PATH = os.path.normpath(os.path.join(HERE, "..", "worker", "like-counter.js"))

# 已有 blog-likes KV 命名空间 id（从 wrangler.toml / 历史部署获得）
LIKES_ID = "b2ca0e377242436b8e79f3d2ecf2131d"

CF_TOKEN = os.environ["CF_API_TOKEN"]
ACCOUNT_ID = os.environ["CF_ACCOUNT_ID"]
API = "https://api.cloudflare.com/client/v4"


def api(method, path, body=None, headers=None, raw=False):
    url = f"{API}{path}"
    h = {"Authorization": f"Bearer {CF_TOKEN}", "User-Agent": "workbuddy-like-deploy"}
    if headers:
        h.update(headers)
    data = None
    if body is not None:
        if raw:
            data = body if isinstance(body, bytes) else body.encode()
        else:
            data = json.dumps(body).encode()
            h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


def multipart_upload(script_js):
    """脚本 + KV binding 打包成 multipart/form-data 上传（Service Worker 格式）。"""
    boundary = "----workbuddylike" + "x" * 24
    metadata = {
        "body_part": "script",
        "bindings": [
            {"name": "LIKES", "type": "kv_namespace", "namespace_id": LIKES_ID},
        ],
    }
    parts = []
    parts.append(
        ("--" + boundary + "\r\n"
         'Content-Disposition: form-data; name="metadata"\r\n'
         "Content-Type: application/json\r\n\r\n"
         + json.dumps(metadata)).encode()
    )
    parts.append(
        ("--" + boundary + "\r\n"
         'Content-Disposition: form-data; name="script"; filename="worker.js"\r\n'
         "Content-Type: application/javascript\r\n\r\n").encode()
        + script_js.encode("utf-8")
    )
    body = b"\r\n".join(parts) + ("\r\n--" + boundary + "--\r\n").encode()

    url = f"{API}/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}"
    req = urllib.request.Request(url, data=body, method="PUT", headers={
        "Authorization": f"Bearer {CF_TOKEN}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "User-Agent": "workbuddy-like-deploy",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


def main():
    if not os.path.exists(JS_PATH):
        print(f"[FAIL] 找不到 Worker 脚本: {JS_PATH}")
        sys.exit(1)

    with open(JS_PATH, "r", encoding="utf-8") as f:
        js = f.read()

    # 1) 上传脚本 + KV binding
    st, resp = multipart_upload(js)
    print(f"[script+KV] PUT 状态 {st} | success={resp.get('success')}")
    if not resp.get("success"):
        print("  详情:", resp.get("errors"))
        sys.exit(1)

    # 2) 开启 workers.dev 子域路由（已开会返回错误，忽略即可）
    st, resp = api("POST", f"/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}/subdomain",
                   body={"enabled": True})
    print(f"[subdomain] POST 状态 {st} | success={resp.get('success')}")

    # 3) 自检：点赞 + 浏览量
    base = f"https://{SCRIPT}.470918507.workers.dev"
    import urllib.request as u
    def probe(path, data=None):
        try:
            req = u.Request(base + path, data=(data.encode() if data else None),
                            method=("POST" if data is not None else "GET"),
                            headers={"Content-Type": "text/plain"})
            with u.urlopen(req, timeout=15) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            return {"error": str(e)}
    print("\n=== 部署完成 ===")
    print("Worker 地址 :", base)
    print("点赞 GET     :", json.dumps(probe("/?path=/__selftest__/")))
    print("浏览 GET     :", json.dumps(probe("/views?path=/__selftest__/")))
    print("浏览 POST    :", json.dumps(probe("/views", data="/__selftest__/")))


if __name__ == "__main__":
    main()
