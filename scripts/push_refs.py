#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分批推送：精选引用图片(referenced_imgs.txt) + 53 篇重新排版文章。
- 已推送过的图片会自动跳过（git add 无变化）
- 每批约 12 张图，单批推送超时(600s)则拆半重试
- 最后统一推送 content/posts/*.md
"""
import os, sys, subprocess, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "scripts", "referenced_imgs.txt")
LOG = os.path.join(ROOT, "scripts", "push_refs.log")
BATCH = 12
PUSH_TIMEOUT = 600

def log(m):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"[{time.strftime('%H:%M:%S')}] {m}\n")
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)

def run(cmd, env=None, timeout=None, input=None):
    return subprocess.run(cmd, cwd=ROOT, env=env, timeout=timeout,
                          input=input, capture_output=True, text=True)

def no_proxy_env():
    env = dict(os.environ)
    for k in ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy",
             "ALL_PROXY", "all_proxy"):
        env.pop(k, None)
    return env

def git_push(token, env):
    url = f"https://x-access-token:{token}@github.com/jingpanlong/my-blog.git"
    try:
        r = run(["git", "-c", "credential.helper=", "-c", "core.askPass=",
                 "push", url, "main"], env=env, timeout=PUSH_TIMEOUT)
        if r.returncode == 0:
            return True
        run(["git", "fetch", "origin"], env=env, timeout=120)
        chk = run(["git", "merge-base", "--is-ancestor", "HEAD", "origin/main"])
        if chk.returncode == 0:
            log("  push 误报但远端已含该提交，视为成功")
            return True
        log(f"  push 失败 rc={r.returncode}: {r.stderr.strip()[:200]}")
        return False
    except subprocess.TimeoutExpired:
        log(f"  push 超时({PUSH_TIMEOUT}s)，拆半重试")
        return False

def staged_empty():
    r = run(["git", "diff", "--cached", "--quiet"])
    return r.returncode == 0  # 0 表示无变更

def commit_and_push(files, msg, token, env):
    """提交并推送给定文件列表（已做空提交保护）。成功返回 True。"""
    run(["git", "add", "--"] + files)
    if staged_empty():
        log("  (无新文件，跳过)")
        return True
    run(["git", "commit", "-q", "-m", msg])
    return git_push(token, env)

def main():
    open(LOG, "w", encoding="utf-8").close()
    token = os.environ.get("GIT_TOKEN")
    if not token:
        log("❌ 缺少 GIT_TOKEN 环境变量")
        sys.exit(1)
    env = no_proxy_env()
    with open(REF, encoding="utf-8") as f:
        imgs = [l.strip() for l in f if l.strip()]
    log(f"引用图片共 {len(imgs)} 张，开始分批推送（每批 {BATCH} 张）")

    # 分批推送图片（递归拆半以应对单批过大）
    def push_batches(files, depth=0):
        if not files:
            return True
        if len(files) > BATCH:
            mid = len(files) // 2
            if not push_batches(files[:mid], depth + 1):
                return False
            return push_batches(files[mid:], depth + 1)
        ok = commit_and_push(files, f"chore: 精选配图批次 ({len(files)} 张)", token, env)
        if ok:
            log(f"  ✅ 已推送 {len(files)} 张")
            return True
        log(f"  ❌ 该批推送失败，放弃 {len(files)} 张")
        return False

    push_batches(imgs)

    # 最后统一推送文章
    log("=== 推送 53 篇重新排版文章 ===")
    md_files = [os.path.join(ROOT, "content", "posts", f)
                for f in os.listdir(os.path.join(ROOT, "content", "posts"))
                if f.endswith(".md") and f != "_index.md"]
    ok = commit_and_push(md_files, "feat: 重新排版 53 篇公众号文章（导语+精选配图，附原文链接）", token, env)
    log(f"文章推送: {'✅ 成功' if ok else '❌ 失败'}")
    log("全部完成")

if __name__ == "__main__":
    main()
