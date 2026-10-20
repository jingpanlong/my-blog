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
     5. 知识地图：轨道自转 + 拖拽 + 卫星绕行
     --------------------------------------------- */
  (function orbit() {
    var box = document.querySelector('.orbit');
    if (!box) return;
    var rings = box.querySelector('.orbit-rings');
    if (!rings) return;

    var disc = 0, vel = 0, dragging = false, lastX = 0, lastT = 0;
    var W = 0, H = 0, cx = 0, cy = 0;

    function measure() {
      W = box.clientWidth; H = box.clientHeight;
      cx = W / 2; cy = H / 2;
    }
    measure();
    window.addEventListener('resize', measure);

    // 三颗卫星，分别锁在三条轨道（72%×176 / 46%×104 / 94%×240）上绕行
    var TAU = Math.PI * 2;
    var sats = [
      { rx: 0.36, ry: 88,  dur: 24, ph: 0.8, cls: 'sat-1', el: null },
      { rx: 0.23, ry: 52,  dur: 15, ph: 3.9, cls: 'sat-2', el: null },
      { rx: 0.47, ry: 120, dur: 34, ph: 5.3, cls: 'sat-3', el: null }
    ];
    sats.forEach(function (s) {
      var el = document.createElement('div');
      el.className = 'orbit-sat ' + s.cls;
      el.innerHTML = '<i class="tail"></i><i class="head"></i>';
      box.appendChild(el);
      s.el = el;
    });

    function placeSat(s, ts) {
      var t = (ts / 1000) * (TAU / s.dur) + s.ph;
      var rxw = W * s.rx;
      var x = cx + Math.cos(t) * rxw;
      var y = cy + Math.sin(t) * s.ry;
      // 切线方向（决定彗尾朝向）
      var vx = -Math.sin(t) * rxw;
      var vy = Math.cos(t) * s.ry;
      var ang = Math.atan2(vy, vx) * 180 / Math.PI;
      // 下半圈在星球前面，上半圈绕到星球后面
      var front = Math.sin(t) > 0;
      s.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) rotate(' + ang.toFixed(1) + 'deg) scale(' + (front ? 1 : 0.72) + ')';
      s.el.style.zIndex = front ? 3 : 1;
      s.el.style.opacity = front ? 1 : 0.55;
    }

    function frame(ts) {
      if (!dragging) {
        disc += 0.11 + vel;      // 自转 + 惯性
        vel *= 0.93;             // 惯性衰减
      }
      rings.style.setProperty('--disc', disc.toFixed(2) + 'deg');
      for (var i = 0; i < sats.length; i++) placeSat(sats[i], ts);
      requestAnimationFrame(frame);
    }
    if (reduceMotion) {
      // 静音模式：只摆好卫星，不跑动画
      for (var j = 0; j < sats.length; j++) placeSat(sats[j], 0);
    } else {
      requestAnimationFrame(frame);
    }

    box.addEventListener('pointerdown', function (e) {
      if (e.target.closest('a, button')) return;
      dragging = true;
      lastX = e.clientX; lastT = performance.now();
      vel = 0;
      box.classList.add('is-dragging');
      try { box.setPointerCapture(e.pointerId); } catch (err) {}
    });
    box.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var now = performance.now();
      var dx = e.clientX - lastX;
      var dt = Math.max(now - lastT, 16);
      disc += dx * 0.55;
      vel = clamp((dx * 0.55) / dt * 16 * 0.55, -7, 7);
      lastX = e.clientX; lastT = now;
    });
    function endOrbitDrag(e) {
      if (!dragging) return;
      dragging = false;
      box.classList.remove('is-dragging');
      try { box.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    box.addEventListener('pointerup', endOrbitDrag);
    box.addEventListener('pointercancel', endOrbitDrag);
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
