#!/usr/bin/env python3
"""
部署 comments Worker（免登录轻量评论系统）。
只依赖标准库。需要以下环境变量：
  CF_API_TOKEN     Cloudflare API Token（需 Workers Scripts:Edit 权限）
  CF_ACCOUNT_ID    Cloudflare 账户 ID

与 deploy_like_counter.py 同款做法：脚本 + KV binding 打包成 multipart 一次性 PUT 上传。
KV 绑定：COMMENTS -> 复用已有的 blog-likes 命名空间（id 见下方 COMMENTS_ID）。
"""
import json
import os
import sys
import urllib.request
import urllib.error

SCRIPT = "comments"
HERE = os.path.dirname(os.path.abspath(__file__))
JS_PATH = os.path.normpath(os.path.join(HERE, "..", "worker", "comments.js"))

# 复用 blog-likes KV 命名空间（评论与点赞/浏览量共存，仅 key 前缀不同）
COMMENTS_ID = "b2ca0e377242436b8e79f3d2ecf2131d"

CF_TOKEN = os.environ["CF_API_TOKEN"]
ACCOUNT_ID = os.environ["CF_ACCOUNT_ID"]
API = "https://api.cloudflare.com/client/v4"


def api(method, path, body=None, headers=None, raw=False):
    url = f"{API}{path}"
    h = {"Authorization": f"Bearer {CF_TOKEN}", "User-Agent": "workbuddy-comments-deploy"}
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
    boundary = "----workbuddycomments" + "x" * 24
    metadata = {
        "body_part": "script",
        "bindings": [
            {"name": "COMMENTS", "type": "kv_namespace", "namespace_id": COMMENTS_ID},
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
        "User-Agent": "workbuddy-comments-deploy",
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

    st, resp = multipart_upload(js)
    print(f"[script+KV] PUT 状态 {st} | success={resp.get('success')}")
    if not resp.get("success"):
        print("  详情:", resp.get("errors"))
        sys.exit(1)

    st, resp = api("POST", f"/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}/subdomain",
                   body={"enabled": True})
    print(f"[subdomain] POST 状态 {st} | success={resp.get('success')}")

    base = f"https://{SCRIPT}.470918507.workers.dev"
    import urllib.request as u
    def probe(data=None):
        try:
            req = u.Request(base + "/comments?path=/__selftest__/",
                            data=(data.encode() if data else None),
                            method=("POST" if data is not None else "GET"),
                            headers={"Content-Type": "application/json"})
            with u.urlopen(req, timeout=15) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            return {"error": str(e)}
    print("\n=== 部署完成 ===")
    print("Worker 地址 :", base)
    print("评论 GET    :", json.dumps(probe()))
    print("评论 POST   :", json.dumps(probe(json.dumps({"path": "/__selftest__/", "name": "probe", "content": "hello"}))))


if __name__ == "__main__":
    main()
