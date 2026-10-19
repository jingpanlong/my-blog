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
})();
