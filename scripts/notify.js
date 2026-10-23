#!/usr/bin/env node
/**
 * 新文章发布后通知邮件订阅者（调用 comments Worker 的 POST /notify）。
 *
 * 用法：
 *   NOTIFY_TOKEN=<令牌> node scripts/notify.js
 *
 * 环境变量：
 *   NOTIFY_TOKEN   必填，群发令牌（需与 Worker 的 NOTIFY_TOKEN 一致）
 *   NOTIFY_API     可选，默认 https://comments.470918507.workers.dev/notify
 *   SITE_URL       可选，默认 https://my-blog-jingpanlong.pages.dev
 *   INDEX_JSON     可选，默认 ${SITE_URL}/search-index.json；也可传本地文件路径
 *
 * Worker 侧按文章 path 去重，同一篇文章只会群发一次，
 * 因此本脚本可安全地挂在每次部署上重复执行；任何软失败都只告警、不阻断部署。
 */
const SITE_URL = (process.env.SITE_URL || 'https://my-blog-jingpanlong.pages.dev').replace(/\/+$/, '');
const NOTIFY_API = process.env.NOTIFY_API || 'https://comments.470918507.workers.dev/notify';
const NOTIFY_TOKEN = process.env.NOTIFY_TOKEN || '';
const INDEX_JSON = process.env.INDEX_JSON || `${SITE_URL}/search-index.json`;

async function loadIndex() {
  if (/^https?:\/\//.test(INDEX_JSON)) {
    const r = await fetch(INDEX_JSON);
    if (!r.ok) throw new Error(`获取搜索索引失败: HTTP ${r.status}`);
    return await r.json();
  }
  const path = INDEX_JSON.replace(/^file:\/\//, '');
  const fs = require('fs');
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

function pickLatest(posts) {
  const arr = Array.isArray(posts) ? posts.slice() : [];
  // 日期格式为 YYYY-MM-DD，字典序即时间序
  arr.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return arr[0] || null;
}

(async () => {
  if (!NOTIFY_TOKEN) {
    console.warn('[notify] 未设置 NOTIFY_TOKEN，跳过订阅通知（不影响部署）');
    process.exit(0);
  }

  let posts;
  try {
    posts = await loadIndex();
  } catch (e) {
    console.warn('[notify] 读取搜索索引失败，跳过通知：', e.message);
    process.exit(0);
  }

  const latest = pickLatest(posts);
  if (!latest || !latest.url) {
    console.warn('[notify] 没有找到文章，跳过通知');
    process.exit(0);
  }

  const payload = {
    title: latest.title || '新文章',
    url: SITE_URL + latest.url,
    path: latest.url,
    summary: latest.summary || ''
  };
  console.log('[notify] 准备通知：', payload.title, '->', payload.url);

  try {
    const r = await fetch(NOTIFY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + NOTIFY_TOKEN },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.warn('[notify] 群发接口返回', r.status, JSON.stringify(data));
      process.exit(0);
    }
    console.log('[notify] 完成：', JSON.stringify(data));
  } catch (e) {
    console.warn('[notify] 请求失败，跳过通知：', e.message);
    process.exit(0);
  }
})();
