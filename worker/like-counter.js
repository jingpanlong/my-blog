// Cloudflare Worker：文章互动全局计数（KV 存储）
// 经典 Service Worker 格式（addEventListener），KV 绑定 LIKES 作为全局变量注入。
//
// 点赞（沿用追加式，保证最终一致、绝不丢赞）：
//   GET  ?path=/posts/xxx/        -> { "count": N }
//   POST  body=/posts/xxx/        -> { "count": N+1 }
//
// 浏览量（高频写入，改用数值自增，近似即可）：
//   GET  /views?path=/posts/xxx/  -> { "count": N }
//   POST /views  body=/posts/xxx/ -> { "count": N+1 }
//   键：view:<path>（与点赞的 like:<path>: 前缀隔离，互不干扰）

addEventListener('fetch', function (event) {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const SITE = 'https://my-blog-jingpanlong.pages.dev';
  // 允许本地预览联调（任意 localhost / 127.0.0.1 端口）
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

  // 浏览量子路由
  if (url.pathname === '/views' || url.pathname.endsWith('/views')) {
    return handleViews(request, url, cors);
  }
  // 默认：点赞
  return handleLikes(request, url, cors);
}

// ---------------- 点赞 ----------------
async function handleLikes(request, url, cors) {
  let path = url.searchParams.get('path');
  if (request.method === 'POST') {
    try { path = (await request.text()) || path; } catch (e) {}
  }
  path = (path || '').trim();
  if (!path) {
    return json({ error: 'missing path' }, 400, cors);
  }

  if (request.method === 'POST') {
    const key = 'like:' + path + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 10);
    await LIKES.put(key, '1');
    const n = await countLikes(path);
    return json({ count: n + 1 }, 200, cors); // 乐观 +1（刚写入的这条通常尚未进入列表）
  }
  const n = await countLikes(path);
  return json({ count: n }, 200, cors);
}

async function countLikes(path) {
  const prefix = 'like:' + path + ':';
  let total = 0;
  let cursor = undefined;
  do {
    const page = await LIKES.list({ prefix: prefix, cursor: cursor });
    total += (page.keys || []).length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return total;
}

// ---------------- 浏览量 ----------------
async function handleViews(request, url, cors) {
  let path = url.searchParams.get('path');
  if (request.method === 'POST') {
    try { path = (await request.text()) || path; } catch (e) {}
  }
  path = (path || '').trim();
  if (!path) {
    return json({ error: 'missing path' }, 400, cors);
  }

  const key = 'view:' + path;
  if (request.method === 'POST') {
    const cur = Number(await LIKES.get(key) || '0');
    const next = cur + 1;
    await LIKES.put(key, String(next));
    return json({ count: next }, 200, cors);
  }
  const n = Number(await LIKES.get(key) || '0');
  return json({ count: n }, 200, cors);
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
  });
}
