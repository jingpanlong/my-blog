// Cloudflare Worker：注册/登录 + 评论系统（需登录、KV 会话、邮箱验证、找回密码）
// 经典 Service Worker 格式。KV 绑定 COMMENTS（复用 blog-likes 命名空间）。
// secret_text 绑定：AUTH_SECRET（历史兼容占位）、RESEND_API_KEY（可选，发信）、NOTIFY_TOKEN（群发令牌，可选）。
// 邮件订阅：POST /subscribe 存 KV(sub:) 并发欢迎邮件；GET /unsubscribe 一键退订（返回 HTML 页）；
//           POST /notify 按新文章群发（需 NOTIFY_TOKEN，同一篇文章去重）；
//           scheduled 定时任务每小时自动拉取站点最新文章并群发（近期 14 天内且未通知过才发）。
//           注册/登录即自动订阅（sub: 记录标记 source=account，验证邮件中说明并可退订）；
//           本功能上线前已注册的存量用户，由定时任务回填一次（KV 标记 subs-backfilled 防重复）。
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

// 定时任务（Cron Trigger，默认每小时）：拉取站点最新文章，有新文章就群发通知订阅者
addEventListener('scheduled', function (event) {
  event.waitUntil(scheduledNotify());
});

const MAX_CMT_PER_HOUR = 30;
const MAX_REG_PER_HOUR = 10;
const MAX_LOGIN_PER_HR = 20;
const MAX_FORGOT_PER_HR = 5;
const MAX_RESET_PER_HR = 10;
const SESSION_TTL = 30 * 24 * 3600; // 秒
const MAX_IMAGES = 4;                 // 单条评论最多图片数
const MAX_MEDIA_BYTES = 1572864;      // 单张图片 base64 解码后上限 1.5MB
const IMG_RE = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/;
const TOKEN_TTL = 24 * 3600; // 验证/重置 token 有效期（秒）
const PBKDF2_ITERS = 100000;
const MAX_SUB_PER_HOUR = 5;        // 订阅：每 IP 每小时上限
const NOTIFY_MAX_RECIPIENTS = 500; // 单次群发收件人上限（防止误伤）
const SITE_ORIGIN = 'https://my-blog-jingpanlong.pages.dev';
const WORKER_ORIGIN = 'https://comments.470918507.workers.dev'; // 本 Worker 公网地址（退订链接用）
// 发件人：默认用 Resend 测试地址（只能发到你自己注册 Resend 的邮箱）。
// 要真正发给订阅者，需在 Resend 验证自有域名，并把这里改成该域名下的地址（部署时用 RESEND_FROM_EMAIL 注入）。
const FROM_EMAIL = (typeof RESEND_FROM_EMAIL === 'string' && RESEND_FROM_EMAIL) || 'onboarding@resend.dev';
const AVATARS = ['🦊', '🐱', '🐶', '🐼', '🦁', '🐯', '🐸', '🦉', '🐧', '🦄', '🌟', '🍎'];

const enc = new TextEncoder();

// ---------------- 站长统计聚合（owner 保护） ----------------
async function commentStats(request, cors) {
  var owner = await isOwner(request);
  if (!owner) return json({ error: 'unauthorized' }, 401, cors);

  var perPost = {};
  var total = 0;
  var keys = [];
  var cursor = undefined;
  do {
    var page = await COMMENTS.list({ prefix: 'comment:', cursor: cursor, limit: 1000 });
    var ks = page.keys || [];
    for (var i = 0; i < ks.length; i++) {
      var p = ks[i].name.slice('comment:'.length).split(':')[0];
      perPost[p] = (perPost[p] || 0) + 1;
      total += 1;
      if (keys.length < 1500) keys.push(ks[i].name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  // 取最近评论内容（按 ts 倒序取前 12 条）
  var recent = [];
  var vals = await Promise.all(keys.map(function (k) { return COMMENTS.get(k); }));
  for (var j = 0; j < vals.length; j++) {
    if (!vals[j]) continue;
    try {
      var c = JSON.parse(vals[j]);
      recent.push(c);
    } catch (e) { /* 跳过坏数据 */ }
  }
  recent.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  recent = recent.slice(0, 12).map(function (c) {
    return {
      id: c.id, path: c.path, name: c.name,
      content: (c.content || '').slice(0, 220), ts: c.ts, avatar: c.avatar
    };
  });

  var perPostArr = Object.keys(perPost).map(function (p) { return { path: p, comments: perPost[p] }; });
  perPostArr.sort(function (a, b) { return b.comments - a.comments; });

  return json({ totals: { comments: total }, perPost: perPostArr, recent: recent }, 200, cors);
}

// ---------------- 工具 ----------------
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors || {})
  });
}
function htmlPage(html, cors) {
  return new Response(html, {
    status: 200,
    headers: Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, cors || {})
  });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
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

