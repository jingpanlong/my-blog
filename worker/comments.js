// Cloudflare Worker：注册/登录 + 评论系统（需登录、KV 会话、邮箱验证、找回密码）
// 经典 Service Worker 格式。KV 绑定 COMMENTS（复用 blog-likes 命名空间）。
// secret_text 绑定：AUTH_SECRET（历史兼容占位）、RESEND_API_KEY（可选，发信）。
//
// 关键设计：
//   - 密码 PBKDF2(SHA-256, 10万次) 加盐哈希；评论 POST 需 Bearer 会话，未登录 401。
//   - 会话存 KV：session:<sid> = {uid,name,email,avatar,verified,revoke}，TTL 30 天。
//     远程吊销：uid-revoke:<uid> 版本号，logout-all 自增，旧会话校验失败即失效。
//   - 登录支持 邮箱 或 昵称；注册需 头像 + 昵称 + 邮箱 + 密码 + 确认密码。
//   - 邮箱验证 verify:<token>；找回密码 reset:<token>。Resend 可选，无 key 时 dev 模式在响应返回链接。

addEventListener('fetch', function (event) {
  event.respondWith(handle(event.request));
});

const MAX_CMT_PER_HOUR = 30;
const MAX_REG_PER_HOUR = 5;
const MAX_LOGIN_PER_HR = 20;
const MAX_FORGOT_PER_HR = 5;
const MAX_RESET_PER_HR = 10;
const SESSION_TTL = 30 * 24 * 3600; // 秒
const TOKEN_TTL = 24 * 3600; // 验证/重置 token 有效期（秒）
const PBKDF2_ITERS = 100000;
const SITE_ORIGIN = 'https://my-blog-jingpanlong.pages.dev';
const FROM_EMAIL = 'onboarding@resend.dev'; // Resend 测试发件人（无需自有域名）
const AVATARS = ['🦊', '🐱', '🐶', '🐼', '🦁', '🐯', '🐸', '🦉', '🐧', '🦄', '🌟', '🍎'];

const enc = new TextEncoder();

// ---------------- 工具 ----------------
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
function randToken(n) {
  var a = new Uint8Array(n || 24);
  crypto.getRandomValues(a);
  return b64url(a);
}

// ---------------- KV 辅助 ----------------
async function getJSON(key) {
  var raw = await COMMENTS.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
async function putJSON(key, obj, ttl) {
  await COMMENTS.put(key, JSON.stringify(obj), ttl ? { expirationTtl: ttl } : undefined);
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

// ---------------- 会话（KV）----------------
async function createSession(user) {
  var sid = crypto.randomUUID();
  var revoke = Number(await COMMENTS.get('uid-revoke:' + user.uid)) || 0;
  var sess = {
    uid: user.uid, name: user.name, email: user.email,
    avatar: user.avatar, verified: !!user.verified, revoke: revoke
  };
  await COMMENTS.put('session:' + sid, JSON.stringify(sess), { expirationTtl: SESSION_TTL });
  return sid;
}
async function readSession(sid) {
  if (!sid) return null;
  var s = await getJSON('session:' + sid);
  if (!s) return null;
  if (s.exp && s.exp < Date.now()) return null;
  var cur = Number(await COMMENTS.get('uid-revoke:' + s.uid)) || 0;
  if (s.revoke !== cur) return null;
  // 以用户记录为准，实时反映 verified / 昵称 / 头像 的最新状态
  var user = await getJSON('user:' + s.email);
  if (user) {
    s.verified = !!user.verified;
    s.name = user.name;
    s.avatar = user.avatar;
  }
  return s;
}
async function deleteSession(sid) { if (sid) await COMMENTS.delete('session:' + sid); }
async function revokeAll(uid) {
  var cur = Number(await COMMENTS.get('uid-revoke:' + uid)) || 0;
  await COMMENTS.put('uid-revoke:' + uid, String(cur + 1));
}

// ---------------- 鉴权中间件 ----------------
async function authUser(request) {
  var ah = request.headers.get('Authorization') || '';
  var m = /^Bearer\s+(.+)$/.exec(ah);
  if (!m) return null;
  return await readSession(m[1]);
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

// ---------------- 发信（Resend 可选）----------------
async function sendEmail(to, subject, html) {
  if (typeof RESEND_API_KEY === 'string' && RESEND_API_KEY.length > 0) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RESEND_API_KEY },
        body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject: subject, html: html })
      });
    } catch (e) { /* 忽略发信失败，不影响主流程 */ }
  }
}
function verifyLink(token) { return SITE_ORIGIN + '/?verify=' + encodeURIComponent(token); }
function resetLink(token) { return SITE_ORIGIN + '/?reset=' + encodeURIComponent(token); }

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
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  var p = url.pathname;
  try {
    if (p.endsWith('/auth/register') && request.method === 'POST') return await register(request, cors);
    if (p.endsWith('/auth/login') && request.method === 'POST') return await login(request, cors);
    if (p.endsWith('/auth/me') && request.method === 'GET') return await me(request, cors);
    if (p.endsWith('/auth/verify') && (request.method === 'GET' || request.method === 'POST')) return await verify(request, cors);
    if (p.endsWith('/auth/resend-verify') && request.method === 'POST') return await resendVerify(request, cors);
    if (p.endsWith('/auth/forgot') && request.method === 'POST') return await forgot(request, cors);
    if (p.endsWith('/auth/reset') && request.method === 'POST') return await resetPw(request, cors);
    if (p.endsWith('/auth/logout') && request.method === 'POST') return await logout(request, cors);
    if (p.endsWith('/auth/logout-all') && request.method === 'POST') return await logoutAll(request, cors);
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
  var avatar = (body.avatar || '').trim();
  var pw = (body.password || '');
  var pw2 = (body.confirmPassword || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: '邮箱格式不正确' }, 400, cors);
  if (name.length < 1 || name.length > 24) return json({ error: '昵称需 1-24 字' }, 400, cors);
  if (AVATARS.indexOf(avatar) === -1) return json({ error: '请选择一个头像' }, 400, cors);
  if (pw.length < 8) return json({ error: '密码至少 8 位' }, 400, cors);
  if (pw !== pw2) return json({ error: '两次输入的密码不一致' }, 400, cors);
  if (await COMMENTS.get('user:' + email)) return json({ error: '该邮箱已注册，请直接登录' }, 409, cors);
  if (await COMMENTS.get('userByName:' + name.toLowerCase())) return json({ error: '该昵称已被占用' }, 409, cors);

  var salt = crypto.getRandomValues(new Uint8Array(16));
  var hash = await hashPassword(pw, salt);
  var uid = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var vt = randToken(24);
  var user = {
    uid: uid, email: email, name: name, avatar: avatar,
    salt: b64url(salt), hash: b64url(hash), verified: false,
    verifyToken: vt, verifyExp: Date.now() + TOKEN_TTL * 1000, created: Date.now()
  };
  await putJSON('user:' + email, user);
  await COMMENTS.put('userByName:' + name.toLowerCase(), email);
  await COMMENTS.put('verify:' + vt, email, { expirationTtl: TOKEN_TTL });

  var sid = await createSession(user);
  var devLinks = [];
  if (typeof RESEND_API_KEY !== 'string' || RESEND_API_KEY.length === 0) {
    devLinks.push({ type: 'verify', email: email, link: verifyLink(vt) });
  } else {
    await sendEmail(email, '验证你的邮箱', '<p>欢迎注册！请点击以下链接验证邮箱：</p><p><a href="' + verifyLink(vt) + '">' + verifyLink(vt) + '</a></p>');
  }
  return json({
    ok: true, token: sid,
    user: { uid: uid, name: name, email: email, avatar: avatar, verified: false },
    devLinks: devLinks
  }, 200, cors);
}

