// ============================================================
// Cloudflare Worker：GitHub OAuth 代理（专供 Decap CMS 管理后台）
// 经典 Service Worker 格式（addEventListener），与 like-counter 保持一致。
//
// 路由：
//   GET /          -> 说明页 + 配置自检（人可读）
//   GET /health    -> JSON 配置自检（脚本可读）
//   GET /auth      -> 302 跳转 GitHub 授权页
//   GET /callback  -> code 换 access_token，再以 postMessage 握手交还后台
//
// 凭证配置（二选一，推荐第一种）：
//   1) 部署为 Worker Secrets：CLIENT_ID / CLIENT_SECRET（在后台不可见）
//   2) 直接改本文件底部两个 FALLBACK 常量后重新部署
// ============================================================

var FALLBACK_CLIENT_ID = 'PASTE_YOUR_GITHUB_OAUTH_CLIENT_ID';
var FALLBACK_CLIENT_SECRET = 'PASTE_YOUR_GITHUB_OAUTH_CLIENT_SECRET';

// 允许发起登录的站点来源（Decap CMS 所在页面）。仅用于提示页展示，不参与放行判断。
var EXPECTED_SITE = 'https://my-blog-jingpanlong.pages.dev';

addEventListener('fetch', function (event) {
  event.respondWith(handle(event.request));
});

function clientId() {
  try { if (typeof CLIENT_ID !== 'undefined' && CLIENT_ID) return CLIENT_ID; } catch (e) { /* noop */ }
  return FALLBACK_CLIENT_ID;
}

function clientSecret() {
  try { if (typeof CLIENT_SECRET !== 'undefined' && CLIENT_SECRET) return CLIENT_SECRET; } catch (e) { /* noop */ }
  return FALLBACK_CLIENT_SECRET;
}

function configured() {
  return clientId().indexOf('PASTE_') !== 0 && clientSecret().indexOf('PASTE_') !== 0;
}

async function handle(request) {
  var url = new URL(request.url);
  var path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/auth') return handleAuth(url);
  if (path === '/callback') return handleCallback(url);
  if (path === '/health') {
    var ok = configured();
    return json({
      ok: ok,
      worker: url.origin,
      clientIdSet: clientId().indexOf('PASTE_') !== 0,
      clientSecretSet: clientSecret().indexOf('PASTE_') !== 0,
      callbackUrl: url.origin + '/callback',
      expectedSite: EXPECTED_SITE
    }, ok ? 200 : 503);
  }
  return handleInfo(url);
}

// ---------- /auth：跳转 GitHub 授权页 ----------
function handleAuth(url) {
  if (!configured()) {
    return page(503, 'OAuth 尚未配置',
      '还没有把 GitHub OAuth App 的 Client ID / Secret 写入本 Worker。<br>' +
      '请到 GitHub → Settings → Developer settings → OAuth Apps 创建应用，' +
      '然后用 tools/deploy_oauth_worker.py 带上 CLIENT_ID / CLIENT_SECRET 重新部署。');
  }

  var params = url.searchParams;
  var provider = params.get('provider') || 'github';
  // Decap CMS 默认请求 scope=repo；open_authoring 场景下是 public_repo
  var scope = params.get('scope') || 'public_repo,repo';
  var redirectUri = url.origin + '/callback';

  var q = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    scope: scope,
    state: rand(16),
    allow_signup: 'false'
  });

  // GitHub 授权页（provider 目前只实现 github；其余给出明确报错而不是静默失败）
  if (provider !== 'github') {
    return page(400, '不支持的登录方式', '本代理当前只支持 provider=github，收到：' + escapeHtml(provider));
  }

  return new Response(null, {
    status: 302,
    headers: { 'Location': 'https://github.com/login/oauth/authorize?' + q.toString() }
  });
}

// ---------- /callback：code -> token -> 握手交还 ----------
async function handleCallback(url) {
  var params = url.searchParams;

  // 用户在 GitHub 上点了取消
  if (params.get('error')) {
    return handshakePage(null, 'GitHub 已取消授权：' +
      (params.get('error_description') || params.get('error')));
  }

  var code = params.get('code');
  if (!code) {
    return page(400, '回调缺少 code', 'GitHub 没有返回授权码，请重新从 /admin/ 登录。');
  }

  if (!configured()) {
    return page(503, 'OAuth 尚未配置', 'Client ID / Secret 缺失，无法兑换 access_token。');
  }

  var redirectUri = url.origin + '/callback';
  var resp;
  try {
    resp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: clientId(),
        client_secret: clientSecret(),
        code: code,
        redirect_uri: redirectUri
      })
    });
  } catch (e) {
    return page(502, '无法连接 GitHub', escapeHtml(String(e && e.message || e)));
  }

  var data = {};
  try { data = await resp.json(); } catch (e) { /* 保持空对象 */ }

  if (!resp.ok || !data.access_token) {
    var detail = data.error_description || data.error || JSON.stringify(data);
    return page(502, 'Token 兑换失败',
      'GitHub 返回：' + escapeHtml(String(detail)) +
      '<br><br>常见原因：Client ID / Secret 写错，或 OAuth App 的回调地址不是 ' +
      '<code>' + escapeHtml(redirectUri) + '</code>。');
  }

  return handshakePage(data.access_token, null);
}

