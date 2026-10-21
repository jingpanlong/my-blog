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
      postGiscus(cur);
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

  // ---- Giscus 主题同步 ----
  function postGiscus(theme) {
    var f = document.querySelector('iframe.giscus-frame');
    if (f && f.contentWindow) {
      f.contentWindow.postMessage({ giscus: { setConfig: { theme: theme } } }, 'https://giscus.app');
    }
  }
  // 初始若处于浅色，等 Giscus 加载后告知
  if (root.getAttribute('data-theme') === 'light') {
    var tries = 0;
    var t = setInterval(function () {
      var f = document.querySelector('iframe.giscus-frame');
      if (f) { postGiscus('light'); clearInterval(t); }
      if (++tries > 20) clearInterval(t);
    }, 500);
  }

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

      // 收藏
      var favBtn = document.getElementById('fav-btn');
      function renderFavBtn() {
        var on = getFavs().some(function (f) { return f.path === path; });
        if (favBtn) { favBtn.classList.toggle('on', on); favBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      }
      renderFavBtn();
      if (favBtn) favBtn.addEventListener('click', function () {
        var favs = getFavs();
        var i = -1;
        for (var k = 0; k < favs.length; k++) { if (favs[k].path === path) { i = k; break; } }
        if (i !== -1) favs.splice(i, 1); else favs.unshift({ path: path, title: title, url: url });
        setFavs(favs); renderFavBtn(); updateFavBadge();
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
})();
