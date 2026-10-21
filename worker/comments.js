// Cloudflare Worker：注册/登录 + 评论系统（登录后才能评论）
// 经典 Service Worker 格式（addEventListener），KV 绑定 COMMENTS（复用 blog-likes 命名空间）。
//
// 鉴权：邮箱 + 密码。密码用 PBKDF2(SHA-256, 12万次) 加盐哈希存储；
//       登录成功签发无状态 HMAC-SHA256 会话 token（JWT 风格，30 天有效）。
// 评论：POST /comments 必须带 Authorization: Bearer <token>，否则 401。
//
// 路由：
//   POST /auth/register   { email, name, password }                -> { ok, token, user }
//   POST /auth/login      { email, password }                      -> { ok, token, user }
//   GET  /auth/me         (Bearer)                                -> { user }
//   GET  /comments?path=  (公开)                                   -> { comments: [...] }
//   POST /comments        (Bearer) { path, content, replyTo }      -> { ok, comment }

addEventListener('fetch', function (event) {
  event.respondWith(handle(event.request));
});

const MAX_CMT_PER_HOUR = 30; // 单 IP 每小时最多发帖
const MAX_REG_PER_HOUR = 5;  // 单 IP 每小时最多注册
const MAX_LOGIN_PER_HR = 20; // 单 IP 每小时最多登录尝试
const TOKEN_TTL = 30 * 24 * 3600 * 1000; // 30 天
const PBKDF2_ITERS = 100000;

const enc = new TextEncoder();

// ---------------- 基础工具 ----------------
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors || {})
  });
}
function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown';
}
function b64url(buf) {
  var s = (typeof buf === 'string')
    ? btoa(unescape(encodeURIComponent(buf)))
    : btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  var bin = atob(s), arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function b64urlToStr(s) {
  return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
}

// ---------------- 密码哈希 ----------------
async function hashPassword(password, saltBytes) {
  var keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  var bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    keyMat, 256);
  return new Uint8Array(bits);
}
async function verifyPassword(password, saltBytes, hashBytes) {
  var h = await hashPassword(password, saltBytes);
  if (h.length !== hashBytes.length) return false;
  var ok = 0;
  for (var i = 0; i < h.length; i++) ok |= h[i] ^ hashBytes[i];
  return ok === 0;
}

// ---------------- 会话 token（HMAC-SHA256 无状态）----------------
var _hmacKey = null;
async function hmacKey() {
  if (!_hmacKey) _hmacKey = await crypto.subtle.importKey('raw', enc.encode(AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return _hmacKey;
}
async function signToken(payloadObj) {
  var header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  var payload = b64url(JSON.stringify(payloadObj));
  var data = header + '.' + payload;
  var sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(data));
  return data + '.' + b64url(new Uint8Array(sig));
}
async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  var parts = token.split('.');
  if (parts.length !== 3) return null;
  var data = parts[0] + '.' + parts[1];
  var sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(data));
  var got = fromB64url(parts[2]);
  if (sig.byteLength !== got.length) return null;
  var a = new Uint8Array(sig), ok = 0;
  for (var i = 0; i < a.length; i++) ok |= a[i] ^ got[i];
  if (ok !== 0) return null;
  try { var p = JSON.parse(b64urlToStr(parts[1])); } catch (e) { return null; }
  if (!p.exp || p.exp < Date.now()) return null;
  return p;
}

// ---------------- 频率限制 ----------------
async function rateLimited(prefix, ip, max) {
  var hour = new Date().toISOString().slice(0, 13);
  var key = prefix + ip + ':' + hour;
  var n = Number(await COMMENTS.get(key) || '0');
  if (n >= max) return true;
  await COMMENTS.put(key, String(n + 1), { expirationTtl: 7200 });
  return false;
}

// ---------------- 鉴权中间件 ----------------
async function authUser(request) {
  var ah = request.headers.get('Authorization') || '';
  var m = /^Bearer\s+(.+)$/.exec(ah);
  if (!m) return null;
  return await verifyToken(m[1]);
}

// ---------------- 路由 ----------------
async function handle(request) {
  var url = new URL(request.url);
  var origin = request.headers.get('Origin') || '';
  var SITE = 'https://my-blog-jingpanlong.pages.dev';
  var isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  var allowOrigin = (origin === SITE || isLocal) ? origin : SITE;
  var cors = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  var p = url.pathname;
  try {
    if (p.endsWith('/auth/register') && request.method === 'POST') return await register(request, cors);
    if (p.endsWith('/auth/login') && request.method === 'POST') return await login(request, cors);
    if (p.endsWith('/auth/me') && request.method === 'GET') return await me(request, cors);
    if (p.endsWith('/comments')) {
      if (request.method === 'GET') return await getComments(url, cors);
      if (request.method === 'POST') return await postComment(request, cors);
    }
    return json({ error: 'not found' }, 404, cors);
  } catch (e) {
    return json({ error: '服务器开小差了，请稍后重试' }, 500, cors);
  }
}

