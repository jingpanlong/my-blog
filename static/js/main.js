(function () {
  'use strict';

  var root = document.documentElement;

  // ---- 主题切换 ----
  var themeToggle = document.getElementById('theme-toggle');
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
  }
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var cur = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      applyTheme(cur);
    });
  }

  // ---- 回到顶部 ----
  var toTop = document.getElementById('to-top');
  if (toTop) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 400) toTop.classList.add('show');
      else toTop.classList.remove('show');
    }, { passive: true });
    toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  // ---- 站内搜索 ----
  var modal = document.getElementById('search-modal');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  var empty = document.getElementById('search-empty');
  var toggle = document.getElementById('search-toggle');
  var closeBtn = document.getElementById('search-close');
  var indexData = null;

  function openSearch() {
    if (!modal) return;
    modal.hidden = false;
    if (input) input.focus();
    loadIndex();
  }
  function closeSearch() {
    if (!modal) return;
    modal.hidden = true;
    if (input) input.value = '';
    if (results) results.innerHTML = '';
    if (empty) empty.classList.remove('show');
  }
  function loadIndex() {
    if (indexData) return;
    fetch('/search-index.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { indexData = d || []; })
      .catch(function () { indexData = []; });
  }
  function plain(s) { return (s || '').replace(/<[^>]+>/g, ''); }
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function render(q) {
    if (!results) return;
    q = (q || '').trim().toLowerCase();
    if (!q) { results.innerHTML = ''; if (empty) empty.classList.remove('show'); return; }
    var data = indexData || [];
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var item = data[i];
      var hay = (item.title + ' ' + (item.summary || '') + ' ' + (item.tags || []).join(' ') + ' ' + (item.content || '')).toLowerCase();
      if (hay.indexOf(q) !== -1) out.push(item);
    }
    if (!out.length) { results.innerHTML = ''; if (empty) empty.classList.add('show'); return; }
    if (empty) empty.classList.remove('show');
    results.innerHTML = out.slice(0, 20).map(function (it) {
      var tags = (it.tags || []).map(function (t) { return '#' + t; }).join(' ');
      return '<a class="search-result" href="' + it.url + '">' +
        '<div class="sr-title">' + escapeHtml(it.title) + '</div>' +
        '<div class="sr-summary">' + escapeHtml(plain(it.summary)) + '</div>' +
        (tags ? '<div class="sr-tags">' + escapeHtml(tags) + '</div>' : '') +
        '</a>';
    }).join('');
  }

  if (toggle) toggle.addEventListener('click', openSearch);
  if (closeBtn) closeBtn.addEventListener('click', closeSearch);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-close')) closeSearch();
    });
  }
  if (input) input.addEventListener('input', function () { render(input.value); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && !modal.hidden) { closeSearch(); return; }
    if (e.key === '/' && modal && modal.hidden &&
        document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault(); openSearch();
    }
  });

  // ---- 文章互动：点赞 / 收藏 / 转发 ----
  (function () {
    var LIKE_KEY = 'blog_liked';
    var FAV_KEY = 'blog_favs';
    function getLiked() { try { return JSON.parse(localStorage.getItem(LIKE_KEY) || '[]'); } catch (e) { return []; } }
    function setLiked(a) { try { localStorage.setItem(LIKE_KEY, JSON.stringify(a)); } catch (e) {} }
    function getFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; } }
    function setFavs(a) { try { localStorage.setItem(FAV_KEY, JSON.stringify(a)); } catch (e) {} }

    var box = document.querySelector('.interactions');
    if (box) {
      var path = box.getAttribute('data-path');
      var title = box.getAttribute('data-title') || document.title;
      var url = box.getAttribute('data-url') || location.href;
      var apiMeta = document.querySelector('meta[name="like-api"]');
      var api = (apiMeta && apiMeta.content) ? apiMeta.content : '';

      // 点赞
      var likeBtn = document.getElementById('like-btn');
      var likeCount = document.getElementById('like-count');
      var liked = getLiked().indexOf(path) !== -1;
      function setLikeUI(n, on) {
        if (likeCount) likeCount.textContent = n;
        if (likeBtn) { likeBtn.classList.toggle('on', on); likeBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      }
      if (api) {
        fetch(api + '?path=' + encodeURIComponent(path))
          .then(function (r) { return r.json(); })
          .then(function (d) { setLikeUI((d && d.count) || 0, liked); })
          .catch(function () { setLikeUI(liked ? 1 : 0, liked); });
      } else {
        setLikeUI(liked ? 1 : 0, liked);
      }
      if (likeBtn) likeBtn.addEventListener('click', function () {
        var cur = getLiked();
        if (cur.indexOf(path) !== -1) return;
        cur.push(path); setLiked(cur);
        if (api) {
          fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: path })
            .then(function (r) { return r.json(); })
            .then(function (d) { setLikeUI((d && d.count) || 1, true); })
            .catch(function () { setLikeUI((likeCount ? (+likeCount.textContent + 1) : 1), true); });
        } else {
          setLikeUI((likeCount ? (+likeCount.textContent) : 0) + 1, true);
        }
      });

      // 收藏（服务端计数：匿名 uid 去重，未登录也可看到数量）
      var FAV_UID_KEY = 'blog_fav_uid';
      function getFavUid() {
        var u = '';
        try { u = localStorage.getItem(FAV_UID_KEY) || ''; } catch (e) {}
        if (!u || !/^[A-Za-z0-9_-]{6,40}$/.test(u)) {
          u = 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
          try { localStorage.setItem(FAV_UID_KEY, u); } catch (e) {}
        }
        return u;
      }
      var favBtn = document.getElementById('fav-btn');
      var favCount = document.getElementById('fav-count');
      function setFavUI(n, on) {
        if (favCount) favCount.textContent = (typeof n === 'number') ? n : (favCount.textContent || '0');
        if (favBtn) { favBtn.classList.toggle('on', on); favBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      }
      function favToggle() {
        if (!api) return Promise.resolve(null);
        return fetch(api + '/favs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: path, uid: getFavUid() })
        }).then(function (r) { return r.json(); }).catch(function () { return null; });
      }
      function localFavOn() { return getFavs().some(function (f) { return f.path === path; }); }
      if (api) {
        fetch(api + '/favs?path=' + encodeURIComponent(path) + '&uid=' + encodeURIComponent(getFavUid()))
          .then(function (r) { return r.json(); })
          .then(function (d) { setFavUI((d && d.count) || 0, !!(d && d.mine)); })
          .catch(function () { setFavUI(localFavOn() ? 1 : 0, localFavOn()); });
      } else {
        setFavUI(localFavOn() ? 1 : 0, localFavOn());
      }
      if (favBtn) favBtn.addEventListener('click', function () {
        var wasOn = favBtn.classList.contains('on');
        // 乐观更新，失败回滚
        if (favCount) favCount.textContent = String(Math.max(0, (+favCount.textContent || 0) + (wasOn ? -1 : 1)));
        favBtn.classList.toggle('on', !wasOn);
        favBtn.setAttribute('aria-pressed', !wasOn ? 'true' : 'false');
        favToggle().then(function (d) {
          if (d && typeof d.count === 'number') setFavUI(d.count, !!d.mine);
          else { // 接口不可用：回滚 UI，仍保留本机收藏夹
            if (favCount) favCount.textContent = String(Math.max(0, (+favCount.textContent || 0) + (wasOn ? 1 : -1)));
            favBtn.classList.toggle('on', wasOn);
            favBtn.setAttribute('aria-pressed', wasOn ? 'true' : 'false');
          }
          // 同步本机收藏夹（「我的收藏」弹窗）
          var favs = getFavs();
          var i = -1;
          for (var k = 0; k < favs.length; k++) { if (favs[k].path === path) { i = k; break; } }
          var nowOn = favBtn.classList.contains('on');
          if (nowOn && i === -1) favs.unshift({ path: path, title: title, url: url });
          if (!nowOn && i !== -1) favs.splice(i, 1);
          setFavs(favs); updateFavBadge();
        });
      });

      // 转发菜单
      var shareBtn = document.getElementById('share-btn');
      var shareMenu = document.getElementById('share-menu');
      if (shareBtn && shareMenu) {
        shareBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var open = shareMenu.hidden;
          shareMenu.hidden = !open;
          shareBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        shareMenu.addEventListener('click', function (e) {
          var t = e.target.closest('[data-share]'); if (!t) return;
          var kind = t.getAttribute('data-share');
          if (kind === 'copy') {
            copyText(url).then(function () { flash(shareBtn, '已复制'); }).catch(function () { flash(shareBtn, '复制失败'); });
          } else if (kind === 'weibo') {
            window.open('https://service.weibo.com/share/share.php?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(title), '_blank', 'noopener');
          } else if (kind === 'qq') {
            window.open('https://connect.qq.com/widget/shareqq/index.html?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(title), '_blank', 'noopener');
          } else if (kind === 'system') {
            if (navigator.share) navigator.share({ title: title, url: url }).catch(function () {});
            else flash(shareBtn, '不支持');
          }
          shareMenu.hidden = true; shareBtn.setAttribute('aria-expanded', 'false');
        });
        document.addEventListener('click', function () {
          if (shareMenu && !shareMenu.hidden) { shareMenu.hidden = true; shareBtn.setAttribute('aria-expanded', 'false'); }
        });
      }
    }

    function copyText(s) {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s);
      return new Promise(function (res, rej) {
        try {
          var ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta); res();
        } catch (e) { rej(e); }
      });
    }
    function flash(btn, msg) {
      var label = btn.querySelector('.act-label'); if (!label) return;
      var old = label.textContent; label.textContent = msg;
      setTimeout(function () { label.textContent = old; }, 1200);
    }

    // 收藏弹窗
    var favsToggle = document.getElementById('favs-toggle');
    var favsModal = document.getElementById('favorites-modal');
    var favsList = document.getElementById('favorites-list');
    var favsEmpty = document.getElementById('favorites-empty');
    var favsCount = document.getElementById('favs-count');
    function updateFavBadge() {
      var n = getFavs().length;
      if (favsCount) { favsCount.textContent = n; favsCount.hidden = n === 0; }
    }
    function renderFavs() {
      if (!favsList) return;
      var favs = getFavs();
      favsList.innerHTML = favs.map(function (f, i) {
        return '<a class="fav-item" href="' + f.url + '"><span class="fav-title">' +
          (f.title || f.path) + '</span><button type="button" class="fav-del" data-i="' + i + '" aria-label="移除">✕</button></a>';
      }).join('');
      if (favsEmpty) favsEmpty.style.display = favs.length ? 'none' : 'block';
    }
    if (favsToggle && favsModal) {
      favsToggle.addEventListener('click', function () { renderFavs(); favsModal.hidden = false; });
      favsModal.addEventListener('click', function (e) {
        if (e.target.hasAttribute('data-close')) favsModal.hidden = true;
        var del = e.target.closest('.fav-del');
        if (del) {
          var favs = getFavs(); favs.splice(+del.getAttribute('data-i'), 1); setFavs(favs);
          renderFavs(); updateFavBadge();
        }
      });
    }
    updateFavBadge();
  })();

  // ---- 侧栏订阅（无后端，走邮件订阅）----
  (function () {
    var form = document.getElementById('subscribe-form');
    if (!form) return;
    var input = document.getElementById('subscribe-email');
    var hint = form.parentNode.querySelector('.sub-hint');
    var defaultHint = hint ? hint.textContent : '';
    var to = form.getAttribute('data-email') || '';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = (input && input.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        if (hint) { hint.textContent = '请输入正确的邮箱地址'; hint.style.color = '#ff5c8a'; }
        if (input) input.focus();
        return;
      }
      var subject = encodeURIComponent('订阅博客 · ' + v);
      var body = encodeURIComponent('你好，我想订阅你的博客。\n\n我的邮箱：' + v + '\n');
      window.location.href = 'mailto:' + to + '?subject=' + subject + '&body=' + body;
      if (hint) { hint.textContent = '已打开邮件客户端，发送后即完成订阅'; hint.style.color = ''; }
      if (input) input.value = '';
      setTimeout(function () {
        if (hint) hint.textContent = defaultHint;
      }, 6000);
    });
  })();

  // ---- 文章浏览量计数 ----
  (function () {
    var meta = document.querySelector('meta[name="view-api"]');
    if (!meta || !meta.content) return;
    var api = meta.content;
    var nodes = document.querySelectorAll('[data-view-path]');
    if (!nodes.length) return;
    function fmt(n) {
      n = Number(n) || 0;
      return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
    }
    Array.prototype.forEach.call(nodes, function (node) {
      var path = node.getAttribute('data-view-path');
      if (!path) return;
      var out = node.querySelector('.view-n') || node;
      var inc = node.getAttribute('data-increment') === '1';
      function setN(n) { out.textContent = fmt(n); }
      if (inc) {
        var key = 'viewed:' + path;
        var seen = false;
        try { seen = sessionStorage.getItem(key) === '1'; } catch (e) {}
        if (seen) {
          fetch(api + '?path=' + encodeURIComponent(path)).then(function (r) { return r.json(); })
            .then(function (d) { setN(d.count); }).catch(function () { setN('—'); });
        } else {
          try { sessionStorage.setItem(key, '1'); } catch (e) {}
          fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: path })
            .then(function (r) { return r.json(); })
            .then(function (d) { setN(d.count); })
            .catch(function () { setN('—'); try { sessionStorage.removeItem(key); } catch (e) {} });
        }
      } else {
        fetch(api + '?path=' + encodeURIComponent(path)).then(function (r) { return r.json(); })
          .then(function (d) { setN(d.count); }).catch(function () { setN('—'); });
      }
    });
  })();

  // ============ 全局账号（注册 / 登录 / 邮箱验证 / 找回密码 / 会话吊销）============
  var BlogAuth = (function () {
    var TOKEN_KEY = 'blog_token';
    var apiMeta = document.querySelector('meta[name="comment-api"]');
    var api = (apiMeta && apiMeta.content) ? apiMeta.content : '';
    var AVATARS = ['🦊', '🐱', '🐶', '🐼', '🦁', '🐯', '🐸', '🦉', '🐧', '🦄', '🌟', '🍎'];
    var state = { token: '', user: null, owner: null, ownerKey: '' };
    var listeners = [];

    function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
    function persist(t) {
      state.token = t || '';
      try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    }
    function clearToken() { state.token = ''; state.user = null; try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
    state.token = getToken();

    var OWNER_STORE = 'blog_owner_key';
    function getOwnerKey() { try { return localStorage.getItem(OWNER_STORE) || ''; } catch (e) { return ''; } }
    function setOwnerKey(k) { try { k ? localStorage.setItem(OWNER_STORE, k) : localStorage.removeItem(OWNER_STORE); } catch (e) {} }
    state.ownerKey = getOwnerKey();

    var modalEl = document.getElementById('auth-modal');
    var formEl = document.getElementById('auth-form');
    var msgEl = document.getElementById('auth-msg');
    var submitEl = document.getElementById('auth-submit');
    var closeEl = document.getElementById('auth-close');
    var titleEl = document.getElementById('auth-title');
    var tabsEl = document.getElementById('auth-tabs');
    var tabs = document.querySelectorAll('.auth-tab');
    var toForgotEl = document.getElementById('auth-to-forgot');
    var toLoginEl = document.getElementById('auth-to-login');
    var fieldAvatar = document.getElementById('auth-avatar-field');
    var avatarGrid = document.getElementById('auth-avatar-grid');
    var fieldName = document.getElementById('auth-name-field');
    var nameInput = document.getElementById('auth-name');
    var emailInput = document.getElementById('auth-email');
    var pwInput = document.getElementById('auth-pw');
    var pw2Field = document.getElementById('auth-pw2-field');
    var pw2Input = document.getElementById('auth-pw2');
    var resetField = document.getElementById('auth-reset-field');
    var resetPw = document.getElementById('auth-reset-pw');
    var resetPw2 = document.getElementById('auth-reset-pw2');
    var devBox = document.getElementById('auth-devlinks');

    var mode = 'login';
    var selectedAvatar = AVATARS[0];
    var resetToken = '';

    function on(fn) { listeners.push(fn); }
    function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) {} }); }
    function setMsg(t, isErr) {
      if (!msgEl) return;
      msgEl.textContent = t || '';
      msgEl.className = 'cf-msg auth-msg' + (isErr ? ' err' : '');
    }
    function showDevLinks(links) {
      if (!devBox) return;
      if (!links || !links.length) { devBox.innerHTML = ''; devBox.hidden = true; return; }
      devBox.hidden = false; devBox.innerHTML = '';
      links.forEach(function (l) {
        var a = document.createElement('a');
        a.href = l.link; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = l.type === 'verify' ? '开发模式：点此验证邮箱' : '开发模式：点此重置密码';
        devBox.appendChild(a);
      });
    }
    function buildAvatarGrid() {
      if (!avatarGrid) return;
      avatarGrid.innerHTML = '';
      AVATARS.forEach(function (emo) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'avatar-opt' + (emo === selectedAvatar ? ' active' : '');
        b.textContent = emo; b.setAttribute('data-emoji', emo);
        b.addEventListener('click', function () {
          selectedAvatar = emo;
          Array.prototype.forEach.call(avatarGrid.children, function (c) {
            c.classList.toggle('active', c.getAttribute('data-emoji') === emo);
          });
        });
        avatarGrid.appendChild(b);
      });
    }
    function setMode(m) {
      mode = m;
      if (titleEl) titleEl.textContent = m === 'register' ? '注册账号' : (m === 'forgot' ? '找回密码' : (m === 'reset' ? '重置密码' : '登录'));
      Array.prototype.forEach.call(tabs, function (t) {
        t.classList.toggle('active', t.getAttribute('data-tab') === m);
      });
      if (tabsEl) tabsEl.hidden = (m === 'forgot' || m === 'reset');
      if (fieldAvatar) fieldAvatar.hidden = (m !== 'register');
      if (fieldName) fieldName.hidden = (m !== 'register');
      if (emailInput) { emailInput.hidden = (m === 'reset'); emailInput.placeholder = (m === 'register') ? '邮箱' : '邮箱 / 昵称'; }
      if (pwInput) pwInput.hidden = (m === 'forgot' || m === 'reset');
      if (pw2Field) pw2Field.hidden = (m !== 'register');
      if (resetField) resetField.hidden = (m !== 'reset');
      if (toForgotEl) toForgotEl.style.display = (m === 'login') ? '' : 'none';
      if (toLoginEl) toLoginEl.hidden = !(m === 'forgot' || m === 'reset');
      if (submitEl) submitEl.textContent = m === 'register' ? '注册' : (m === 'forgot' ? '发送重置链接' : (m === 'reset' ? '重置密码' : '登录'));
      if (m === 'register') buildAvatarGrid();
      setMsg(''); showDevLinks(null);
      var f = (m === 'register') ? nameInput : emailInput;
      if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 30);
    }
    function open(m) {
      if (!modalEl) return;
      setMode(m || 'login');
      modalEl.hidden = false;
    }
    function close() { if (modalEl) modalEl.hidden = true; }

    function apiCall(path, body, withAuth) {
      var headers = { 'Content-Type': 'application/json' };
      if (withAuth && state.token) headers['Authorization'] = 'Bearer ' + state.token;
      return fetch(api + path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) })
        .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); });
    }
    function applyAuth(res) {
      if (res.s === 200 && res.d && res.d.token) {
        persist(res.d.token);
        state.user = res.d.user || null;
        emit();
        return true;
      }
      return false;
    }
    function submit(e) {
      e.preventDefault();
      if (mode === 'register') return doRegister();
      if (mode === 'forgot') return doForgot();
      if (mode === 'reset') return doReset();
      return doLogin();
    }
    function doLogin() {
      var ident = (emailInput && emailInput.value || '').trim();
      var pw = (pwInput && pwInput.value) || '';
      if (!ident) { setMsg('请输入邮箱或昵称', true); return; }
      if (!pw) { setMsg('请输入密码', true); return; }
      setMsg('登录中…'); if (submitEl) submitEl.disabled = true;
      apiCall('/auth/login', { email: ident, password: pw }).then(function (res) {
        if (applyAuth(res)) { close(); if (formEl) formEl.reset(); setMsg(''); }
        else setMsg((res.d && res.d.error) || '登录失败', true);
      }).catch(function () { setMsg('网络错误，请稍后重试', true); })
        .then(function () { if (submitEl) submitEl.disabled = false; });
    }
    function doRegister() {
      var name = (nameInput && nameInput.value || '').trim();
      var email = (emailInput && emailInput.value || '').trim().toLowerCase();
      var pw = (pwInput && pwInput.value) || '';
      var pw2 = (pw2Input && pw2Input.value) || '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setMsg('请输入有效邮箱', true); return; }
      if (name.length < 1 || name.length > 24) { setMsg('昵称需 1-24 字', true); return; }
      if (pw.length < 8) { setMsg('密码至少 8 位', true); return; }
      if (pw !== pw2) { setMsg('两次输入的密码不一致', true); return; }
      setMsg('注册中…'); if (submitEl) submitEl.disabled = true;
      apiCall('/auth/register', { name: name, email: email, avatar: selectedAvatar, password: pw, confirmPassword: pw2 })
        .then(function (res) {
          if (applyAuth(res)) {
            var u = res.d.user || {};
            setMsg('注册成功！' + (u.verified ? '' : '请验证邮箱后即可评论。'));
            showDevLinks(res.d.devLinks);
            if (!res.d.devLinks || !res.d.devLinks.length) { close(); if (formEl) formEl.reset(); }
          } else setMsg((res.d && res.d.error) || '注册失败', true);
        }).catch(function () { setMsg('网络错误，请稍后重试', true); })
        .then(function () { if (submitEl) submitEl.disabled = false; });
    }
    function doForgot() {
      var ident = (emailInput && emailInput.value || '').trim();
      if (!ident) { setMsg('请输入邮箱或昵称', true); return; }
      setMsg('发送中…'); if (submitEl) submitEl.disabled = true;
      apiCall('/auth/forgot', { email: ident }).then(function (res) {
        if (res.d && res.d.ok) { setMsg('如果账号存在，重置链接已发送。'); showDevLinks(res.d.devLinks); }
        else setMsg((res.d && res.d.error) || '操作失败', true);
      }).catch(function () { setMsg('网络错误，请稍后重试', true); })
        .then(function () { if (submitEl) submitEl.disabled = false; });
    }
    function doReset() {
      var pw = (resetPw && resetPw.value) || '';
      var pw2 = (resetPw2 && resetPw2.value) || '';
      if (pw.length < 8) { setMsg('密码至少 8 位', true); return; }
      if (pw !== pw2) { setMsg('两次输入的密码不一致', true); return; }
      setMsg('重置中…'); if (submitEl) submitEl.disabled = true;
      apiCall('/auth/reset', { token: resetToken, password: pw, confirmPassword: pw2 }).then(function (res) {
        if (res.d && res.d.ok) { setMsg('密码已重置，请用新密码登录。'); setTimeout(function () { setMode('login'); }, 900); }
        else setMsg((res.d && res.d.error) || '重置失败', true);
      }).catch(function () { setMsg('网络错误，请稍后重试', true); })
        .then(function () { if (submitEl) submitEl.disabled = false; });
    }
    function logout() {
      if (state.token) apiCall('/auth/logout', {}, true).catch(function () {});
      clearToken(); emit();
    }
    function logoutAll() {
      if (!state.token) { clearToken(); emit(); return; }
      apiCall('/auth/logout-all', {}, true)
        .then(function () { clearToken(); emit(); })
        .catch(function () { clearToken(); emit(); });
    }
    function refresh() {
      if (!state.token) { state.user = null; emit(); return Promise.resolve(); }
      return fetch(api + '/auth/me', { headers: { 'Authorization': 'Bearer ' + state.token } })
        .then(function (r) {
          if (r.status === 401) { clearToken(); emit(); return null; }
          return r.json();
        })
        .then(function (d) { if (d && d.user) { state.user = d.user; emit(); } })
        .catch(function () {});
    }
    function verifyToken(tok) {
      return apiCall('/auth/verify', { token: tok }).then(function (res) {
        if (res.d && res.d.ok) { if (state.token) refresh(); return true; }
        return false;
      });
    }
    // ---- 站长模式（免登录评论）----
    function checkOwner() {
      if (!state.ownerKey) { state.owner = null; emit(); return Promise.resolve(); }
      return fetch(api + '/auth/owner-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Owner-Key': state.ownerKey },
        body: '{}'
      })
        .then(function (r) {
          if (r.status !== 200) { state.owner = null; if (r.status === 401) { setOwnerKey(''); state.ownerKey = ''; } emit(); return null; }
          return r.json();
        })
        .then(function (d) { if (d && d.ok) { state.owner = d.user; emit(); } })
        .catch(function () {});
    }
    function enterOwner(k) { state.ownerKey = k || ''; setOwnerKey(state.ownerKey); return checkOwner(); }
    function exitOwner() { state.ownerKey = ''; setOwnerKey(''); state.owner = null; emit(); }
    function resendVerify() {
      if (!state.token) { open('login'); return; }
      return apiCall('/auth/resend-verify', {}, true).then(function (res) {
        if (res.d && res.d.ok) { setMsg('验证邮件已发送。'); showDevLinks(res.d.devLinks); open('login'); }
      });
    }

    if (formEl) formEl.addEventListener('submit', submit);
    if (closeEl) closeEl.addEventListener('click', close);
    if (modalEl) modalEl.addEventListener('click', function (e) { if (e.target === modalEl) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modalEl && !modalEl.hidden) close(); });
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function () { setMode(t.getAttribute('data-tab')); });
    });
    if (toForgotEl) toForgotEl.addEventListener('click', function (e) { e.preventDefault(); setMode('forgot'); });
    if (toLoginEl) toLoginEl.addEventListener('click', function (e) { e.preventDefault(); setMode('login'); });

    // URL 中的 ?verify= / ?reset= / ?owner 处理（邮件链接与站长入口）
    (function () {
      try {
        var q = new URLSearchParams(location.search);
        var v = q.get('verify'), r = q.get('reset');
        var isOwnerEntry = q.has('owner') || location.hash === '#owner';
        if (v) {
          verifyToken(v).then(function (ok) { open('login'); setMsg(ok ? '邮箱验证成功，请登录。' : '验证链接无效或已过期', !ok); });
          history.replaceState(null, '', location.pathname + location.hash);
        } else if (r) {
          resetToken = r; open('reset'); setMode('reset');
          history.replaceState(null, '', location.pathname + location.hash);
        }
        if (isOwnerEntry) {
          var k = prompt('站长模式：请输入站长密钥');
          if (k) enterOwner(k);
          history.replaceState(null, '', location.pathname);
        }
      } catch (e) {}
    })();

    if (state.token) refresh();
    if (state.ownerKey) checkOwner();

    return {
      state: state,
      token: function () { return state.token; },
      user: function () { return state.user; },
      owner: function () { return state.owner; },
      ownerKey: function () { return state.ownerKey; },
      open: open, close: close, setMode: setMode, on: on, emit: emit, refresh: refresh,
      logout: logout, logoutAll: logoutAll, resendVerify: resendVerify, verifyToken: verifyToken,
      enterOwner: enterOwner, exitOwner: exitOwner, checkOwner: checkOwner,
      setMsg: setMsg, showDevLinks: showDevLinks
    };
  })();
  try { window.BlogAuth = BlogAuth; } catch (e) {}

  // ---- 头部右上角登录控件 ----
  (function () {
    var wrap = document.getElementById('auth-control');
    if (!wrap) return;
    function render() {
      var u = BlogAuth.user();
      var o = BlogAuth.owner();
      wrap.innerHTML = '';
      if (u) {
        var box = document.createElement('div');
        box.className = 'ac-user';
        var av = document.createElement('span');
        av.className = 'ac-avatar'; av.textContent = u.avatar || '🙂';
        var nm = document.createElement('span');
        nm.className = 'ac-name'; nm.textContent = u.name;
        box.appendChild(av); box.appendChild(nm);
        var menu = document.createElement('div');
        menu.className = 'ac-menu';
        if (!u.verified) {
          var bv = document.createElement('button');
          bv.type = 'button'; bv.className = 'ac-item warn'; bv.textContent = '验证邮箱';
          bv.addEventListener('click', function (e) { e.stopPropagation(); BlogAuth.resendVerify(); menu.classList.remove('open'); });
          menu.appendChild(bv);
        }
        var b1 = document.createElement('button');
        b1.type = 'button'; b1.className = 'ac-item'; b1.textContent = '退出登录';
        b1.addEventListener('click', function (e) { e.stopPropagation(); BlogAuth.logout(); menu.classList.remove('open'); });
        var b2 = document.createElement('button');
        b2.type = 'button'; b2.className = 'ac-item'; b2.textContent = '退出所有设备';
        b2.addEventListener('click', function (e) { e.stopPropagation(); BlogAuth.logoutAll(); menu.classList.remove('open'); });
        menu.appendChild(b1); menu.appendChild(b2);
        box.appendChild(menu);
        box.addEventListener('click', function (e) {
          if (e.target.closest('.ac-item')) return;
          menu.classList.toggle('open');
        });
        wrap.appendChild(box);
      } else if (o) {
        var obox = document.createElement('div');
        obox.className = 'ac-user';
        var oav = document.createElement('span');
        oav.className = 'ac-avatar'; oav.textContent = o.avatar || '🌟';
        var onm = document.createElement('span');
        onm.className = 'ac-name'; onm.textContent = o.name + ' · 站长';
        obox.appendChild(oav); obox.appendChild(onm);
        var omenu = document.createElement('div');
        omenu.className = 'ac-menu';
        var ob = document.createElement('button');
        ob.type = 'button'; ob.className = 'ac-item'; ob.textContent = '退出站长模式';
        ob.addEventListener('click', function (e) { e.stopPropagation(); BlogAuth.exitOwner(); });
        omenu.appendChild(ob);
        obox.appendChild(omenu);
        obox.addEventListener('click', function (e) {
          if (e.target.closest('.ac-item')) return;
          omenu.classList.toggle('open');
        });
        wrap.appendChild(obox);
      } else {
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'ac-login';
        btn.setAttribute('aria-label', '登录或注册');
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg><span>登录 / 注册</span>';
        btn.addEventListener('click', function () { BlogAuth.open('login'); });
        wrap.appendChild(btn);
      }
    }
    BlogAuth.on(render);
    render();
    document.addEventListener('click', function (e) {
      var m = wrap.querySelector('.ac-menu.open');
      if (m && !e.target.closest('.ac-user')) m.classList.remove('open');
    });
  })();

  // ---- 文章评论（需登录，显示头像）----
  (function () {
    var section = document.getElementById('comments');
    if (!section) return;
    var apiMeta = document.querySelector('meta[name="comment-api"]');
    if (!apiMeta || !apiMeta.content) return;
    var api = apiMeta.content;
    var path = section.getAttribute('data-path');
    if (!path) return;

    var listEl = document.getElementById('c-list');
    var form = document.getElementById('comment-form');
    var contentEl = document.getElementById('c-content');
    var submitEl = document.getElementById('c-submit');
    var msgEl = document.getElementById('c-msg');
    var countEl = document.getElementById('c-count');
    var replyWrap = document.getElementById('c-reply');
    var replyNameEl = document.getElementById('c-reply-name');
    var replyCancel = document.getElementById('c-reply-cancel');
    var replyTo = null;

    var authOut = document.getElementById('c-auth-out');
    var authIn = document.getElementById('c-auth-in');
    var authAvatar = document.getElementById('c-auth-avatar');
    var authDisplay = document.getElementById('c-auth-display');
    var authOpenBtn = document.getElementById('c-auth-open');
    var logoutBtn = document.getElementById('c-logout');
    var verifyBar = document.getElementById('c-verify-bar');
    var verifyBtn = document.getElementById('c-verify-resend');
    var formAvatar = document.getElementById('c-form-avatar');
    var moreBtn = document.getElementById('c-more');

    var PAGE_SIZE = 5;          // 默认展示条数，超出折叠
    var allComments = [];       // 当前文章全部评论（服务端顺序）
    var expanded = false;       // 是否已展开

    function timeAgo(ts) {
      var s = Math.floor((Date.now() - ts) / 1000);
      if (s < 60) return '刚刚';
      if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
      if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
      if (s < 2592000) return Math.floor(s / 86400) + ' 天前';
      var d = new Date(ts);
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }
    function setMsg(t, isErr) {
      if (!msgEl) return;
      msgEl.textContent = t || '';
      msgEl.className = 'cf-msg' + (isErr ? ' err' : '');
    }
    function setCount(n) { if (countEl) countEl.textContent = n; }

    /* 把平铺评论组装成树：根评论（无 replyTo 或父级已删除）在下挂回复 */
    function buildTree(comments) {
      var map = {};
      comments.forEach(function (c) { map[c.id] = { c: c, kids: [] }; });
      var roots = [];
      comments.forEach(function (c) {
        var node = map[c.id];
        if (c.replyTo && map[c.replyTo]) map[c.replyTo].kids.push(node);
        else roots.push(node); // 父级被删的回复升级为根评论
      });
      return roots;
    }

    /* depth: 0=根评论（卡片），>=1=回复（紧凑无卡片，随嵌套缩进） */
    function renderComment(c, all, depth) {
      var li = document.createElement('li');
      li.className = 'comment-item' + (depth > 0 ? ' is-reply' : '');
      li.setAttribute('data-id', c.id);
      li._c = c;

      var head = document.createElement('div');
      head.className = 'c-head';
      var av = document.createElement('span');
      av.className = 'c-avatar';
      av.textContent = c.avatar || (c.name || '?').slice(0, 1).toUpperCase();
      var metaWrap = document.createElement('div');
      metaWrap.className = 'c-meta';
      var nm = document.createElement('span');
      nm.className = 'c-name';
      nm.textContent = c.name;
      var tm = document.createElement('span');
      tm.className = 'c-time';
      tm.textContent = timeAgo(c.createdAt);
      metaWrap.appendChild(nm);
      metaWrap.appendChild(tm);

      if (c.replyTo && all) {
        var parent = all[c.replyTo];
        if (parent) {
          var rep = document.createElement('span');
          rep.className = 'c-reply-ref';
          rep.textContent = '回复 @' + parent.name;
          metaWrap.appendChild(rep); // 与昵称同行，省一行
        }
      }
      head.appendChild(av);
      head.appendChild(metaWrap);

      /* 操作行：回复 + 删除（站长可删任意，普通用户仅能删自己的），与头部同行右侧 */
      var actWrap = document.createElement('div');
      actWrap.className = 'c-actions';
      var act = document.createElement('button');
      act.type = 'button';
      act.className = 'c-reply-btn';
      act.textContent = '回复';
      act.addEventListener('click', function () {
        replyTo = c.id;
        if (replyNameEl) replyNameEl.textContent = c.name;
        if (replyWrap) replyWrap.hidden = false;
        if (contentEl) contentEl.focus();
      });
      actWrap.appendChild(act);

      var me = BlogAuth.user();
      var own = BlogAuth.owner();
      var canDelete = !!own || (!!me && !!c.uid && c.uid === me.uid);
      if (canDelete) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'c-del-btn';
        del.textContent = '删除';
        del.setAttribute('data-del', c.id);
        actWrap.appendChild(del);
      }
      head.appendChild(actWrap);

      var body = document.createElement('div');
      body.className = 'c-body';
      body.textContent = c.content; // textContent：杜绝 XSS

      li.appendChild(head);
      li.appendChild(body);
      return li;
    }

    /* 递归渲染一棵树：先评论本体，再把回复列表挂进这条评论内部 */
    function renderNode(node, parentEl, all) {
      var li = renderComment(node.c, all, parentEl._depth || 0);
      parentEl.appendChild(li);
      if (node.kids.length) {
        var ul = document.createElement('ul');
        ul.className = 'c-kids';
        ul._depth = (parentEl._depth || 0) + 1;
        node.kids.forEach(function (k) { renderNode(k, ul, all); });
        li.appendChild(ul);
      }
    }

    function isAuthed() { return !!(BlogAuth.user() || BlogAuth.owner()); }

    function renderList(comments) {
      if (!listEl) return;
      allComments = comments || [];
      var authed = isAuthed();
      if (!authed) expanded = false; // 未登录一律折叠，退出登录时也要收回
      listEl.innerHTML = '';
      if (!allComments.length) {
        var emptyLi = document.createElement('li');
        emptyLi.className = 'c-empty';
        emptyLi.textContent = '还没有评论，来抢沙发吧～';
        listEl.appendChild(emptyLi);
        setCount(0);
        if (moreBtn) moreBtn.hidden = true;
        return;
      }
      var map = {};
      allComments.forEach(function (c) { map[c.id] = c; });
      var roots = buildTree(allComments);
      listEl._depth = 0;
      var shownRoots = expanded ? roots : roots.slice(0, PAGE_SIZE); // 折叠只折叠根评论，回复始终跟随父级
      shownRoots.forEach(function (node) {
        renderNode(node, listEl, map);
      });
      setCount(allComments.length);
      if (moreBtn) {
        if (roots.length > PAGE_SIZE) {
          moreBtn.hidden = false;
          moreBtn.textContent = !authed
            ? ('登录后查看全部评论（' + allComments.length + '）')
            : (expanded ? '收起评论' : ('查看更多评论（' + allComments.length + '）'));
        } else {
          moreBtn.hidden = true;
        }
      }
    }

    function load() {
      expanded = false;
      fetch(api + '?path=' + encodeURIComponent(path))
        .then(function (r) { return r.json(); })
        .then(function (d) { renderList((d && d.comments) || []); })
        .catch(function () { renderList([]); });
    }

    function cancelReply() {
      replyTo = null;
      if (replyWrap) replyWrap.hidden = true;
    }
    if (replyCancel) replyCancel.addEventListener('click', cancelReply);

    /* 折叠 / 展开：未登录点击时引导登录，已登录正常切换 */
    if (moreBtn) moreBtn.addEventListener('click', function () {
      if (!isAuthed()) {
        pendingExpand = true; // 登录成功后自动展开
        BlogAuth.open('login');
        setMsg('登录后即可查看全部评论', true);
        moreBtn.textContent = '请先登录后再查看全部评论';
        setTimeout(function () {
          if (!isAuthed() && allComments.length > PAGE_SIZE) {
            moreBtn.textContent = '登录后查看全部评论（' + allComments.length + '）';
          }
        }, 2000);
        return;
      }
      expanded = !expanded;
      renderList(allComments);
    });

    /* 删除评论（事件委托） */
    if (listEl) listEl.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.c-del-btn') : null;
      if (!btn) return;
      var li = btn.closest ? btn.closest('.comment-item') : null;
      var c = li && li._c;
      if (!c) return;
      if (!window.confirm('确定删除这条评论吗？删除后不可恢复。')) return;

      var me = BlogAuth.user();
      var own = BlogAuth.owner();
      var headers = {};
      if (me) headers['Authorization'] = 'Bearer ' + BlogAuth.token();
      else if (own) headers['X-Owner-Key'] = BlogAuth.ownerKey();
      else { BlogAuth.open('login'); return; }

      btn.disabled = true;
      fetch(api + '?id=' + encodeURIComponent(c.id), { method: 'DELETE', headers: headers })
        .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
        .then(function (res) {
          if (res.s === 401) {
            if (me) BlogAuth.logout();
            else BlogAuth.exitOwner();
            setMsg('登录已失效，请重新登录', true);
            return;
          }
          if (res.s === 403) { setMsg('只能删除自己的评论', true); return; }
          if (res.s === 404) { setMsg('评论不存在或已删除', true); return; }
          if (!res.d || res.d.ok !== true) throw new Error((res.d && res.d.error) || '删除失败');
          allComments = allComments.filter(function (x) { return x.id !== c.id; });
          if (replyTo === c.id) cancelReply();
          renderList(allComments);
          setMsg('评论已删除', false);
        })
        .catch(function (err) { setMsg((err && err.message) || '网络错误，请稍后重试', true); })
        .then(function () { btn.disabled = false; });
    });

    function applyAuthUI(st) {
      var u = st && st.user;
      var o = st && st.owner;
      if (u) {
        if (authOut) authOut.hidden = true;
        if (authIn) {
          authIn.hidden = false;
          if (authDisplay) authDisplay.textContent = u.name;
          if (authAvatar) authAvatar.textContent = u.avatar || '🙂';
        }
        if (formAvatar) { formAvatar.textContent = u.avatar || '🙂'; formAvatar.hidden = false; }
        if (contentEl) { contentEl.readOnly = false; contentEl.classList.remove('is-locked'); }
        if (submitEl) { submitEl.disabled = false; submitEl.textContent = '发表评论'; }
        if (verifyBar) verifyBar.hidden = !!u.verified;
        if (!u.verified) setMsg('请先验证邮箱后再评论', true);
      } else if (o) {
        if (authOut) authOut.hidden = true;
        if (authIn) {
          authIn.hidden = false;
          if (authDisplay) authDisplay.textContent = o.name + '（站长模式）';
          if (authAvatar) authAvatar.textContent = o.avatar || '🌟';
        }
        if (formAvatar) { formAvatar.textContent = o.avatar || '🌟'; formAvatar.hidden = false; }
        if (contentEl) { contentEl.readOnly = false; contentEl.classList.remove('is-locked'); }
        if (submitEl) { submitEl.disabled = false; submitEl.textContent = '发表评论'; }
        if (verifyBar) verifyBar.hidden = true;
      } else {
        if (authIn) authIn.hidden = true;
        if (authOut) authOut.hidden = false;
        if (formAvatar) formAvatar.hidden = true;
        /* 未登录：输入框只读不置灰，按钮保持实心可点，点击即唤起登录 */
        if (contentEl) { contentEl.readOnly = true; contentEl.classList.add('is-locked'); }
        if (submitEl) { submitEl.disabled = false; submitEl.textContent = '登录后评论'; }
        if (verifyBar) verifyBar.hidden = true;
      }
    }
    /* 仅在「点更多被引导去登录、随后登录成功」时自动展开；退出登录时自动收起 */
    var wasAuthed = isAuthed();
    var pendingExpand = false;
    BlogAuth.on(function (st) {
      var nowAuthed = isAuthed();
      if (nowAuthed && !wasAuthed && pendingExpand && allComments.length > PAGE_SIZE) expanded = true;
      pendingExpand = false;
      wasAuthed = nowAuthed;
      applyAuthUI(st);
      renderList(allComments);
    });
    applyAuthUI(BlogAuth.state);

    /* 未登录时点击输入框 → 直接弹登录 */
    function lockHint() {
      if (!BlogAuth.user() && !BlogAuth.owner()) BlogAuth.open('login');
    }
    if (contentEl) {
      contentEl.addEventListener('focus', lockHint);
      contentEl.addEventListener('click', lockHint);
    }

    if (authOpenBtn) authOpenBtn.addEventListener('click', function () { BlogAuth.open('login'); });
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      if (!BlogAuth.user() && BlogAuth.owner()) BlogAuth.exitOwner();
      else BlogAuth.logout();
      setMsg('');
    });
    if (verifyBtn) verifyBtn.addEventListener('click', function () { BlogAuth.resendVerify(); });

    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var u = BlogAuth.user();
      var o = BlogAuth.owner();
      if (!u && !o) { BlogAuth.open('login'); return; }
      if (u && !u.verified) { setMsg('请先验证邮箱后再评论', true); return; }
      var content = (contentEl && contentEl.value || '').trim();
      if (!content) { setMsg('评论内容不能为空', true); if (contentEl) contentEl.focus(); return; }
      setMsg('发送中…', false);
      if (submitEl) submitEl.disabled = true;
      var headers = { 'Content-Type': 'application/json' };
      if (u) headers['Authorization'] = 'Bearer ' + BlogAuth.token();
      else headers['X-Owner-Key'] = BlogAuth.ownerKey();
      fetch(api, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ path: path, content: content, replyTo: replyTo || '' })
      })
        .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
        .then(function (res) {
          var d = res.d;
          if (res.s === 401) {
            if (u) { BlogAuth.logout(); BlogAuth.open('login'); }
            else BlogAuth.exitOwner();
            setMsg('登录已失效，请重新登录', true);
            return;
          }
          if (res.s === 403) { setMsg((d && d.error) || '请先验证邮箱', true); if (verifyBar) verifyBar.hidden = false; return; }
          if (!d || d.ok !== true) throw new Error((d && d.error) || '提交失败');
          if (d.comment) {
            expanded = true; // 新评论追加在末尾，自动展开确保作者能看到
            allComments.push(d.comment);
            renderList(allComments);
          }
          if (contentEl) contentEl.value = '';
          cancelReply();
          setMsg('评论已发布，感谢参与！', false);
        })
        .catch(function (err) {
          setMsg((err && err.message) || '网络错误，请稍后重试', true);
        })
        .then(function () {
          var u2 = BlogAuth.user();
          var o2 = BlogAuth.owner();
          if (submitEl) {
            submitEl.disabled = false;
            submitEl.textContent = (u2 || o2) ? '发表评论' : '登录后评论';
          }
        });
    });

    load();
  })();
})();
