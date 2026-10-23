#!/usr/bin/env python3
"""
部署 comments Worker（注册/登录 + 评论系统）。
只依赖标准库。需要以下环境变量：
  CF_API_TOKEN     Cloudflare API Token（需 Workers Scripts:Edit 权限）
  CF_ACCOUNT_ID    Cloudflare 账户 ID

与 deploy_oauth_worker.py 同款做法：脚本 + KV binding + secret_text 绑定
打包成 multipart 一次性 PUT 上传（Cloudflare 写 secret 独立端点会 405，故随脚本注入）。
KV 绑定：COMMENTS -> 复用已有的 blog-likes 命名空间（id 见下方 COMMENTS_ID）。
secret_text 绑定：AUTH_SECRET -> 会话 token 的 HMAC 签名密钥（固定随机值，改它会使所有登录失效）。
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
# 会话 token 签名密钥（HMAC-SHA256）。固定值，请勿随意更改，否则所有用户需重新登录。
AUTH_SECRET = "kwPTO07F9N4QiRgDevtvbb04NaKZIl36q1ElroRE3TM="
# Resend 发信密钥（可选）。留空则走 dev 模式：验证/重置链接直接随 API 响应返回，便于本地测试。
# 填入真实 key 后，验证邮件与找回密码邮件将通过 Resend 真实发送到用户邮箱。
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
# 站长免登录评论：浏览器以 X-Owner-Key 头携带此密钥即可评论/回复（无需注册登录）。
# 密钥只存在站长本机 localStorage，不进前端代码；换密钥重新部署即可。
OWNER_KEY = os.environ.get("OWNER_KEY", "o+h2a2MliUpTzuUTkBh3O5JCw6HVRhUd")
OWNER_NAME = os.environ.get("OWNER_NAME", "景盼龙")
OWNER_AVATAR = os.environ.get("OWNER_AVATAR", "🌟")
# 群发令牌：POST /notify 需带此令牌（Authorization: Bearer <值>）才会向订阅者群发新文章通知。
# 留空则手动群发接口返回 503；但 Worker 内置的定时任务（每小时自动通知）不受影响，仍可正常工作。
# 部署时用环境变量注入一个足够长的随机串。
NOTIFY_TOKEN = os.environ.get("NOTIFY_TOKEN", "")

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
            {"name": "AUTH_SECRET", "type": "secret_text", "text": AUTH_SECRET},
            {"name": "RESEND_API_KEY", "type": "secret_text", "text": RESEND_API_KEY},
            {"name": "OWNER_KEY", "type": "secret_text", "text": OWNER_KEY},
            {"name": "OWNER_NAME", "type": "secret_text", "text": OWNER_NAME},
            {"name": "OWNER_AVATAR", "type": "secret_text", "text": OWNER_AVATAR},
            {"name": "NOTIFY_TOKEN", "type": "secret_text", "text": NOTIFY_TOKEN},
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

    # 定时任务：每小时拉取站点最新文章，有新文章就群发通知订阅者（无需 NOTIFY_TOKEN）
    st, resp = api("PUT", f"/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}/schedules",
                   body=[{"cron": "0 * * * *"}])
    print(f"[cron] PUT 状态 {st} | success={resp.get('success')}")

    base = f"https://{SCRIPT}.470918507.workers.dev"
    import urllib.request as u
    def call(method, path, data=None, headers=None):
        h = {"Content-Type": "application/json"}
        if headers: h.update(headers)
        try:
            req = u.Request(base + path,
                            data=(json.dumps(data).encode() if data is not None else None),
                            method=method, headers=h)
            with u.urlopen(req, timeout=15) as r:
                return r.status, json.loads(r.read().decode())
        except u.HTTPError as e:
            try: return e.code, json.loads(e.read().decode())
            except Exception: return e.code, {"error": "http"}
        except Exception as e:
            return 0, {"error": str(e)}

    print("\n=== 部署完成 ===")
    print("Worker 地址 :", base)
    print("评论 GET（公开）:", json.dumps(call("GET", "/comments?path=/__selftest__/")))
    print("评论 POST（未登录）:", json.dumps(call("POST", "/comments", {"path": "/__selftest__/", "content": "x"})))
    # 自动跑一遍 注册 -> 登录 -> 带 token 评论
    st1, reg = call("POST", "/auth/register", {"email": "selftest@example.com", "name": "自测", "password": "selftest123"})
    token = (reg or {}).get("token")
    print("注册        :", st1, json.dumps({k: (v if k != "token" else bool(v)) for k, v in (reg or {}).items()}, ensure_ascii=False))
    st2, lgn = call("POST", "/auth/login", {"email": "selftest@example.com", "password": "selftest123"})
    print("登录        :", st2, json.dumps({k: (v if k != "token" else bool(v)) for k, v in (lgn or {}).items()}, ensure_ascii=False))
    if token:
        st3, cmt = call("POST", "/comments", {"path": "/__selftest__/", "content": "已登录评论"}, {"Authorization": "Bearer " + token})
        print("带 token 评论:", st3, json.dumps(cmt, ensure_ascii=False))
        # 清理自测用户与评论
        try:
            u.Request(base + "/auth/me", method="GET", headers={"Authorization": "Bearer " + token})
        except Exception:
            pass
        print("(自测产生的注册用户/评论可手动在 KV 中清理：user:selftest@example.com、comment:/__selftest__/:*)")

    print("\n=== 订阅路由自检（不发信、不写库） ===")
    print("subscribe(空邮箱) :", json.dumps(call("POST", "/subscribe", {}), ensure_ascii=False))
    print("notify(无 token)   :", json.dumps(call("POST", "/notify", {"title": "t", "url": "u"}), ensure_ascii=False))


if __name__ == "__main__":
    main()