// ---------------- 登录（邮箱或昵称）----------------
async function login(request, cors) {
  var ip = clientIp(request);
  if (await rateLimited('login:', ip, MAX_LOGIN_PER_HR)) return json({ error: '尝试过于频繁，请稍后再试' }, 429, cors);
  var body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
  var ident = (body.email || body.login || '').trim().toLowerCase();
  var pw = (body.password || '');
  if (!ident) return json({ error: '请输入邮箱或昵称' }, 400, cors);

  var emailVal = ident.indexOf('@') !== -1 ? ident : (await COMMENTS.get('userByName:' + ident));
  var rec = emailVal ? await COMMENTS.get('user:' + emailVal) : null;
  if (!rec) return json({ error: '账号或密码错误' }, 401, cors);
  var user;
  try { user = JSON.parse(rec); } catch (e) { return json({ error: '账号或密码错误' }, 401, cors); }
  var ok = await verifyPassword(pw, fromB64url(user.salt), fromB64url(user.hash));
  if (!ok) return json({ error: '账号或密码错误' }, 401, cors);

  var sid = await createSession(user);
  return json({
    ok: true, token: sid,
    user: { uid: user.uid, name: user.name, email: user.email, avatar: user.avatar, verified: !!user.verified }
  }, 200, cors);
}

// ---------------- 当前用户 ----------------
async function me(request, cors) {
  var p = await authUser(request);
  if (!p) return json({ error: '未登录或登录已过期' }, 401, cors);
  return json({ user: { uid: p.uid, name: p.name, email: p.email, avatar: p.avatar, verified: !!p.verified } }, 200, cors);
}

// ---------------- 验证邮箱 ----------------
async function verify(request, cors) {
  var token = request.method === 'GET'
    ? new URL(request.url).searchParams.get('token')
    : (await request.json().catch(function () { return {}; })).token;
  if (!token) return json({ error: '缺少验证码' }, 400, cors);
  var pending = await COMMENTS.get('verify:' + token);
  if (!pending) return json({ error: '验证码无效或已过期' }, 400, cors);
  var user = await getJSON('user:' + pending);
  if (!user) return json({ error: '账号不存在' }, 400, cors);
  user.verified = true;
  user.verifyToken = null; user.verifyExp = null;
  await putJSON('user:' + user.email, user);
  await COMMENTS.delete('verify:' + token);
  return json({ ok: true, verified: true }, 200, cors);
}

