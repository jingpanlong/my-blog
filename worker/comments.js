// Cloudflare Worker：轻量评论系统（免登录，匿名 + 昵称）
// 经典 Service Worker 格式（addEventListener），KV 绑定 COMMENTS（复用 blog-likes 命名空间）。
// 存储：每条评论一个 KV 键 comment:<path>:<createdAt>:<rand>，值为 JSON。
//   GET  /comments?path=/posts/x/        -> { "comments": [ {id,path,name,content,createdAt,replyTo} ... ] }（按时间升序）
//   POST /comments  body=JSON             -> { "ok": true, "comment": {...} }  （校验 + 蜜罐 + IP 频率限制）

addEventListener('fetch', function (event) {
  event.respondWith(handle(event.request));
});

const MAX_PER_HOUR = 30; // 单 IP 每小时最多发帖数（基础防刷）

async function handle(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const SITE = 'https://my-blog-jingpanlong.pages.dev';
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowOrigin = (origin === SITE || isLocal) ? origin : SITE;
  const cors = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (url.pathname === '/comments' || url.pathname.endsWith('/comments')) {
    if (request.method === 'GET') return getComments(url, cors);
    if (request.method === 'POST') return postComment(request, cors);
  }
  return json({ error: 'not found' }, 404, cors);
}

// ---------------- 读取评论列表 ----------------
async function getComments(url, cors) {
  const path = (url.searchParams.get('path') || '').trim();
  if (!path) return json({ error: 'missing path' }, 400, cors);
  const prefix = 'comment:' + path + ':';
  let list = [];
  let cursor = undefined;
  do {
    const page = await COMMENTS.list({ prefix: prefix, cursor: cursor, limit: 100 });
    for (const k of (page.keys || [])) {
      const raw = await COMMENTS.get(k.name);
      if (!raw) continue;
      try { list.push(JSON.parse(raw)); } catch (e) {}
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  list.sort(function (a, b) { return a.createdAt - b.createdAt; });
  if (list.length > 300) list = list.slice(-300); // 安全上限
  return json({ comments: list }, 200, cors);
}

// ---------------- 发表评论 ----------------
async function postComment(request, cors) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
  if (!body || typeof body !== 'object') return json({ error: 'invalid body' }, 400, cors);

  // 蜜罐：机器人常填的隐藏字段，命中则假装成功但不存储
  if (body.website && String(body.website).trim() !== '') {
    return json({ ok: true, comment: null }, 200, cors);
  }

  const path = (body.path || '').trim();
  const name = (body.name || '').trim();
  const content = (body.content || '').trim();
  const replyTo = (body.replyTo || '').trim();
  if (!path) return json({ error: 'missing path' }, 400, cors);
  if (name.length < 1 || name.length > 24) return json({ error: '昵称需 1-24 字' }, 400, cors);
  if (content.length < 1 || content.length > 800) return json({ error: '评论需 1-800 字' }, 400, cors);

  // 单 IP 频率限制
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown';
  const hourKey = 'rate:' + ip + ':' + new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const now = Number(await COMMENTS.get(hourKey) || '0');
  if (now >= MAX_PER_HOUR) return json({ error: '评论过于频繁，请稍后再试' }, 429, cors);
  await COMMENTS.put(hourKey, String(now + 1));

  const id = 'comment:' + path + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 10);
  const comment = {
    id: id,
    path: path,
    name: name,
    content: content,
    createdAt: Date.now(),
    replyTo: replyTo || null
  };
  await COMMENTS.put(id, JSON.stringify(comment));
  return json({ ok: true, comment: comment }, 200, cors);
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
  });
}
