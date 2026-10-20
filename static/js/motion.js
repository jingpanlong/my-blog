/* =========================================================
   动效层：入场 / 视差 / 3D 倾斜 / 轨道自转
   ========================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, n) { return a + (b - a) * n; };

  /* ---------------------------------------------
     1. 滚动渐入
     --------------------------------------------- */
  (function reveal() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    var items = document.querySelectorAll('.dash-main > .panel, .dash-side > .scard');
    if (!items.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -50px 0px' });
    Array.prototype.forEach.call(items, function (el, i) {
      el.classList.add('reveal');
      el.style.transitionDelay = Math.min(i * 70, 280) + 'ms';
      io.observe(el);
    });
  })();

  /* ---------------------------------------------
     2. Hero 数字滚动
     --------------------------------------------- */
  (function countUp() {
    var nums = document.querySelectorAll('.hero-stats .stat b');
    if (!nums.length) return;
    Array.prototype.forEach.call(nums, function (el) {
      if (el.children.length) return;               // 跳过含 <i> 的（如「1 年」）
      var raw = el.textContent.trim();
      var target = parseInt(raw, 10);
      if (!isFinite(target) || target === 0) return;
      if (reduceMotion || !('IntersectionObserver' in window)) return;
      var done = false;
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting || done) return;
        done = true; io.disconnect();
        var t0 = 0, dur = 900;
        function step(ts) {
          if (!t0) t0 = ts;
          var p = clamp((ts - t0) / dur, 0, 1);
          var e = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * e) + (p >= 1 && /\+$/.test(raw) ? '+' : '');
          if (p < 1) requestAnimationFrame(step);
        }
        el.textContent = '0';
        requestAnimationFrame(step);
      }, { threshold: 0.6 });
      io.observe(el);
    });
  })();

  /* ---------------------------------------------
     3. Hero 鼠标视差 + 拖拽平移
     --------------------------------------------- */
  (function heroParallax() {
    var hero = document.querySelector('.hero-band');
    if (!hero) return;
    var bg = hero.querySelector('.hero-bg');
    var script = hero.querySelector('.hero-script');
    var quote = hero.querySelector('.hero-quote');
    if (!bg) return;

    var tx = 0, ty = 0, cx = 0, cy = 0;
    var dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0;
    var running = false;

    function render() {
      cx = lerp(cx, tx, 0.12);
      cy = lerp(cy, ty, 0.12);
      bg.style.transform = 'scale(1.07) translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
      if (script) script.style.transform = 'translate3d(' + (cx * 2.1).toFixed(2) + 'px,' + (cy * 1.6).toFixed(2) + 'px,0) rotate(-7deg)';
      if (quote) quote.style.transform = 'translate3d(' + (cx * -0.7).toFixed(2) + 'px,' + (cy * -0.5).toFixed(2) + 'px,0)';
      if (Math.abs(cx - tx) > 0.1 || Math.abs(cy - ty) > 0.1 || dragging) {
        requestAnimationFrame(render);
      } else {
        running = false;
      }
    }
    function kick() { if (!running) { running = true; requestAnimationFrame(render); } }

    if (reduceMotion) return;

    hero.addEventListener('pointermove', function (e) {
      if (dragging) {
        tx = clamp(baseX + (e.clientX - startX) * 0.55, -46, 46);
        ty = clamp(baseY + (e.clientY - startY) * 0.35, -26, 26);
      } else if (canHover) {
        var r = hero.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * 16;
        ty = ((e.clientY - r.top) / r.height - 0.5) * 11;
      } else {
        return;
      }
      kick();
    }, { passive: true });

    hero.addEventListener('pointerdown', function (e) {
      if (e.target.closest('a, button, input, .hero-quote')) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      baseX = tx; baseY = ty;
      hero.classList.add('is-grabbing');
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      hero.classList.remove('is-grabbing');
      tx = 0; ty = 0; kick();          // 松手回弹
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  })();

  /* ---------------------------------------------
     4. 卡片 3D 倾斜 + 光标高光
     --------------------------------------------- */
  (function tilt() {
    if (reduceMotion || !canHover) return;
    var cards = document.querySelectorAll('.acard, .pcard, .post-card');
    Array.prototype.forEach.call(cards, function (el) {
      var raf = 0, nx = 0, ny = 0;
      function apply() {
        raf = 0;
        el.style.transform = 'perspective(900px) rotateX(' + (ny * -5.5).toFixed(2) + 'deg) rotateY(' + (nx * 7).toFixed(2) + 'deg) translateY(-4px)';
      }
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        nx = (e.clientX - r.left) / r.width - 0.5;
        ny = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
        if (!raf) raf = requestAnimationFrame(apply);
      }, { passive: true });
      el.addEventListener('pointerleave', function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        el.style.transform = '';
        el.style.removeProperty('--mx');
        el.style.removeProperty('--my');
      });
    });
  })();

  /* ---------------------------------------------
     5. 知识地图：星座视差 + 悬停聚焦
     --------------------------------------------- */
  (function knowledgeMap() {
    var stage = document.querySelector('[data-km]');
    if (!stage) return;
    var nodes = Array.prototype.slice.call(stage.querySelectorAll('.km-node'));
    var links = Array.prototype.slice.call(stage.querySelectorAll('.km-link'));
    if (!nodes.length) return;

    // 悬停聚焦：高亮当前节点与其连线，其余变暗
    nodes.forEach(function (n, i) {
      n.addEventListener('pointerenter', function () {
        stage.classList.add('has-hot');
        n.classList.add('is-hot');
        if (links[i]) links[i].classList.add('is-hot');
      });
      n.addEventListener('pointerleave', function () {
        stage.classList.remove('has-hot');
        n.classList.remove('is-hot');
        if (links[i]) links[i].classList.remove('is-hot');
      });
    });

    if (reduceMotion) return;

    var curX = 0, curY = 0;       // 平滑后的视差
    var aimX = 0, aimY = 0;       // 指针目标
    var dAimX = 0, dAimY = 0;     // 拖拽附加目标
    var dCurX = 0, dCurY = 0;     // 拖拽平滑值
    var lastMove = 0;
    var dragging = false, sx = 0, sy = 0;

    function pointer(e) {
      var r = stage.getBoundingClientRect();
      aimX = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
      aimY = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
      lastMove = performance.now();
      if (dragging) {
        dAimX = clamp((e.clientX - sx) / r.width, -0.8, 0.8);
        dAimY = clamp((e.clientY - sy) / r.height, -0.8, 0.8);
      }
    }

    stage.addEventListener('pointermove', pointer);
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.km-node')) return;
      dragging = true; sx = e.clientX; sy = e.clientY;
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false; dAimX = 0; dAimY = 0;
      try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('pointerleave', function () {
      if (dragging) return;
      aimX = 0; aimY = 0; lastMove = 0;
    });

    function tick(t) {
      var idle = !dragging && (lastMove === 0 || t - lastMove > 2600);
      if (idle) {
        // 无指针时缓慢漂移，保持生命感
        aimX = Math.sin(t / 5200) * 0.3;
        aimY = Math.cos(t / 6400) * 0.24;
      }
      curX = lerp(curX, aimX + dCurX, 0.07);
      curY = lerp(curY, aimY + dCurY, 0.07);
      dCurX = lerp(dCurX, dAimX, dragging ? 0.35 : 0.08);
      dCurY = lerp(dCurY, dAimY, dragging ? 0.35 : 0.08);
      stage.style.setProperty('--px', curX.toFixed(3));
      stage.style.setProperty('--py', curY.toFixed(3));
      for (var i = 0; i < nodes.length; i++) {
        var d = 11 + (i % 3) * 4;   // 不同深度，形成层次视差
        nodes[i].style.setProperty('--tx', (curX * d).toFixed(1) + 'px');
        nodes[i].style.setProperty('--ty', (curY * d).toFixed(1) + 'px');
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  /* ---------------------------------------------
     6. 页头滚动态
     --------------------------------------------- */
  (function header() {
    var h = document.querySelector('.site-header');
    if (!h) return;
    var on = false;
    function check() {
      var next = window.scrollY > 24;
      if (next !== on) { on = next; h.classList.toggle('scrolled', on); }
    }
    check();
    window.addEventListener('scroll', check, { passive: true });
  })();
})();
