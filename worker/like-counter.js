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
//
// 收藏（匿名 uid 去重，可取消，无需登录即可计数）：
//   GET  /favs?path=/posts/xxx/&uid=xxx   -> { "count": N, "mine": bool }
//   POST /favs  body={"path":"...","uid":"..."} -> { "count": N, "mine": bool }（切换：已收藏则取消）
//   键：fav:<path>:<uid>

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
  // 收藏量子路由
  if (url.pathname === '/favs' || url.pathname.endsWith('/favs')) {
    return handleFavs(request, url, cors);
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

// ---------------- 收藏 ----------------
// 说明：KV 的 list 是最终一致的，put 后短时间内可能查不到新键，
// 因此计数不用 list 统计，而用数值计数器 favcount:<path>（与浏览量同方案）；
// fav:<path>:<uid> 仅用于判断「我是否已收藏」与取消去重。
async function handleFavs(request, url, cors) {
  var path = (url.searchParams.get('path') || '').trim();
  var uid = (url.searchParams.get('uid') || '').trim();
  if (request.method === 'POST') {
    try {
      var body = JSON.parse((await request.text()) || '{}');
      if (body.path) path = String(body.path).trim();
      if (body.uid) uid = String(body.uid).trim();
    } catch (e) {}
  }
  if (!path) return json({ error: 'missing path' }, 400, cors);

  var mine = false;
  if (uid && /^[A-Za-z0-9_-]{6,40}$/.test(uid)) {
    var key = 'fav:' + path + ':' + uid;
    var exists = await LIKES.get(key);
    if (request.method === 'POST') {
      if (exists) {
        await LIKES.delete(key);
        await bumpFav(path, -1);
        mine = false;
      } else {
        await LIKES.put(key, '1');
        await bumpFav(path, 1);
        mine = true;
      }
    } else {
      mine = !!exists;
    }
  }
  var n = Number(await LIKES.get('favcount:' + path) || '0');
  return json({ count: n, mine: mine }, 200, cors);
}

async function bumpFav(path, delta) {
  var key = 'favcount:' + path;
  var cur = Number(await LIKES.get(key) || '0');
  var next = Math.max(0, cur + delta);
  await LIKES.put(key, String(next));
  return next;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
  });
}