// ---------------- 站长（免登录评论）----------------
// X-Owner-Key 与 secret_text 绑定 OWNER_KEY 匹配即视为站长：
// 可直接发表/回复评论，无需登录、无需验证邮箱、不受评论频率限制。
async function isOwner(request) {
  var k = request.headers.get('X-Owner-Key') || '';
  if (!k) return null;
  if (typeof OWNER_KEY !== 'string' || OWNER_KEY.length === 0) return null;
  if (k !== OWNER_KEY) return null;
  return {
    name: (typeof OWNER_NAME === 'string' && OWNER_NAME) || '博主',
    avatar: (typeof OWNER_AVATAR === 'string' && AVATARS.indexOf(OWNER_AVATAR) !== -1) ? OWNER_AVATAR : '🌟'
  };
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
// 返回是否发送成功；未配置 key 或请求失败均返回 false（不抛异常，不影响主流程）
async function sendEmail(to, subject, html) {
  if (typeof RESEND_API_KEY !== 'string' || RESEND_API_KEY.length === 0) return false;
  try {
    var r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RESEND_API_KEY },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject: subject, html: html })
    });
    return r.ok;
  } catch (e) { return false; }
}
function verifyLink(token) { return SITE_ORIGIN + '/?verify=' + encodeURIComponent(token); }
function resetLink(token) { return SITE_ORIGIN + '/?reset=' + encodeURIComponent(token); }
function unsubLink(email, token, origin) {
  return origin + '/unsubscribe?email=' + encodeURIComponent(email) + '&token=' + encodeURIComponent(token);
}