// ---------------- 注册 ----------------
async function register(request, cors) {
  var ip = clientIp(request);
  if (await rateLimited('reg:', ip, MAX_REG_PER_HOUR)) return json({ error: '注册过于频繁，请稍后再试' }, 429, cors);
  var body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
  var email = (body.email || '').trim().toLowerCase();
  var name = (body.name || '').trim();
  var pw = (body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: '邮箱格式不正确' }, 400, cors);
  if (name.length < 1 || name.length > 24) return json({ error: '昵称需 1-24 字' }, 400, cors);
  if (pw.length < 8) return json({ error: '密码至少 8 位' }, 400, cors);
  if (await COMMENTS.get('user:' + email)) return json({ error: '该邮箱已注册，请直接登录' }, 409, cors);

  var salt = crypto.getRandomValues(new Uint8Array(16));
  var hash = await hashPassword(pw, salt);
  var uid = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var user = { uid: uid, email: email, name: name, salt: b64url(salt), hash: b64url(hash), created: Date.now() };
  await COMMENTS.put('user:' + email, JSON.stringify(user));
  var token = await signToken({ uid: uid, name: name, email: email, exp: Date.now() + TOKEN_TTL });
  return json({ ok: true, token: token, user: { uid: uid, name: name, email: email } }, 200, cors);
}

// ---------------- 登录 ----------------
async function login(request, cors) {
  var ip = clientIp(request);
  if (await rateLimited('login:', ip, MAX_LOGIN_PER_HR)) return json({ error: '尝试过于频繁，请稍后再试' }, 429, cors);
  var body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
  var email = (body.email || '').trim().toLowerCase();
  var pw = (body.password || '');
  var rec = await COMMENTS.get('user:' + email);
  // 不区分邮箱是否存在，防止账号枚举
  if (!rec) return json({ error: '邮箱或密码错误' }, 401, cors);
  var user;
  try { user = JSON.parse(rec); } catch (e) { return json({ error: '邮箱或密码错误' }, 401, cors); }
  var ok = await verifyPassword(pw, fromB64url(user.salt), fromB64url(user.hash));
  if (!ok) return json({ error: '邮箱或密码错误' }, 401, cors);
  var token = await signToken({ uid: user.uid, name: user.name, email: user.email, exp: Date.now() + TOKEN_TTL });
  return json({ ok: true, token: token, user: { uid: user.uid, name: user.name, email: user.email } }, 200, cors);
}

// ---------------- 当前用户 ----------------
async function me(request, cors) {
  var p = await authUser(request);
  if (!p) return json({ error: '未登录或登录已过期' }, 401, cors);
  return json({ user: { uid: p.uid, name: p.name, email: p.email } }, 200, cors);
}

// ---------------- 读取评论列表（公开）----------------
async function getComments(url, cors) {
  var path = (url.searchParams.get('path') || '').trim();
  if (!path) return json({ error: 'missing path' }, 400, cors);
  var prefix = 'comment:' + path + ':';
  var list = [];
  var cursor = undefined;
  do {
    var page = await COMMENTS.list({ prefix: prefix, cursor: cursor, limit: 100 });
    for (var k of (page.keys || [])) {
      var raw = await COMMENTS.get(k.name);
      if (!raw) continue;
      try { list.push(JSON.parse(raw)); } catch (e) {}
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  list.sort(function (a, b) { return a.createdAt - b.createdAt; });
  if (list.length > 300) list = list.slice(-300);
  return json({ comments: list }, 200, cors);
}

// ---------------- 发表评论（需登录）----------------
async function postComment(request, cors) {
  var p = await authUser(request);
  if (!p) return json({ error: '请先登录后再评论' }, 401, cors);
  var ip = clientIp(request);
  if (await rateLimited('cmt:', ip, MAX_CMT_PER_HOUR)) return json({ error: '评论过于频繁，请稍后再试' }, 429, cors);

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
  var path = (body.path || '').trim();
  var content = (body.content || '').trim();
  var replyTo = (body.replyTo || '').trim();
  if (!path) return json({ error: 'missing path' }, 400, cors);
  if (content.length < 1 || content.length > 800) return json({ error: '评论需 1-800 字' }, 400, cors);

  var id = 'comment:' + path + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 10);
  var comment = {
    id: id,
    path: path,
    uid: p.uid,
    name: p.name,
    content: content,
    createdAt: Date.now(),
    replyTo: replyTo || null
  };
  await COMMENTS.put(id, JSON.stringify(comment));
  return json({ ok: true, comment: comment }, 200, cors);
}
