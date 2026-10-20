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
     3. Hero：Canvas 星空（多层视差 + 闪烁 + 流星）+ 指针/拖拽视差
     --------------------------------------------- */
  (function heroSky() {
    var hero = document.querySelector('.hero-band');
    if (!hero) return;
    var bg = hero.querySelector('.hero-bg');
    var script = hero.querySelector('.hero-script');
    var quote = hero.querySelector('.hero-quote');
    var sky = document.querySelector('.hero-sky');
    if (!bg || !sky) return;

    /* ---- 指针状态：目标值 tx/ty，平滑值 cx/cy ---- */
    var tx = 0, ty = 0, cx = 0, cy = 0;
    var dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0;

    function applyLayers() {
      bg.style.transform = 'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
      if (script) script.style.transform = 'translate3d(' + (cx * 2.1).toFixed(2) + 'px,' + (cy * 1.6).toFixed(2) + 'px,0) rotate(-7deg)';
      if (quote) quote.style.transform = 'translate3d(' + (cx * -0.7).toFixed(2) + 'px,' + (cy * -0.5).toFixed(2) + 'px,0)';
      hero.style.setProperty('--px', cx.toFixed(2));
      hero.style.setProperty('--py', cy.toFixed(2));
    }

    /* ---- 星空引擎 ---- */
    var ctx = null, stars = [], meteors = [], W = 0, H = 0, dpr = 1;
    var nextMeteorAt = 2000, t0 = 0, lastTs = 0, running = false, inView = true;
    var lastLight = null;
    function isLight() { return document.documentElement.getAttribute('data-theme') === 'light'; }

    function seed() {
      stars = [];
      var light = isLight();
      /* 浅色主题：少量暖色浮尘（阳光尘埃感）；深色主题：密集星点 */
      var n = light ? clamp(Math.round(W * H / 16000), 30, 90)
                    : clamp(Math.round(W * H / 9000), 70, 280);
      for (var i = 0; i < n; i++) {
        var depth = Math.random();
        stars.push({
          x: Math.random() * W,
          y: Math.random() * (light ? H * 0.9 : H * 0.72),
          r: light ? 0.6 + depth * 1.1 : 0.4 + depth * 1.6,
          depth: depth,
          tw: light ? 0.25 + Math.random() * 0.5 : 0.6 + Math.random() * 1.8,
          ph: Math.random() * Math.PI * 2,
          a: light ? 0.08 + depth * 0.2 : 0.22 + depth * 0.6
        });
      }
      lastLight = light;
    }
    function resize() {
      var r = hero.getBoundingClientRect();
      W = r.width; H = r.height;
      if (!W || !H) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      sky.width = Math.round(W * dpr);
      sky.height = Math.round(H * dpr);
      ctx = sky.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      if (reduceMotion) drawSky(0);
    }
    function drawSky(t) {
      if (!ctx) return;
      var light = isLight();
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var par = 5 + s.depth * 24;                                   // 视差幅度：远小近大
        var dx = clamp(cx * par * 0.4, -70, 70);
        var dy = clamp(cy * par * 0.22, -40, 40);
        var drift = reduceMotion ? 0 : Math.sin(t * 0.00005 + s.ph) * 3.2 * s.depth;
        var tw = reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 0.001 * s.tw + s.ph);
        var x = s.x + dx + drift, y = s.y + dy;
        ctx.globalAlpha = clamp(s.a * tw, 0.02, light ? 0.34 : 1);
        ctx.fillStyle = light ? (s.depth > 0.7 ? '#f0b47a' : '#e8c9a0')
                              : (s.depth > 0.85 ? '#e2eaff' : '#ffffff');
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.2832); ctx.fill();
        if (!light && s.depth > 0.9) {                                // 亮星柔光（仅深色）
          ctx.globalAlpha = clamp(s.a * tw * 0.22, 0, 0.3);
          ctx.beginPath(); ctx.arc(x, y, s.r * 3.6, 0, 6.2832); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    function spawnMeteor() {
      if (meteors.length >= 2) return;
      var dir = Math.random() < 0.5 ? 1 : -1;
      meteors.push({
        x: dir > 0 ? -50 : W * (0.3 + Math.random() * 0.65),
        y: -20 + Math.random() * H * 0.32,
        vx: dir * (430 + Math.random() * 360),
        vy: 250 + Math.random() * 300,
        len: 90 + Math.random() * 120,
        life: 0,
        ttl: 0.9 + Math.random() * 0.55,
        w: 1.1 + Math.random() * 0.9
      });
    }
    function drawMeteors(dt, t) {
      if (isLight()) return;                                          // 白昼没有流星
      if (!reduceMotion && t > nextMeteorAt) {
        spawnMeteor();
        nextMeteorAt = t + 2800 + Math.random() * 5400;
      }
      for (var i = meteors.length - 1; i >= 0; i--) {
        var m = meteors[i];
        m.life += dt;
        if (m.life >= m.ttl) { meteors.splice(i, 1); continue; }
        var p = m.life / m.ttl;
        var hx = m.x + m.vx * m.life, hy = m.y + m.vy * m.life;
        var sp = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
        var k = m.len / sp;
        var tailX = hx - m.vx * k, tailY = hy - m.vy * k;
        var fade = Math.min(p * 4, 1) * (1 - p * 0.45);
        var g = ctx.createLinearGradient(hx, hy, tailX, tailY);
        g.addColorStop(0, 'rgba(255,255,255,' + (0.85 * fade).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(160,190,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = m.w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tailX, tailY); ctx.stroke();
      }
    }

    function frame(ts) {
      if (!t0) t0 = ts;
      var dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
      lastTs = ts;
      cx = lerp(cx, tx, 0.1);
      cy = lerp(cy, ty, 0.1);
      applyLayers();
      if (isLight() !== lastLight) { seed(); meteors = []; }   // 主题切换：即时重播种
      drawSky(ts - t0);
      drawMeteors(dt / 1000, ts - t0);
      if (inView && !document.hidden) {
        requestAnimationFrame(frame);
      } else {
        running = false; lastTs = 0;
      }
    }
    function kick() {
      if (!running) { running = true; lastTs = 0; requestAnimationFrame(frame); }
    }

    /* 视口外 / 切后台自动暂停，省 CPU */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) kick();
      }, { threshold: 0 }).observe(hero);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });

    /* 主题切换：重启动画循环（静态模式则立即重绘） */
    if ('MutationObserver' in window) {
      new MutationObserver(function () {
        if (reduceMotion) resize(); else kick();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    if (window.ResizeObserver) {
      new ResizeObserver(function () { resize(); }).observe(hero);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    if (reduceMotion) return;   // 静态星空已绘制，不跑动画循环

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

    kick();
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