// ---------------- 邮件订阅 ----------------
// KV：sub:<email> = { email, token, ts }（永久，无 TTL）；notified:<path> 标记已群发过的文章。
// 安全：/subscribe 按 IP 限频；/unsubscribe 需 token 匹配；/notify 需 NOTIFY_TOKEN 才允许群发。
function emailShell(title, innerHtml) {
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + title + '</title></head>'
    + '<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;">'
    + '<div style="max-width:520px;margin:0 auto;padding:28px 16px;">'
    + '<div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(20,30,80,.08);">'
    + '<div style="height:4px;background:linear-gradient(90deg,#6d8bff,#9bb4ff);"></div>'
    + '<div style="padding:26px 26px 22px;">' + innerHtml + '</div>'
    + '</div>'
    + '<p style="text-align:center;color:#9aa3bd;font-size:12px;margin:16px 0 0;">本邮件由 <a href="' + SITE_ORIGIN + '" style="color:#6d8bff;text-decoration:none;">' + escapeHtml(SITE_ORIGIN.replace(/^https?:\/\//, '')) + '</a> 订阅者推送</p>'
    + '</div></body></html>';
}

async function subscribe(request, cors) {
  var ip = clientIp(request);
  if (await rateLimited('sub:', ip, MAX_SUB_PER_HOUR)) return json({ error: '操作太频繁，请稍后再试' }, 429, cors);
  var body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
  var email = (body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: '邮箱格式不正确' }, 400, cors);

  if (await getJSON('sub:' + email)) return json({ ok: true, already: true }, 200, cors);

  var token = randToken(18);
  await putJSON('sub:' + email, { email: email, token: token, ts: Date.now(), source: 'form' });

  var origin = WORKER_ORIGIN;
  var unsub = unsubLink(email, token, origin);
  var html = emailShell('订阅成功', ''
    + '<h1 style="margin:0 0 12px;font-size:20px;color:#1f2740;">订阅成功 🎉</h1>'
    + '<p style="margin:0 0 16px;color:#4a5473;font-size:14px;line-height:1.7;">感谢订阅本站，以后有新文章会第一时间邮件通知你。</p>'
    + '<p style="margin:0 0 22px;"><a href="' + SITE_ORIGIN + '" style="display:inline-block;padding:10px 22px;background:#6d8bff;color:#ffffff;border-radius:999px;text-decoration:none;font-weight:600;">去首页看看</a></p>'
    + '<p style="margin:0;color:#9aa3bd;font-size:12px;line-height:1.6;">不想再收到邮件？<a href="' + unsub + '" style="color:#6d8bff;">点此退订</a></p>');
  var mailed = await sendEmail(email, '订阅成功 · 新文章将邮件通知你', html);
  return json({ ok: true, mailSent: mailed }, 200, cors);
}

// 幂等地把某个邮箱加入订阅列表（注册/登录自动订阅用）。
// 已订阅则保留原 token 不覆盖（避免历史退订链接失效），返回 false；新建返回 true。
async function ensureSubscribed(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false;
  var existing = await getJSON('sub:' + e);
  if (existing && existing.token) return false;
  var token = randToken(18);
  await putJSON('sub:' + e, { email: e, token: token, ts: Date.now(), source: 'account' });
  return true;
}

// 回填：把「订阅功能上线前」已注册的存量用户补成订阅者。
// KV 标记 subs-backfilled 保证只跑一次（由定时任务触发，安全可反复调用）。
async function backfillSubsFromUsers() {
  if (await COMMENTS.get('subs-backfilled')) return { added: 0, total: 0 };
  var emails = [];
  var cursor = undefined;
  do {
    var page = await COMMENTS.list({ prefix: 'user:', cursor: cursor, limit: 1000 });
    for (var i = 0; i < (page.keys || []).length; i++) {
      var k = page.keys[i].name;
      if (k.indexOf('userByName:') === 0) continue; // 昵称索引不是账号记录
      var rec = await getJSON(k);
      if (rec && rec.email) emails.push(rec.email);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  var added = 0;
  for (var j = 0; j < emails.length; j++) {
    if (await ensureSubscribed(emails[j])) added++;
  }
  await COMMENTS.put('subs-backfilled', String(Date.now()));
  return { added: added, total: emails.length };
}

async function unsubscribePage(url, cors) {
  var email = (url.searchParams.get('email') || '').trim().toLowerCase();
  var token = url.searchParams.get('token') || '';
  var rec = await getJSON('sub:' + email);
  var ok = !!(rec && rec.token && rec.token === token);
  if (ok) await COMMENTS.delete('sub:' + email);
  var inner = ok
    ? '<h1 style="margin:0 0 12px;font-size:20px;color:#1f2740;">已退订</h1>'
      + '<p style="margin:0;color:#4a5473;font-size:14px;line-height:1.7;">你已成功取消订阅，不会再收到新文章通知。随时欢迎再来：<a href="' + SITE_ORIGIN + '" style="color:#6d8bff;">回到本站</a></p>'
    : '<h1 style="margin:0 0 12px;font-size:20px;color:#1f2740;">链接无效</h1>'
      + '<p style="margin:0;color:#4a5473;font-size:14px;line-height:1.7;">该退订链接无效或已处理过，无需重复操作。</p>';
  return htmlPage(emailShell(ok ? '已退订' : '链接无效', inner), cors);
}

async function notifySubscribers(request, url, cors) {
  // 群发是敏感操作，必须持有 NOTIFY_TOKEN（secret_text 绑定）才能触发
  if (typeof NOTIFY_TOKEN !== 'string' || NOTIFY_TOKEN.length === 0) {
    return json({ error: '未配置 NOTIFY_TOKEN，群发未启用' }, 503, cors);
  }
  var body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
  var provided = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    || url.searchParams.get('token') || body.token || '';
  if (provided !== NOTIFY_TOKEN) return json({ error: 'unauthorized' }, 401, cors);

  var title = (body.title || '').trim();
  var postUrl = (body.url || '').trim();
  var summary = (body.summary || '').trim();
  var path = (body.path || postUrl).trim();
  if (!title || !postUrl) return json({ error: '缺少 title / url' }, 400, cors);

  // 去重：同一篇文章只群发一次（因此可安全地挂在每次部署上反复调用）
  var mark = 'notified:' + path;
  if (await COMMENTS.get(mark)) return json({ ok: true, skipped: true }, 200, cors);

  var res = await broadcastNewPost(title, summary, postUrl, path);
  return json({ ok: true, sent: res.sent, total: res.total }, 200, cors);
}

// 群发一篇新文章给所有订阅者（/notify 与定时任务共用）；同一 path 只群发一次
async function broadcastNewPost(title, summary, postUrl, path) {
  var subs = [];
  var cursor = undefined;
  do {
    var page = await COMMENTS.list({ prefix: 'sub:', cursor: cursor, limit: 1000 });
    for (var i = 0; i < (page.keys || []).length; i++) {
      var rec = await getJSON(page.keys[i].name);
      if (rec && rec.email) subs.push(rec);
      if (subs.length >= NOTIFY_MAX_RECIPIENTS) break;
    }
    cursor = (subs.length >= NOTIFY_MAX_RECIPIENTS || page.list_complete) ? undefined : page.cursor;
  } while (cursor);

  var safeSummary = summary ? escapeHtml(summary) : '';
  var html = emailShell('新文章 · ' + title, ''
    + '<h1 style="margin:0 0 6px;font-size:20px;color:#1f2740;">新文章发布</h1>'
    + '<p style="margin:0 0 16px;color:#9aa3bd;font-size:12px;">' + escapeHtml(SITE_ORIGIN.replace(/^https?:\/\//, '')) + '</p>'
    + '<h2 style="margin:0 0 10px;font-size:17px;line-height:1.55;color:#1f2740;">' + escapeHtml(title) + '</h2>'
    + (safeSummary ? '<p style="margin:0 0 18px;color:#4a5473;font-size:14px;line-height:1.75;">' + safeSummary + '</p>' : '')
    + '<p style="margin:0 0 22px;"><a href="' + escapeHtml(postUrl) + '" style="display:inline-block;padding:11px 24px;background:#6d8bff;color:#ffffff;border-radius:999px;text-decoration:none;font-weight:600;">阅读全文</a></p>'
    + '<p style="margin:0;color:#9aa3bd;font-size:12px;line-height:1.6;">你收到这封邮件是因为订阅了本站更新，可<a href="__UNSUB__" style="color:#6d8bff;">退订</a>。</p>');

  var sent = 0;
  for (var j = 0; j < subs.length; j++) {
    var u = unsubLink(subs[j].email, subs[j].token, WORKER_ORIGIN);
    if (await sendEmail(subs[j].email, '新文章 · ' + title, html.replace(/__UNSUB__/g, u))) sent++;
  }
  await COMMENTS.put('notified:' + path, String(Date.now()));
  return { sent: sent, total: subs.length };
}

// 定时任务：先回填存量用户订阅（只跑一次），再拉站点 search-index.json 取最新文章；近期且未通知过才群发
async function scheduledNotify() {
  try {
    await backfillSubsFromUsers();
    var r = await fetch(SITE_ORIGIN + '/search-index.json', { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return;
    var posts = await r.json();
    if (!Array.isArray(posts)) return;
    var latest = null;
    for (var i = 0; i < posts.length; i++) {
      var p = posts[i];
      if (!p || !p.url || !p.title) continue;
      if (!latest || String(p.date || '') > String(latest.date || '')) latest = p;
    }
    if (!latest) return;
    // 只通知近期发布的文章，避免首次运行时把历史文章群发一遍
    var t = Date.parse(latest.date || '');
    if (!t || (Date.now() - t) > 14 * 24 * 3600 * 1000) return;
    if (await COMMENTS.get('notified:' + latest.url)) return;
    await broadcastNewPost(latest.title, latest.summary || '', SITE_ORIGIN + latest.url, latest.url);
  } catch (e) { /* 定时任务失败静默，下一小时再试 */ }
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
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Owner-Key',
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
    if (p.endsWith('/auth/owner-check') && request.method === 'POST') return await ownerCheck(request, cors);
    if (p.endsWith('/stats') && request.method === 'GET') return await commentStats(request, cors);
    if (p.endsWith('/comments')) {
      if (request.method === 'GET') return await getComments(url, cors);
      if (request.method === 'POST') return await postComment(request, cors);
      if (request.method === 'DELETE') return await deleteComment(request, url, cors);
    }
    if (p.endsWith('/subscribe') && request.method === 'POST') return await subscribe(request, cors);
    if (p.endsWith('/unsubscribe') && request.method === 'GET') return await unsubscribePage(url, cors);
    if (p.endsWith('/notify') && request.method === 'POST') return await notifySubscribers(request, url, cors);
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
  // 注册即订阅：自动加入邮件订阅列表（幂等；已通过表单订阅过的保留原 token）
  await ensureSubscribed(email);

  var sid = await createSession(user);
  var devLinks = [];
  if (typeof RESEND_API_KEY !== 'string' || RESEND_API_KEY.length === 0) {
    devLinks.push({ type: 'verify', email: email, link: verifyLink(vt) });
  } else {
    var subRec = await getJSON('sub:' + email);
    var unsub = (subRec && subRec.token) ? unsubLink(email, subRec.token, WORKER_ORIGIN) : '';
    var vlink = verifyLink(vt);
    var vhtml = emailShell('验证你的邮箱', ''
      + '<h1 style="margin:0 0 12px;font-size:20px;color:#1f2740;">欢迎注册 👋</h1>'
      + '<p style="margin:0 0 18px;color:#4a5473;font-size:14px;line-height:1.7;">请点击下面按钮验证邮箱，之后就可以评论了。验证链接 24 小时内有效。</p>'
      + '<p style="margin:0 0 22px;"><a href="' + vlink + '" style="display:inline-block;padding:11px 24px;background:#6d8bff;color:#ffffff;border-radius:999px;text-decoration:none;font-weight:600;">验证邮箱</a></p>'
      + '<p style="margin:0 0 8px;color:#4a5473;font-size:13px;line-height:1.7;">📬 注册即自动订阅本站更新，以后有新文章会邮件通知你。</p>'
      + (unsub ? '<p style="margin:0;color:#9aa3bd;font-size:12px;line-height:1.6;">不想再收到通知？<a href="' + unsub + '" style="color:#6d8bff;">点此退订</a></p>' : ''));
    await sendEmail(email, '验证你的邮箱', vhtml);
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
  // 兜底：订阅功能上线前注册的老用户，首次登录时自动补建订阅记录
  try { await ensureSubscribed(user.email); } catch (e) { /* 不影响登录 */ }
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

// ---------------- 站长身份校验 ----------------
async function ownerCheck(request, cors) {
  var o = await isOwner(request);
  if (!o) return json({ error: '站长密钥无效' }, 401, cors);
  return json({ ok: true, user: { uid: 'owner', name: o.name, avatar: o.avatar, owner: true } }, 200, cors);
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

// ---------------- 发表评论（需登录且已验证邮箱；站长凭密钥免登录）----------------
async function postComment(request, cors) {
  var owner = await isOwner(request);
  var p;
  if (owner) {
    p = { uid: 'owner', name: owner.name, avatar: owner.avatar };
  } else {
    p = await authUser(request);
    if (!p) return json({ error: '请先登录后再评论' }, 401, cors);
    if (!p.verified) return json({ error: '请先验证邮箱后再评论' }, 403, cors);
    var ip0 = clientIp(request);
    if (await rateLimited('cmt:', ip0, MAX_CMT_PER_HOUR)) return json({ error: '评论过于频繁，请稍后再试' }, 429, cors);
  }

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
  var path = (body.path || '').trim();
  var content = (body.content || '').trim();
  var replyTo = (body.replyTo || '').trim();

  /* 图片附件：base64 data URL 直存进评论记录（无需对象存储）。
     仅接受白名单格式 + 单张大小上限，超量/非法项直接丢弃，不影响文字评论。 */
  var images = [];
  if (Array.isArray(body.images)) {
    for (var i = 0; i < body.images.length && images.length < MAX_IMAGES; i++) {
      var im = body.images[i];
      if (typeof im !== 'string') continue;
      var m = IMG_RE.exec(im);
      if (!m) continue;
      var b64 = m[2];
      var pad = b64.slice(-2) === '==' ? 2 : (b64.slice(-1) === '=' ? 1 : 0);
      var bytes = Math.floor(b64.length * 3 / 4) - pad;
      if (bytes > MAX_MEDIA_BYTES) continue;
      images.push(im);
    }
  }

  if (!path) return json({ error: 'missing path' }, 400, cors);
  if (content.length < 1 && images.length === 0) return json({ error: '评论不能为空' }, 400, cors);
  if (content.length > 800) return json({ error: '评论需 1-800 字' }, 400, cors);

  var id = 'comment:' + path + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 10);
  var comment = {
    id: id, path: path, uid: p.uid, name: p.name, avatar: p.avatar,
    content: content, createdAt: Date.now(), replyTo: replyTo || null,
    images: images
  };
  await COMMENTS.put(id, JSON.stringify(comment));
  return json({ ok: true, comment: comment }, 200, cors);
}

// ---------------- 删除评论（站长可删任意；普通用户仅能删自己的）----------------
async function deleteComment(request, url, cors) {
  var id = (url.searchParams.get('id') || '').trim();
  if (id.indexOf('comment:') !== 0) return json({ error: 'invalid id' }, 400, cors);

  /* 先鉴权：未登录一律 401，无论评论是否存在 */
  var owner = await isOwner(request);
  var p = owner ? null : await authUser(request);
  if (!owner && !p) return json({ error: '请先登录后再操作' }, 401, cors);

  var raw = await COMMENTS.get(id);
  if (!raw) return json({ error: '评论不存在或已删除' }, 404, cors);
  var c;
  try { c = JSON.parse(raw); } catch (e) { return json({ error: '评论不存在或已删除' }, 404, cors); }

  var isMine = p && c.uid && c.uid === p.uid;
  if (!owner && !isMine) return json({ error: '只能删除自己的评论' }, 403, cors);

  await COMMENTS.delete(id);
  return json({ ok: true, id: id }, 200, cors);
}
