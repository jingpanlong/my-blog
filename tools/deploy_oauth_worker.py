#!/usr/bin/env python3
"""
部署/重配 Decap CMS 的 GitHub OAuth 代理 Worker（blog-oauth）。

只依赖标准库。需要以下环境变量：
  CF_API_TOKEN      Cloudflare API Token（需 Workers Scripts:Edit 权限）
  CF_ACCOUNT_ID     Cloudflare 账户 ID
  GH_CLIENT_ID      GitHub OAuth App 的 Client ID
  GH_CLIENT_SECRET  GitHub OAuth App 的 Client Secret

说明：Cloudflare 的 API Token 对单独的「写 Secret」子端点（PUT/POST .../secrets/{name}）
会返回 10405/405，因此这里把 CLIENT_ID / CLIENT_SECRET 作为 secret_text binding
打包进脚本上传的 multipart metadata，一次 PUT 同时完成部署 + 注入密钥（Wrangler 同款做法）。
"""
import json
import os
import sys
import urllib.request
import urllib.error

SCRIPT = "blog-oauth"
HERE = os.path.dirname(os.path.abspath(__file__))
JS_PATH = os.path.normpath(os.path.join(HERE, "..", "worker", "blog-oauth.js"))

CF_TOKEN = os.environ["CF_API_TOKEN"]
ACCOUNT_ID = os.environ["CF_ACCOUNT_ID"]
GH_CLIENT_ID = os.environ["GH_CLIENT_ID"]
GH_CLIENT_SECRET = os.environ["GH_CLIENT_SECRET"]

API = "https://api.cloudflare.com/client/v4"


def api(method, path, body=None, headers=None, raw=False):
    url = f"{API}{path}"
    h = {"Authorization": f"Bearer {CF_TOKEN}", "User-Agent": "workbuddy-oauth-deploy"}
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
    """把脚本 + secret bindings 打包成 multipart/form-data 上传（Service Worker 格式）。"""
    boundary = "----workbuddyoauth" + "x" * 24
    metadata = {
        "body_part": "script",
        "bindings": [
            {"name": "CLIENT_ID", "type": "secret_text", "text": GH_CLIENT_ID},
            {"name": "CLIENT_SECRET", "type": "secret_text", "text": GH_CLIENT_SECRET},
        ],
    }
    parts = []
    # metadata 部分
    parts.append(
        ("--" + boundary + "\r\n"
         'Content-Disposition: form-data; name="metadata"\r\n'
         "Content-Type: application/json\r\n\r\n"
         + json.dumps(metadata)).encode()
    )
    # 脚本部分
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
        "User-Agent": "workbuddy-oauth-deploy",
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

    # 1) 打包上传：脚本 + Secret bindings 一次性写入
    st, resp = multipart_upload(js)
    print(f"[script+secrets] PUT 状态 {st} | success={resp.get('success')}")
    if not resp.get("success"):
        print("  详情:", resp.get("errors"))
        sys.exit(1)

    # 2) 开启 workers.dev 子域路由（已开会返回错误，忽略即可）
    st, resp = api("POST", f"/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}/subdomain",
                   body={"enabled": True})
    print(f"[subdomain] POST 状态 {st} | success={resp.get('success')}")

    # 3) 自检
    _, sub = api("GET", f"/accounts/{ACCOUNT_ID}/workers/subdomain")
    subdomain = (sub.get("result") or {}).get("subdomain") or "470918507"
    base = f"https://{SCRIPT}.{subdomain}.workers.dev"
    import urllib.request as u
    try:
        with u.urlopen(base + "/health", timeout=15) as r:
            health = json.loads(r.read().decode())
    except Exception as e:
        health = {"error": str(e)}
    print("\n=== 部署完成 ===")
    print("Worker 地址 :", base)
    print("回调地址     :", base + "/callback")
    print("后台入口     : https://my-blog-jingpanlong.pages.dev/admin/")
    print("Health 自检  :", json.dumps(health, ensure_ascii=False))


if __name__ == "__main__":
    main()