// ---------- Decap CMS 认证握手页 ----------
// 协议（从 decap-cms@3.x 发行包逆向）：
//   1) 弹窗向 opener 发送  "authorizing:github"
//   2) 后台回执同字符串，弹窗收到后发送
//      "authorization:github:success:" + JSON.stringify({ token })
//   3) 后台取 data.token 作为 GitHub access token
function handshakePage(token, errorMessage) {
  var payload;
  if (token) {
    payload = 'authorization:github:success:' + JSON.stringify({ token: sanitize(token) });
  } else {
    payload = 'authorization:github:error:' + JSON.stringify({ message: String(errorMessage || 'unknown') });
  }

  var html = '<!DOCTYPE html>\n' +
'<html lang="zh-CN">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<meta name="robots" content="noindex">\n' +
'<title>正在返回管理后台…</title>\n' +
'<style>\n' +
'  *{box-sizing:border-box;margin:0;padding:0}\n' +
'  body{min-height:100vh;display:flex;align-items:center;justify-content:center;\n' +
'       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;\n' +
'       background:#0b0d14;color:#e8eaf2}\n' +
'  .card{width:min(88vw,340px);padding:34px 26px;text-align:center;\n' +
'        background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);\n' +
'        border-radius:18px;backdrop-filter:blur(14px);box-shadow:0 24px 60px rgba(0,0,0,.45)}\n' +
'  .spin{width:38px;height:38px;margin:0 auto 20px;border-radius:50%;\n' +
'        border:3px solid rgba(255,255,255,.14);border-top-color:#f59e0b;animation:sp .8s linear infinite}\n' +
'  .ok{border-top-color:#34d399}\n' +
'  .bad{border-top-color:#f87171;animation:none}\n' +
'  @keyframes sp{to{transform:rotate(360deg)}}\n' +
'  h1{font-size:16px;font-weight:600;letter-spacing:.02em}\n' +
'  p{margin-top:10px;font-size:13px;line-height:1.7;color:#a8adbe}\n' +
'  code{font-size:12px;color:#fbbf24;word-break:break-all}\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<div class="card">\n' +
'  <div class="spin" id="spin"></div>\n' +
'  <h1 id="t">正在返回管理后台…</h1>\n' +
'  <p id="d">请稍候，窗口会自动关闭</p>\n' +
'</div>\n' +
'<script>\n' +
'(function (){\n' +
'  var PAYLOAD = ' + JSON.stringify(payload) + ';\n' +
'  var SELF = location.origin;\n' +
'  var t = document.getElementById("t"), d = document.getElementById("d"), sp = document.getElementById("spin");\n' +
'  function done(title, desc, cls){\n' +
'    if (cls) sp.className = "spin " + cls;\n' +
'    t.textContent = title; d.innerHTML = desc || "";\n' +
'  }\n' +
'  if (!window.opener) {\n' +
'    done("这个页面不能直接打开", "请回到博客后台 <code>/admin/</code>，重新点击「使用 GitHub 登录」。", "bad");\n' +
'    return;\n' +
'  }\n' +
'  var settled = false;\n' +
'  function onEcho(ev){\n' +
'    if (settled) return;\n' +
'    if (ev.data !== "authorizing:github") return;\n' +
'    if (ev.origin === SELF) return;              // 忽略自己域内的回响\n' +
'    settled = true;\n' +
'    window.removeEventListener("message", onEcho, false);\n' +
'    window.opener.postMessage(PAYLOAD, "*");\n' +
'    setTimeout(function(){ try { window.close(); } catch (e) {} }, 350);\n' +
'  }\n' +
'  window.addEventListener("message", onEcho, false);\n' +
'  window.opener.postMessage("authorizing:github", "*");\n' +
'  setTimeout(function(){\n' +
'    if (settled) return;\n' +
'    done("没有收到后台响应", "请手动关闭本窗口，回到 <code>/admin/</code> 重试。", "bad");\n' +
'  }, 6000);\n' +
'})();\n' +
'</script>\n' +
'</body>\n' +
'</html>\n';

  return new Response(html, {
    status: token ? 200 : 400,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

// ---------- 说明页 ----------
function handleInfo(url) {
  var ok = configured();
  var rows =
    row('Worker 地址', '<code>' + escapeHtml(url.origin) + '</code>') +
    row('OAuth 回调地址', '<code>' + escapeHtml(url.origin + '/callback') + '</code>') +
    row('CLIENT_ID', clientId().indexOf('PASTE_') === 0
      ? '<b style="color:#f87171">未配置</b>'
      : '已配置（' + escapeHtml(clientId().slice(0, 7)) + '…）') +
    row('CLIENT_SECRET', clientSecret().indexOf('PASTE_') === 0
      ? '<b style="color:#f87171">未配置</b>'
      : '<span style="color:#34d399">已配置</span>') +
    row('后台入口', '<code>' + EXPECTED_SITE + '/admin/</code>');

  var body = ok
    ? '<p style="color:#34d399">配置就绪，可以到后台登录了。</p>'
    : '<p style="color:#fbbf24">还差最后一步：把 GitHub OAuth App 的 Client ID / Secret 写进来。</p>' +
      '<ol>' +
      '<li>GitHub → Settings → Developer settings → <b>OAuth Apps</b> → New OAuth App</li>' +
      '<li>Homepage URL 填 <code>' + EXPECTED_SITE + '</code></li>' +
      '<li>Authorization callback URL 填 <code>' + escapeHtml(url.origin + '/callback') + '</code></li>' +
      '<li>拿到 Client ID / Secret 后重跑部署脚本即可</li>' +
      '</ol>';

  var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="robots" content="noindex">\n<title>博客后台 OAuth 代理</title>\n<style>\n' +
    '*{box-sizing:border-box;margin:0;padding:0}\n' +
    'body{min-height:100vh;padding:48px 20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#0b0d14;color:#e8eaf2}\n' +
    '.wrap{max-width:640px;margin:0 auto}\n' +
    'h1{font-size:22px;margin-bottom:6px}\n' +
    '.sub{font-size:13px;color:#8b90a3;margin-bottom:26px}\n' +
    '.card{padding:22px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09)}\n' +
    'table{width:100%;border-collapse:collapse;font-size:13px}\n' +
    'td{padding:9px 0;vertical-align:top;border-bottom:1px solid rgba(255,255,255,.06)}\n' +
    'td:first-child{width:150px;color:#8b90a3}\n' +
    'ol,li{margin:6px 0 0 18px;font-size:13px;line-height:1.9}\n' +
    'code{font-size:12px;color:#fbbf24;word-break:break-all}\n' +
    'p{font-size:13px;line-height:1.8;margin-bottom:12px}\n' +
    '</style>\n</head>\n<body>\n<div class="wrap">\n' +
    '<h1>博客后台 OAuth 代理</h1>\n' +
    '<div class="sub">Decap CMS 的 GitHub 登录中转服务</div>\n' +
    '<div class="card">\n<table>' + rows + '</table>\n</div>\n' +
    '<div class="card" style="margin-top:16px">' + body + '</div>\n' +
    '</div>\n</body>\n</html>\n';

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function row(k, v) {
  return '<tr><td>' + k + '</td><td>' + v + '</td></tr>';
}

// ---------- 工具 ----------
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function page(status, title, detail) {
  var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="robots" content="noindex">\n<title>' + escapeHtml(title) + '</title>\n<style>\n' +
    '*{box-sizing:border-box;margin:0;padding:0}\n' +
    'body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;\n' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;\n' +
    'background:#0b0d14;color:#e8eaf2}\n' +
    '.card{width:min(90vw,520px);padding:30px 28px;border-radius:18px;\n' +
    'background:rgba(255,255,255,.045);border:1px solid rgba(248,113,113,.35)}\n' +
    'h1{font-size:17px;margin-bottom:12px;color:#fca5a5}\n' +
    'p{font-size:13px;line-height:1.85;color:#a8adbe}\n' +
    'code{font-size:12px;color:#fbbf24;word-break:break-all}\n' +
    '</style>\n</head>\n<body>\n<div class="card"><h1>' + escapeHtml(title) +
    '</h1><p>' + detail + '</p></div>\n</body>\n</html>\n';
  return new Response(html, {
    status: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// GitHub token 只含 [A-Za-z0-9_]，这里再兜底剥掉危险字符
function sanitize(t) {
  return String(t).replace(/[^A-Za-z0-9_.\-]/g, '');
}

function rand(n) {
  var s = '';
  var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (var i = 0; i < n; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}