// ---------------- 重发验证邮件 ----------------
async function resendVerify(request, cors) {
  var p = await authUser(request);
  if (!p) return json({ error: '未登录或登录已过期' }, 401, cors);
  var user = await getJSON('user:' + p.email);
  if (!user) return json({ error: '账号不存在' }, 401, cors);
  if (user.verified) return json({ error: '邮箱已验证' }, 400, cors);
  var vt = randToken(24);
  user.verifyToken = vt; user.verifyExp = Date.now() + TOKEN_TTL * 1000;
  await putJSON('user:' + user.email, user);
  await COMMENTS.put('verify:' + vt, user.email, { expirationTtl: TOKEN_TTL });
  var devLinks = [];
  if (typeof RESEND_API_KEY !== 'string' || RESEND_API_KEY.length === 0) {
    devLinks.push({ type: 'verify', email: user.email, link: verifyLink(vt) });
  } else {
    await sendEmail(user.email, '验证你的邮箱', '<p>请点击验证：<a href="' + verifyLink(vt) + '">' + verifyLink(vt) + '</a></p>');
  }
  return json({ ok: true, devLinks: devLinks }, 200, cors);
}

// ---------------- 找回密码 ----------------
async function forgot(request, cors) {
  var ip = clientIp(request);
  if (await rateLimited('forgot:', ip, MAX_FORGOT_PER_HR)) return json({ error: '请求过于频繁，请稍后再试' }, 429, cors);
  var body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
  var ident = (body.email || body.login || '').trim().toLowerCase();
  var emailVal = ident.indexOf('@') !== -1 ? ident : (await COMMENTS.get('userByName:' + ident));
  var rec = emailVal ? await COMMENTS.get('user:' + emailVal) : null;
  var devLinks = [];
  if (rec) {
    var user = JSON.parse(rec);
    var rt = randToken(24);
    await COMMENTS.put('reset:' + rt, user.email, { expirationTtl: TOKEN_TTL });
    if (typeof RESEND_API_KEY !== 'string' || RESEND_API_KEY.length === 0) {
      devLinks.push({ type: 'reset', email: user.email, link: resetLink(rt) });
    } else {
      await sendEmail(user.email, '重置你的密码', '<p>请点击重置密码：<a href="' + resetLink(rt) + '">' + resetLink(rt) + '</a></p>');
    }
  }
  // 统一返回成功（不泄露账号是否存在）
  return json({ ok: true, devLinks: devLinks }, 200, cors);
}

// ---------------- 重置密码 ----------------
async function resetPw(request, cors) {
  var ip = clientIp(request);
  if (await rateLimited('reset:', ip, MAX_RESET_PER_HR)) return json({ error: '请求过于频繁，请稍后再试' }, 429, cors);
  var body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
  var token = (body.token || '').trim();
  var pw = (body.password || '');
  var pw2 = (body.confirmPassword || '');
  if (pw.length < 8) return json({ error: '密码至少 8 位' }, 400, cors);
  if (pw !== pw2) return json({ error: '两次输入的密码不一致' }, 400, cors);
  var email = await COMMENTS.get('reset:' + token);
  if (!email) return json({ error: '重置链接无效或已过期' }, 400, cors);
  var user = await getJSON('user:' + email);
  if (!user) return json({ error: '账号不存在' }, 400, cors);
  var salt = crypto.getRandomValues(new Uint8Array(16));
  var hash = await hashPassword(pw, salt);
  user.salt = b64url(salt); user.hash = b64url(hash);
  await putJSON('user:' + user.email, user);
  await COMMENTS.delete('reset:' + token);
  await revokeAll(user.uid); // 重置后强制所有设备重新登录
  return json({ ok: true }, 200, cors);
}

// ---------------- 退出（吊销当前会话）----------------
async function logout(request, cors) {
  var ah = request.headers.get('Authorization') || '';
  var m = /^Bearer\s+(.+)$/.exec(ah);
  if (m) await deleteSession(m[1]);
  return json({ ok: true }, 200, cors);
}

// ---------------- 退出所有设备（远程吊销）----------------
async function logoutAll(request, cors) {
  var p = await authUser(request);
  if (!p) return json({ error: '未登录或登录已过期' }, 401, cors);
  await revokeAll(p.uid);
  return json({ ok: true }, 200, cors);
}

// ---------------- 读取评论（公开）----------------
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

// ---------------- 发表评论（需登录且已验证邮箱）----------------
async function postComment(request, cors) {
  var p = await authUser(request);
  if (!p) return json({ error: '请先登录后再评论' }, 401, cors);
  if (!p.verified) return json({ error: '请先验证邮箱后再评论' }, 403, cors);
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
    id: id, path: path, uid: p.uid, name: p.name, avatar: p.avatar,
    content: content, createdAt: Date.now(), replyTo: replyTo || null
  };
  await COMMENTS.put(id, JSON.stringify(comment));
  return json({ ok: true, comment: comment }, 200, cors);
}
