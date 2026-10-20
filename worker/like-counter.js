// Cloudflare Worker：文章点赞全局计数（KV 存储，追加式）
// 经典 Service Worker 格式（addEventListener），KV 绑定 LIKES 作为全局变量注入。
// 设计：每次点赞写入一条独立 key（like:<path>:<时间戳>:<随机>），计数 = 该路径下 key 数量。
// 这样绝不会因 KV 最终一致性而丢赞或倒退，只有几秒的计数延迟。
// 路由：GET  ?path=/posts/xxx/  -> { "count": N }
//       POST  body=/posts/xxx/  -> { "count": N+1 }（乐观返回，最终一致追平）
addEventListener('fetch', function (event) {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const SITE = 'https://my-blog-jingpanlong.pages.dev';
  const allowOrigin = (origin === SITE) ? origin : SITE;
  const cors = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

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

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
  });
}
