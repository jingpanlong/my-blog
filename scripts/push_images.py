#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分批推送 static/img/posts 下的图片到 GitHub。
每批约 MAX_IMAGES 张；单批推送超时就拆半重试（目录拆半，单目录再拆文件）。
带 token + 清掉出口代理，避免沙箱代理对大体积上传的卡死。
日志写 /tmp/push_images.log
"""
import os, sys, subprocess, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_ROOT = os.path.join(ROOT, "static", "img", "posts")
LOG = "/tmp/push_images.log"
MAX_IMAGES = 35          # 每批目标图片数
PUSH_TIMEOUT = 600       # 单批推送超时（秒）

def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line, flush=True)

def run(cmd, env=None, timeout=None, input=None):
    return subprocess.run(cmd, cwd=ROOT, env=env, timeout=timeout,
                          input=input, capture_output=True, text=True)

def get_token():
    # 优先从环境变量读取（后台无 TTY 时 git credential-manager 会挂起）
    env_tok = os.environ.get("GIT_TOKEN")
    if env_tok:
        return env_tok
    r = run(["git", "credential-manager", "get"],
            input="protocol=https\nhost=github.com\n")
    for line in r.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    return ""

def no_proxy_env():
    env = dict(os.environ)
    for k in ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy",
             "ALL_PROXY", "all_proxy"):
        env.pop(k, None)
    return env

def tracked(d):
    r = run(["git", "ls-files", "--error-unmatch", d])
    return r.returncode == 0

def count_imgs(d):
    n = 0
    for f in os.listdir(d):
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
            n += 1
    return n

def all_imgs(d):
    files = []
    for f in sorted(os.listdir(d)):
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
            files.append(os.path.join(d, f))
    return files

def git_commit(paths, msg):
    run(["git", "add", "--"] + paths)
    r = run(["git", "commit", "-q", "-m", msg])
    return r.returncode == 0

def git_undo_commit():
    run(["git", "reset", "--soft", "HEAD~1"])
    run(["git", "reset", "-q"])

def git_push(token, env):
    url = f"https://x-access-token:{token}@github.com/jingpanlong/my-blog.git"
    try:
        r = run(["git", "-c", "credential.helper=", "-c", "core.askPass=",
                 "push", url, "main"], env=env, timeout=PUSH_TIMEOUT)
        if r.returncode == 0:
            return True
        # 推送命令返回非0，但偶发会误报（远端其实已更新），fetch 后核实
        run(["git", "fetch", "origin"], env=env, timeout=120)
        chk = run(["git", "merge-base", "--is-ancestor", "HEAD", "origin/main"])
        if chk.returncode == 0:
            log("  push 命令报错但远端已包含该提交，视为成功")
            return True
        log(f"  push 失败 rc={r.returncode}: {r.stderr.strip()[:200]}")
        return False
    except subprocess.TimeoutExpired:
        log(f"  push 超时({PUSH_TIMEOUT}s)，将拆半重试")
        return False

def push_dirs(dirs, token, env, depth=0):
    if not dirs:
        return True
    msg = f"chore: 配图批次推送 ({len(dirs)} 目录)"
    if not git_commit(dirs, msg):
        log(f"  commit 失败: {dirs}")
        return False
    ok = git_push(token, env)
    if ok:
        log(f"  ✅ 已推送 {len(dirs)} 目录")
        return True
    # 失败/超时：撤销 commit 后拆半重试
    git_undo_commit()
    if len(dirs) > 1:
        mid = len(dirs) // 2
        log(f"  ↳ 拆半目录重试: {mid} + {len(dirs)-mid}")
        if not push_dirs(dirs[:mid], token, env, depth+1):
            return False
        return push_dirs(dirs[mid:], token, env, depth+1)
    else:
        # 单目录太大：拆文件
        d = dirs[0]
        files = all_imgs(d)
        mid = max(1, len(files) // 2)
        log(f"  ↳ 单目录拆文件重试: {mid} + {len(files)-mid}")
        if not push_files(files[:mid], token, env):
            return False
        return push_files(files[mid:], token, env)

def push_files(files, token, env):
    if not files:
        return True
    msg = f"chore: 配图批次推送 ({len(files)} 文件)"
    if not git_commit(files, msg):
        log("  commit 失败")
        return False
    ok = git_push(token, env)
    if ok:
        log(f"  ✅ 已推送 {len(files)} 文件")
        return True
    git_undo_commit()
    if len(files) > 1:
        mid = len(files) // 2
        if not push_files(files[:mid], token, env):
            return False
        return push_files(files[mid:], token, env)
    log("  ❌ 单文件仍失败，放弃该文件")
    return False

def main():
    open(LOG, "w", encoding="utf-8").close()
    token = get_token()
    if not token:
        log("❌ 未取到 GitHub token")
        sys.exit(1)
    env = no_proxy_env()
    # 收集未推送的目录
    dirs = sorted([os.path.join(IMG_ROOT, d) for d in os.listdir(IMG_ROOT)
                   if os.path.isdir(os.path.join(IMG_ROOT, d))])
    pending = [d for d in dirs if not tracked(d)]
    log(f"待推送目录总数: {len(pending)}")
    # 按目标图片数分批
    batches, cur, cnt = [], [], 0
    for d in pending:
        nc = count_imgs(d)
        if cur and cnt + nc > MAX_IMAGES:
            batches.append(cur); cur, cnt = [], 0
        cur.append(d); cnt += nc
    if cur:
        batches.append(cur)
    log(f"计划批次数: {len(batches)}，每批约 {MAX_IMAGES} 张图")
    ok_batches = 0
    for i, b in enumerate(batches, 1):
        total_imgs = sum(count_imgs(d) for d in b)
        log(f"=== 批次 {i}/{len(batches)}: {len(b)} 目录, ~{total_imgs} 张图 ===")
        if push_dirs(b, token, env):
            ok_batches += 1
        else:
            log(f"❌ 批次 {i} 失败")
    log(f"完成：成功 {ok_batches}/{len(batches)} 批")

if __name__ == "__main__":
    main()
