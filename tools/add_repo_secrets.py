#!/usr/bin/env python3
"""通过 GitHub API 为仓库写入加密 secret（用仓库公钥做 sealed-box 加密）。"""
import base64, json, os, sys, urllib.request

REPO = os.environ["REPO"]          # owner/name
PAT = os.environ["PAT"]            # 具备 repo 权限的个人访问令牌
SECRETS = json.loads(os.environ["SECRETS"])  # {"NAME": "value", ...}

API = "https://api.github.com"
HDR = {
    "Authorization": f"Bearer {PAT}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "workbuddy-secret-setup",
}


def api(method, path, body=None):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=HDR)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode()


def main():
    from nacl.public import PublicKey, SealedBox

    # 1) 取仓库公钥
    pk = json.loads(api("GET", f"/repos/{REPO}/actions/secrets/public-key"))
    public_key = PublicKey(base64.b64decode(pk["key"]))
    key_id = pk["key_id"]

    # 2) 逐个加密并写入
    for name, value in SECRETS.items():
        box = SealedBox(public_key)
        enc = base64.b64encode(box.encrypt(value.encode())).decode()
        api("PUT", f"/repos/{REPO}/actions/secrets/{name}",
            {"encrypted_value": enc, "key_id": key_id})
        print(f"[ok] 写入密钥: {name}")

    # 3) 回读确认
    cur = json.loads(api("GET", f"/repos/{REPO}/actions/secrets"))
    names = [s["name"] for s in cur.get("secrets", [])]
    print("当前仓库密钥:", names)
    missing = [n for n in SECRETS if n not in names]
    if missing:
        print(f"[FAIL] 仍未写入: {missing}")
        sys.exit(1)
    print("[done] 全部密钥已就位")


if __name__ == "__main__":
    main()
