/* Story case pages: the labs (tools/build_cases.py renders their markup, css/case.css styles
   them). Each lab starts when it comes near the screen, works with mouse, touch and keyboard,
   and without motion where the visitor asked for less. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function whenNear(el, fn, margin = '600px 0px') {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver((en) => {
      if (en.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { rootMargin: margin });
    io.observe(el);
  }
  function onceSeen(el, fn, threshold = 0.45) {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((en) => {
      if (en.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { threshold });
    io.observe(el);
  }

  /* ------------------------------------------------------------ Mix a Ballie
     Every Ballie is drawn on one rig, so the picture splits into reels (head, kit, shorts)
     that line up with any other Ballie. Each reel is a strip of all the cast, three times
     over, cut to its slice; a spin rolls the strip two rounds on and lands on a new one
     (it moves by transform only). Click a part to step it, lock what you want to keep. */
  function mixer(el) {
    const N = +el.dataset.n;
    const traits = JSON.parse(el.dataset.traits);
    const fig = $('.mx__fig', el);
    const small = () => fig.getBoundingClientRect().height * (devicePixelRatio || 1) < 760;
    const base = el.dataset.base + (small() ? 's/' : '');
    const url = (k) => `${base}${String(k + 1).padStart(2, '0')}.webp`;
    const REP = 3;
    const start = +el.dataset.start || 0;
    const rows = $$('.mx__row', el);
    const idEl = $('[data-id]', el), idK = $('[data-id-k]', el), idBox = $('.mx__id', el);

    const reels = $$('.mx__reel', el).map((r, i) => ({
      el: r, i, strip: $('.mx__strip', r), cur: start, locked: false, busy: null,
      row: rows[i], v: $('[data-v]', rows[i]), from: $('[data-from]', rows[i]), lock: $('[data-lock]', rows[i]),
    }));
    // preload once, then every reel shares the decoded pictures
    const ready = Promise.all(Array.from({ length: N }, (_, k) => {
      const im = new Image();
      im.src = url(k);
      return im.decode().catch(() => {});
    }));
    reels.forEach((s) => {
      const frag = document.createDocumentFragment();
      for (let rep = 0; rep < REP; rep++) {
        for (let k = 0; k < N; k++) {
          const c = document.createElement('span');
          c.className = 'mx__cell';
          const im = document.createElement('img');
          im.src = url(k); im.alt = ''; im.decoding = 'async'; im.draggable = false;
          c.appendChild(im);
          frag.appendChild(c);
        }
      }
      s.strip.appendChild(frag);
      s.strip.style.setProperty('--n', N * REP);
      set(s, N + s.cur);
    });

    function set(s, idx) { s.strip.style.transform = `translateY(${(-idx / (N * REP)) * 100}%)`; }
    function show() {
      reels.forEach((s) => {
        s.v.textContent = traits[s.cur][s.i];
        s.from.textContent = '#' + String(s.cur + 1).padStart(2, '0');
      });
      const same = reels.every((s) => s.cur === reels[0].cur);
      idBox.classList.toggle('is-orig', same);
      if (same) {
        idK.textContent = 'Original';
        idEl.textContent = '#' + String(reels[0].cur + 1).padStart(2, '0');
      } else {
        const n = reels.reduce((a, s) => a * N + s.cur, 0) + 1;
        idK.textContent = 'Mix';
        idEl.textContent = '#' + n.toLocaleString('en-US');
      }
    }
    function roll(s, to, rounds, dur, delay = 0) {
      // from the first copy to the third: the strip rolls `rounds` times, never past its end
      if (s.busy) s.busy.cancel();
      const from = s.cur;
      const a = rounds === 0 ? N + from : from;
      const b = rounds === 0 ? N + to + (to < from ? N : 0) : rounds * N + to;
      s.row.classList.add('is-hot');
      if (reduce) {
        s.cur = to; set(s, N + to); s.row.classList.remove('is-hot');
        return Promise.resolve();
      }
      const kf = [{ transform: `translateY(${(-a / (N * REP)) * 100}%)` }, { transform: `translateY(${(-b / (N * REP)) * 100}%)` }];
      const anim = s.strip.animate(kf, { duration: dur, delay, easing: rounds ? 'cubic-bezier(0.18, 0.72, 0.22, 1.04)' : 'cubic-bezier(0.3, 0.7, 0.2, 1.08)', fill: 'both' });
      s.busy = anim;
      s.cur = to;
      return anim.finished.then(() => {
        set(s, N + to);
        anim.cancel();
        s.busy = null;
        s.row.classList.remove('is-hot');
      }, () => {});
    }
    const pick = (not) => { let k; do { k = Math.floor(Math.random() * N); } while (k === not && N > 1); return k; };

    function spin() {
      const free = reels.filter((s) => !s.locked);
      if (!free.length) { reels.forEach((s) => toggleLock(s, false)); return spin(); }
      let tos = free.map((s) => pick(s.cur));
      // a spin that lands on an original (all three the same) is rare; leave it to chance
      Promise.all(free.map((s, j) => roll(s, tos[j], 2, 1100 + j * 260, j * 70))).then(show);
      // the readout follows each reel as it lands
      free.forEach((s, j) => setTimeout(() => { s.v.textContent = traits[tos[j]][s.i]; s.from.textContent = '#' + String(tos[j] + 1).padStart(2, '0'); }, reduce ? 0 : 1100 + j * 330));
    }
    function original() {
      const k = pick(reels[0].cur);
      reels.forEach((s) => toggleLock(s, false));
      Promise.all(reels.map((s, j) => roll(s, k, 1, 800 + j * 200, j * 60))).then(show);
    }
    function step(s, d) {
      if (s.locked) toggleLock(s, false);
      const to = (s.cur + d + N) % N;
      if (d < 0) {
        // stepping back: jump to the same picture one copy down, then roll up one
        if (s.busy) s.busy.cancel();
        set(s, 2 * N + s.cur);
        const a = 2 * N + s.cur, b = 2 * N + s.cur - 1;
        s.row.classList.add('is-hot');
        s.cur = to;
        if (reduce) { set(s, N + to); s.row.classList.remove('is-hot'); show(); return; }
        const anim = s.strip.animate([{ transform: `translateY(${(-a / (N * REP)) * 100}%)` }, { transform: `translateY(${(-b / (N * REP)) * 100}%)` }],
          { duration: 360, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1.08)', fill: 'both' });
        s.busy = anim;
        anim.finished.then(() => { set(s, N + to); anim.cancel(); s.busy = null; s.row.classList.remove('is-hot'); }, () => {});
        show();
        return;
      }
      roll(s, to, 0, 380);
      show();
    }
    function toggleLock(s, on = !s.locked) {
      s.locked = on;
      s.lock.setAttribute('aria-pressed', String(on));
      s.el.classList.toggle('is-locked', on);
    }

    $('[data-spin]', el).addEventListener('click', spin);
    $('[data-orig]', el).addEventListener('click', original);
    reels.forEach((s) => {
      const hit = $('.mx__hit', s.el);
      hit.addEventListener('click', () => step(s, 1));
      hit.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); step(s, -1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); step(s, 1); }
      });
      // a swipe up or down on a part steps it (phones)
      let y0 = null;
      hit.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
      hit.addEventListener('pointerup', (e) => {
        if (y0 === null) return;
        const dy = e.clientY - y0; y0 = null;
        if (Math.abs(dy) > 28) { e.preventDefault(); step(s, dy < 0 ? 1 : -1); s.swiped = true; }
      });
      hit.addEventListener('click', (e) => { if (s.swiped) { s.swiped = false; e.stopImmediatePropagation(); } }, true);
      s.lock.addEventListener('click', () => toggleLock(s));
    });
    // Space spins while the lab is on screen and nothing else has the keyboard
    let onScreen = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }, { threshold: 0.5 }).observe(fig);
    }
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || !onScreen || e.repeat) return;
      const t = e.target;
      if (t && t !== document.body && t.closest('input, textarea, select, [contenteditable], a, button:not([data-spin]):not(.mx__hit)')) return;
      e.preventDefault();
      spin();
    });
    show();
    // first look: one spin by itself, so it is clear the parts move
    if (!reduce) onceSeen(fig, () => ready.then(() => setTimeout(spin, 450)), 0.6);
  }

  /* ----------------------------------------------------------- Drive past it
     A night road in CSS 3D seen from the driving seat. The billboard is the real LED
     animation on a 3D plane that comes from the horizon and passes the camera; lamps and
     lane marks set the speed. A clock counts the time the board is big enough to read,
     then the read: the board flat, with numbered pins in the order it was built to be read,
     and what each part says in English. Everything moves by transform. */
  function driveby(el) {
    const boards = JSON.parse(el.dataset.boards);
    const stage = $('.db__stage', el), world = $('.db__world', el);
    const bb = $('.db__bb', el), face = $('.db__face', el), vid = $('video', face);
    const lamps = $$('.db__lamp', el), lines = $('.db__lines', el);
    const read = $('.db__read', el), rvid = $('video', read), pins = $('.db__pins', read), list = $('.db__list', read);
    const tOut = $('[data-t]', el), kOut = $('[data-kmh-out]', el), had = $('[data-had]', el);
    const PASS = { 50: 5600, 90: 3500, 130: 2500 }; // ms from the horizon to past the camera
    const Z0 = -5200, Z1 = 640, LZ0 = -6000, LZ1 = 700;
    let kmh = 90, cur = 0, anims = [], raf = 0, driving = false, bx = 520;

    function fit() {
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      const s = h / 675, ww = w / s;
      bx = Math.round(Math.min(520, ww * 0.35));
      world.style.setProperty('--s', s.toFixed(4));
      world.style.setProperty('--ww', ww.toFixed(1));
      world.style.setProperty('--bx', bx);
    }
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(stage); else addEventListener('resize', fit);
    fit();

    function load(j) {
      const b = boards[j];
      cur = j;
      vid.poster = b.poster;
      if (vid.dataset.src !== b.mp4) { vid.dataset.src = b.mp4; vid.src = b.mp4; vid.preload = 'auto'; }
      $$('[data-board]', el).forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.board === j)));
    }
    function setSpeed(k) {
      kmh = k;
      kOut.textContent = k;
      $$('[data-kmh]', el).forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.kmh === k)));
    }
    const play = (v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    function stopAll() {
      anims.forEach((a) => a.cancel());
      anims = [];
      cancelAnimationFrame(raf);
      driving = false;
      stage.classList.remove('is-driving');
    }
    function showRead(secs) {
      const b = boards[cur];
      had.textContent = secs.toFixed(1);
      pins.textContent = '';
      list.textContent = '';
      b.pins.forEach(([x, y, orig, en], i) => {
        const p = document.createElement('li');
        p.style.cssText = `--x:${x};--y:${y};--i:${i}`;
        p.textContent = i + 1;
        pins.appendChild(p);
        const li = document.createElement('li');
        li.style.setProperty('--i', i);
        li.innerHTML = `<i>${i + 1}</i><b></b><span></span>`;
        li.querySelector('b').textContent = en;
        li.querySelector('span').textContent = '“' + orig + '”';
        list.appendChild(li);
      });
      rvid.poster = b.poster;
      if (rvid.dataset.src !== b.mp4) { rvid.dataset.src = b.mp4; rvid.src = b.mp4; }
      try { rvid.currentTime = b.at || 0; } catch (e) { /* not loaded yet */ }
      play(rvid);
      read.hidden = false;
      read.classList.remove('is-on');
      requestAnimationFrame(() => requestAnimationFrame(() => read.classList.add('is-on')));
    }
    function hideRead() { read.hidden = true; read.classList.remove('is-on'); rvid.pause(); }

    function drive() {
      if (driving) return;
      stopAll();
      hideRead();
      stage.classList.add('has-driven', 'is-driving');
      driving = true;
      const b = boards[cur];
      try { vid.currentTime = b.at || 0; } catch (e) { /* not loaded yet */ }
      play(vid);
      const T = PASS[kmh];
      if (reduce) { // no flight: straight to the read, with the time a driver would have had
        stopAll();
        showRead(T * 0.55 / 1000);
        return;
      }
      const tr = (z) => `translate3d(${bx}px, 170px, ${z}px)`;
      anims.push(bb.animate([{ transform: tr(Z0) }, { transform: tr(Z1) }], { duration: T, easing: 'linear', fill: 'forwards' }));
      anims.push(bb.animate([{ filter: 'blur(0px)', offset: 0 }, { filter: 'blur(0px)', offset: 0.88 }, { filter: 'blur(6px)', offset: 1 }], { duration: T, fill: 'forwards' }));
      // the road: lane marks and lamps at the same speed
      const v = (Z1 - Z0) / T; // units per ms
      anims.push(lines.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-240px)' }], { duration: 240 / v, iterations: Infinity }));
      const L = (LZ1 - LZ0) / v;
      lamps.forEach((l) => {
        const side = +getComputedStyle(l).getPropertyValue('--side') || 1;
        const k = +getComputedStyle(l).getPropertyValue('--k') || 0;
        const z = -1500 * k - 400;
        const at = (z - LZ0) / (LZ1 - LZ0);
        const x = side * 430;
        anims.push(l.animate([{ transform: `translate3d(${x}px, 170px, ${LZ0}px)` }, { transform: `translate3d(${x}px, 170px, ${LZ1}px)` }],
          { duration: L, iterations: Infinity, delay: -at * L }));
      });
      // the clock: time the board is big enough to read (a tenth of the screen wide or more)
      let seen = 0, last = performance.now(), shown = -1;
      const tick = (now) => {
        const dt = now - last; last = now;
        const r = face.getBoundingClientRect(), s = stage.getBoundingClientRect();
        if (r.width > s.width * 0.1 && r.left < s.right - r.width * 0.25) seen += dt;
        const t = Math.floor(seen / 100);
        if (t !== shown) { shown = t; tOut.textContent = (t / 10).toFixed(1); }
        if (driving) raf = requestAnimationFrame(tick);
      };
      tOut.textContent = '0.0';
      raf = requestAnimationFrame(tick);
      anims[0].finished.then(() => {
        const secs = seen / 1000;
        stopAll();
        vid.pause();
        showRead(secs);
        bb.style.transform = '';
      }, () => {});
    }

    load(0);
    setSpeed(90);
    $$('[data-go]', el).forEach((x) => x.addEventListener('click', drive));
    $$('[data-kmh]', el).forEach((x) => x.addEventListener('click', () => { if (driving) return; setSpeed(+x.dataset.kmh); drive(); }));
    $$('[data-board]', el).forEach((x) => x.addEventListener('click', () => { if (driving) return; load(+x.dataset.board); drive(); }));
    let onScreen = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        onScreen = e.isIntersecting;
        if (!onScreen) { vid.pause(); rvid.pause(); } else if (!read.hidden) play(rvid);
      }, { threshold: 0.4 }).observe(stage);
    }
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || !onScreen || e.repeat) return;
      const t = e.target;
      if (t && t !== document.body && t.closest('input, textarea, select, [contenteditable], a, button:not([data-go])')) return;
      e.preventDefault();
      drive();
    });
    if (!reduce) onceSeen(stage, () => setTimeout(drive, 500), 0.65);
  }

  /* ------------------------------------------------------------- Look closer
     A loupe over the 8K master at 100% (one picture pixel per screen pixel). The master is
     cut into tiles and only those under the loupe load. It tours the details by itself
     until the visitor takes over: the mouse moves it, a tap places it, a detail sends it. */
  function loupe(el) {
    const T = JSON.parse(el.dataset.tiles), spots = JSON.parse(el.dataset.spots);
    const frame = $('.lp__frame', el), lens = $('.lp__lens', el), plane = $('.lp__plane', el);
    const xy = $('[data-xy]', el), cap = $('[data-cap]', el);
    const cols = T.w / T.tw, rows = T.h / T.th;
    const tiles = [];
    plane.style.width = T.w + 'px';
    plane.style.height = T.h + 'px';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const im = document.createElement('img');
        im.alt = ''; im.decoding = 'async'; im.draggable = false;
        im.style.cssText = `left:${c * T.tw}px;top:${r * T.th}px;width:${T.tw}px;height:${T.th}px`;
        plane.appendChild(im);
        tiles.push(im);
      }
    }
    // until its tiles arrive, the loupe shows the picture already on the page, blown up
    const base = $('.lp__img', el);
    const under = () => { if (base.currentSrc) plane.style.backgroundImage = `url("${base.currentSrc}")`; };
    if (base.complete) under(); else base.addEventListener('load', under, { once: true });
    let x = spots[0][0], y = spots[0][1], active = 0, tour = 0, touched = false;
    const k = () => 1 / Math.min(devicePixelRatio || 1, 2);
    function place() {
      const fw = frame.clientWidth, fh = frame.clientHeight, R = lens.offsetWidth / 2, z = k();
      lens.style.left = (x * fw).toFixed(1) + 'px';
      lens.style.top = (y * fh).toFixed(1) + 'px';
      plane.style.transform = `translate(${(R - x * T.w * z).toFixed(1)}px, ${(R - y * T.h * z).toFixed(1)}px) scale(${z})`;
      const rx = R / z + T.tw * 0.4, ry = R / z + T.th * 0.4;
      const c0 = Math.max(0, Math.floor((x * T.w - rx) / T.tw)), c1 = Math.min(cols - 1, Math.floor((x * T.w + rx) / T.tw));
      const r0 = Math.max(0, Math.floor((y * T.h - ry) / T.th)), r1 = Math.min(rows - 1, Math.floor((y * T.h + ry) / T.th));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const im = tiles[r * cols + c];
          if (!im.src) im.src = `${T.base}${r}${c}.webp`;
        }
      }
      xy.textContent = `x ${Math.round(x * T.w)} · y ${Math.round(y * T.h)}`;
    }
    function go(j, glide = true) {
      active = j;
      [x, y] = spots[j];
      el.classList.toggle('is-glide', glide && !reduce);
      place();
      cap.textContent = spots[j][3];
      $$('[data-spot]', el).forEach((b) => {
        const on = +b.dataset.spot === j;
        if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('is-on', on);
      });
    }
    function stopTour() { clearInterval(tour); tour = 0; touched = true; }
    const at = (e) => {
      const r = frame.getBoundingClientRect();
      x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    };
    frame.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && !frame.hasPointerCapture(e.pointerId)) return;
      if (e.target.closest('.lp__dot')) return;
      stopTour();
      el.classList.remove('is-glide');
      el.classList.add('is-used');
      at(e);
      place();
    });
    frame.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') go(active); });
    frame.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || e.target.closest('.lp__dot')) return;
      stopTour();
      el.classList.add('is-used', 'is-glide');
      at(e);
      place();
      // a drag that starts on the loupe moves it; anywhere else the page scrolls as usual
      const lr = lens.getBoundingClientRect();
      if (Math.hypot(e.clientX - (lr.left + lr.width / 2), e.clientY - (lr.top + lr.height / 2)) < lr.width / 2) frame.setPointerCapture(e.pointerId);
    });
    $$('[data-spot]', el).forEach((b) => b.addEventListener('click', () => { stopTour(); go(+b.dataset.spot); }));
    if ('ResizeObserver' in window) new ResizeObserver(() => { el.classList.remove('is-glide'); place(); }).observe(frame);
    go(0, false);
    // a short tour of the details, until the visitor takes the loupe; their tiles come first
    if (!reduce) {
      onceSeen(frame, () => {
        const save = [x, y];
        spots.forEach(([sx, sy]) => { x = sx; y = sy; place(); });
        [x, y] = save;
        place();
        if (touched) return;
        tour = setInterval(() => { if (!touched) go((active + 1) % spots.length); }, 3400);
      }, 0.5);
    }
  }

  /* --------------------------------------------------------- Pour it yourself
     A product film drawn frame by frame on a canvas, so it can be scrubbed both ways with no
     seeking. Drag across the jar (or the bar, or the arrow keys) to pour; let go mid-drag and
     it coasts a little. Frames load coarse to fine: every 8th first, then the rest. */
  function scrub(el) {
    const N = +el.dataset.n, fps = +el.dataset.fps || 12, base = el.dataset.base;
    const frame = $('.sc__frame', el), cv = $('canvas', frame), ctx = cv.getContext('2d');
    const poster = $('.sc__poster', frame), tc = $('[data-sctc]', el), bar = $('[data-bar]', el), range = $('[data-range]', el);
    const imgs = new Array(N);
    let cur = 0, shown = -1, playing = 0, coast = 0;
    const order = [];
    [8, 4, 2, 1].forEach((st) => { for (let i = 0; i < N; i += st) if (!order.includes(i)) order.push(i); });
    if (!order.includes(N - 1)) order.splice(1, 0, N - 1);
    (function loadNext(q) {
      if (!q.length) return;
      const batch = q.splice(0, 6);
      Promise.all(batch.map((i) => new Promise((ok) => {
        const im = new Image();
        im.onload = () => { imgs[i] = im; if (shown < 0 || Math.abs(i - cur) < Math.abs(nearest(cur) - cur) + 1) draw(); ok(); };
        im.onerror = ok;
        im.src = `${base}${String(i).padStart(3, '0')}.webp`;
      }))).then(() => loadNext(q));
    })(order.slice());
    function nearest(i) {
      if (imgs[i]) return i;
      for (let d = 1; d < N; d++) {
        if (imgs[i - d]) return i - d;
        if (imgs[i + d]) return i + d;
      }
      return -1;
    }
    function draw() {
      const i = nearest(cur);
      if (i < 0) return;
      if (i !== shown) {
        ctx.drawImage(imgs[i], 0, 0, cv.width, cv.height);
        shown = i;
        poster.style.visibility = 'hidden';
      }
      const t = cur * (24 / fps) ; // source frames at 24 fps, every second one kept
      const s = Math.floor(t / 24), f = Math.floor(t % 24);
      tc.textContent = `00:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
      bar.style.transform = `scaleX(${(cur / (N - 1)).toFixed(4)})`;
      range.value = cur;
    }
    function set(i) {
      const v = Math.max(0, Math.min(N - 1, Math.round(i)));
      if (v === cur && shown >= 0) return;
      cur = v;
      draw();
    }
    function stop() { cancelAnimationFrame(playing); playing = 0; cancelAnimationFrame(coast); coast = 0; }
    function play() {
      stop();
      if (cur >= N - 1) set(0);
      let last = performance.now(), acc = 0;
      const step = (now) => {
        acc += (now - last) * fps / 1000; last = now;
        if (acc >= 1) { set(cur + Math.floor(acc)); acc %= 1; }
        if (cur < N - 1) playing = requestAnimationFrame(step); else playing = 0;
      };
      playing = requestAnimationFrame(step);
    }
    // drag: a full sweep across the frame pours the whole film
    let x0 = null, i0 = 0, vx = 0, lastX = 0, lastT = 0;
    frame.addEventListener('pointerdown', (e) => {
      stop();
      el.classList.add('is-used');
      x0 = e.clientX; i0 = cur; lastX = e.clientX; lastT = performance.now(); vx = 0;
      frame.classList.add('is-dragging');
      if (e.pointerType !== 'touch') frame.setPointerCapture(e.pointerId);
    });
    frame.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      const w = frame.clientWidth * 1.15;
      set(i0 + ((e.clientX - x0) / w) * (N - 1));
      const now = performance.now();
      vx = (e.clientX - lastX) / Math.max(1, now - lastT);
      lastX = e.clientX; lastT = now;
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null;
      frame.classList.remove('is-dragging');
      if (reduce) return;
      // coast: the honey keeps going a moment after you let go
      let v = vx * (N - 1) / (frame.clientWidth * 1.15) * 16; // frames per 16 ms
      let pos = cur;
      const glide = () => {
        v *= 0.92; pos += v;
        set(pos);
        if (Math.abs(v) > 0.05 && pos > 0 && pos < N - 1) coast = requestAnimationFrame(glide); else coast = 0;
      };
      if (Math.abs(v) > 0.2) coast = requestAnimationFrame(glide);
    };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
    range.addEventListener('input', () => { stop(); el.classList.add('is-used'); set(+range.value); });
    $('[data-pour]', el).addEventListener('click', play);
    $('[data-back]', el).addEventListener('click', () => { stop(); set(0); });
    let onScreen = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (!onScreen) stop(); }, { threshold: 0.5 }).observe(frame);
    }
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || !onScreen || e.repeat) return;
      const t = e.target;
      if (t && t !== document.body && t.closest('input:not([data-range]), textarea, select, [contenteditable], a, button:not([data-pour])')) return;
      e.preventDefault();
      if (playing) stop(); else play();
    });
    draw();
    if (!reduce) onceSeen(frame, () => setTimeout(() => { if (!el.classList.contains('is-used')) play(); }, 400), 0.6);
  }

  const LABS = { mixer, driveby, loupe, scrub };
  $$('[data-lab]').forEach((el) => {
    const f = LABS[el.dataset.lab];
    if (f) whenNear(el, () => f(el));
  });
})();
