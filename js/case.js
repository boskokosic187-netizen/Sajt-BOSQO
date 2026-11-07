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
     The collection's own trait layers (background, jersey, number, skin, eyes, head, extra,
     ball, mouth, arm), stacked in that order on one card: any trait fits any other because
     all of them were drawn on one rig. A spin swaps every unlocked layer, one after another
     from the bottom up; a click on a part of the character (or on its row in the layers
     panel) steps that layer; Explode pulls the stack apart in 3D. Only the layers on the card
     are loaded, plus the next spin, quietly, once the visitor is playing. */
  function mixer(el) {
    const rig = JSON.parse($('[data-rig]', el).textContent);
    const L = rig.layers, NL = L.length, W = rig.w, H = rig.h;
    const base = el.dataset.base;
    const card = $('.mx__card', el), art = $('.mx__art', el), stage = $('.mx__stage', el), tip = $('.mx__tip', el);
    const slots = $$('.mx__layer', el);
    const rows = $$('.mx__row', el).sort((a, b) => a.dataset.l - b.dataset.l);
    const idEl = $('[data-id]', el), idK = $('[data-id-k]', el), idBox = $('.mx__id', el);
    const first = rig.originals.find((o) => o[0] === +el.dataset.start) || rig.originals[0];
    const cur = first[1].slice();
    const locked = new Array(NL).fill(false);
    const hover = matchMedia('(hover: hover)').matches;

    const url = (l, k) => `${base}${L[l].k}-${String(k).padStart(2, '0')}.webp`;
    const cache = new Map();
    function load(l, k) {
      const u = url(l, k);
      if (!cache.has(u)) {
        const im = new Image();
        im.decoding = 'async';
        im.src = u;
        cache.set(u, im.decode().catch(() => {}));
      }
      return cache.get(u);
    }
    function place(im, l, k) {
      const b = L[l].items[k][1];
      im.width = b[2];
      im.height = b[3];
      im.style.left = (b[0] / W) * 100 + '%';
      im.style.top = (b[1] / H) * 100 + '%';
      im.style.width = (b[2] / W) * 100 + '%';
    }
    const top = (l) => { const a = $$('img', slots[l]); return a[a.length - 1]; };

    function readout(l) {
      const r = rows[l], it = L[l].items[cur[l]];
      $('[data-v]', r).textContent = it[0];
      $('[data-n]', r).textContent = `${cur[l] + 1}/${L[l].items.length}`;
      $('.mx__th img', r).src = url(l, cur[l]);
      $('[data-pick]', r).setAttribute('aria-label', `${L[l].label}: ${it[0]}. Next ${L[l].label.toLowerCase()}`);
      r.classList.remove('is-new');
      void r.offsetWidth;
      r.classList.add('is-new');
    }
    function ident() {
      const o = rig.originals.find((x) => x[1].every((k, i) => k === cur[i]));
      idBox.classList.toggle('is-orig', !!o);
      if (o) {
        idK.textContent = 'Original';
        idEl.textContent = '#' + o[0];
      } else {
        const n = cur.reduce((a, k, i) => a * L[i].items.length + k, 0) + 1;
        idK.textContent = 'Mix';
        idEl.textContent = '#' + n.toLocaleString('en-US');
      }
    }

    // one layer to a new trait: the new one drops onto the stack, the old one goes
    function swap(l, k, delay = 0) {
      cur[l] = k;
      return load(l, k).then(() => {
        if (cur[l] !== k) return;   // a later click won
        const slot = slots[l];
        const imgs = $$('img', slot);
        imgs.slice(0, -1).forEach((o) => o.remove());
        const old = imgs[imgs.length - 1];
        const im = document.createElement('img');
        im.alt = '';
        im.draggable = false;
        place(im, l, k);
        im.src = url(l, k);
        slot.insertBefore(im, $('.mx__lt', slot));
        if (reduce) { if (old) old.remove(); readout(l); return; }
        setTimeout(() => readout(l), delay + 140);
        const kf = l === 0 ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ opacity: 0, transform: 'translateY(-7%) scale(1.04)' }, { opacity: 1, transform: 'none' }];
        const a = im.animate(kf, { duration: l === 0 ? 460 : 520, delay, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.12)', fill: 'backwards' });
        if (old && l) old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, delay, fill: 'forwards' });
        return a.finished.then(() => { if (old) old.remove(); }, () => {});
      });
    }
    const rnd = (l, not) => {
      const n = L[l].items.length;
      let k;
      do { k = Math.floor(Math.random() * n); } while (k === not && n > 1);
      return k;
    };
    // the next spin, picked ahead and loaded while the visitor looks at this one
    let next = null;
    function plan() {
      next = cur.map((k, l) => rnd(l, k));
      next.forEach((k, l) => load(l, k));
    }
    function run(to) {
      let j = 0;
      const ps = to.map((k, l) => (k === cur[l] ? null : swap(l, k, (j++) * 75)));
      return Promise.all(ps).then(ident);
    }
    function spin() {
      if (locked.every(Boolean)) locked.forEach((_, l) => setLock(l, false));
      const to = cur.map((k, l) => (locked[l] ? k : next && next[l] !== k ? next[l] : rnd(l, k)));
      next = null;
      run(to).then(plan);
    }
    function original() {
      const pool = rig.originals.filter((o) => !o[1].every((k, i) => k === cur[i]));
      const o = pool[Math.floor(Math.random() * pool.length)];
      locked.forEach((_, l) => setLock(l, false));
      run(o[1]);
    }
    function step(l, d = 1) {
      if (locked[l]) setLock(l, false);
      const n = L[l].items.length;
      swap(l, (cur[l] + d + n) % n).then(ident);
      load(l, (cur[l] + d + n) % n);   // and the one after it
    }
    function setLock(l, on) {
      locked[l] = on;
      $('[data-lock]', rows[l]).setAttribute('aria-pressed', String(on));
      rows[l].classList.toggle('is-locked', on);
      slots[l].classList.toggle('is-locked', on);
    }

    // a part under the pointer: the top layer whose pixel there is not transparent
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const pc = probe.getContext('2d', { willReadFrequently: true });
    function hit(x, y) {
      if (card.classList.contains('is-exploded')) return -1;
      const r = art.getBoundingClientRect();
      const fx = ((x - r.left) / r.width) * W, fy = ((y - r.top) / r.height) * H;
      if (fx < 0 || fy < 0 || fx > W || fy > H) return -1;
      for (let l = NL - 1; l > 0; l--) {
        const im = top(l), b = L[l].items[cur[l]][1];
        if (!im || !im.complete || !im.naturalWidth) continue;
        const px = fx - b[0], py = fy - b[1];
        if (px < 0 || py < 0 || px >= b[2] || py >= b[3]) continue;
        pc.clearRect(0, 0, 1, 1);
        pc.drawImage(im, px * (im.naturalWidth / b[2]), py * (im.naturalHeight / b[3]), 1, 1, 0, 0, 1, 1);
        if (pc.getImageData(0, 0, 1, 1).data[3] > 60) return l;
      }
      return 0;
    }
    function focus(l) {
      const on = l > 0;
      art.classList.toggle('is-focus', on);
      slots.forEach((s, i) => s.classList.toggle('is-hot', on && i === l));
      rows.forEach((r, i) => r.classList.toggle('is-hot', l >= 0 && i === l));
    }

    // the panel
    rows.forEach((r, l) => {
      const pick = $('[data-pick]', r);
      pick.addEventListener('click', () => step(l, 1));
      pick.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(l, 1); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(l, -1); }
      });
      r.addEventListener('pointerenter', () => focus(l));
      r.addEventListener('pointerleave', () => focus(-1));
      pick.addEventListener('focus', () => focus(l));
      pick.addEventListener('blur', () => focus(-1));
      $('[data-lock]', r).addEventListener('click', () => setLock(l, !locked[l]));
    });
    $('[data-spin]', el).addEventListener('click', spin);
    $('[data-orig]', el).addEventListener('click', original);
    const xb = $('[data-explode]', el);
    xb.addEventListener('click', () => {
      const on = !card.classList.contains('is-exploded');
      card.classList.toggle('is-exploded', on);
      xb.setAttribute('aria-pressed', String(on));
      $('span', xb).textContent = on ? 'Stack' : 'Explode';
      focus(-1);
      tilt(null);
    });

    // the card: tap a part to change it; with a mouse it leans toward the pointer
    art.addEventListener('click', (e) => { const l = hit(e.clientX, e.clientY); if (l >= 0) step(l, 1); });
    function tilt(e) {
      if (!e || reduce || card.classList.contains('is-exploded')) {
        card.style.removeProperty('--tx');
        card.style.removeProperty('--ty');
        return;
      }
      const r = card.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--tx', (nx * 7).toFixed(2) + 'deg');
      card.style.setProperty('--ty', (-ny * 6).toFixed(2) + 'deg');
    }
    if (hover) {
      let raf = 0, ev = null;
      art.addEventListener('pointermove', (e) => {
        ev = e;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const l = hit(ev.clientX, ev.clientY);
          focus(l);
          tilt(ev);
          if (l >= 0) {
            const s = stage.getBoundingClientRect();
            tip.textContent = `${L[l].label} · ${L[l].items[cur[l]][0]}  ↻`;
            tip.style.transform = `translate(${ev.clientX - s.left + 16}px, ${ev.clientY - s.top + 14}px)`;
            tip.classList.add('is-on');
          } else tip.classList.remove('is-on');
        });
      });
      art.addEventListener('pointerleave', () => { focus(-1); tilt(null); tip.classList.remove('is-on'); });
    }

    // Space spins while the lab is on screen and nothing else has the keyboard
    let onScreen = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }, { threshold: 0.5 }).observe(card);
    }
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || !onScreen || e.repeat) return;
      const t = e.target;
      if (t && t !== document.body && t.closest('input, textarea, select, [contenteditable], a, button:not([data-spin])')) return;
      e.preventDefault();
      spin();
    });

    // first look: the stack comes apart, the ten layers land on it one by one, bottom up,
    // and it closes into the character, so it is clear what the card is made of
    if (!reduce && 'IntersectionObserver' in window) {
      art.classList.add('is-pre');
      const ready = Promise.all(cur.map((k, l) => load(l, k)));
      whenNear(el, () => slots.forEach((s) => $$('img', s).forEach((im) => { im.loading = 'eager'; })));
      onceSeen(card, () => ready.then(() => {
        card.classList.add('is-exploded', 'is-intro');
        art.classList.remove('is-pre');
        const anims = slots.map((s, l) => s.animate(
          [{ opacity: 0, translate: '0 0 160px' }, { opacity: 1, translate: '0 0 0' }],
          { duration: 520, delay: 380 + l * 120, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'backwards' }));
        anims[NL - 1].finished.then(() => setTimeout(() => {
          if (xb.getAttribute('aria-pressed') !== 'true') card.classList.remove('is-exploded');
          card.classList.remove('is-intro');
          setTimeout(plan, 1200);
        }, 700), () => {});
      }), 0.55);
    } else plan();
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

    // the smallest file that covers the box (the board is made in several widths; never shown past its own)
    function srcFor(b, box, k = 1) {
      const r = box.getBoundingClientRect(), need = Math.max(r.width, r.height * (b.ar || 2)) * k * 0.98;
      const s = b.srcs || [[b.mp4, 0]];
      return (s.find((x) => x[1] >= need) || s[s.length - 1])[0];
    }
    function load(j) {
      const b = boards[j];
      cur = j;
      vid.poster = b.poster;
      // passing the camera the board grows to ~55% of the stage's width
      const fs = srcFor(b, stage, 0.56);
      if (vid.dataset.src !== fs) { vid.dataset.src = fs; vid.src = fs; vid.preload = 'auto'; }
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
      read.hidden = false;   // laid out first: the file is picked for the card's size
      read.classList.remove('is-on');
      const rs = srcFor(b, rvid);
      if (rvid.dataset.src !== rs) { rvid.dataset.src = rs; rvid.src = rs; }
      try { rvid.currentTime = b.at || 0; } catch (e) { /* not loaded yet */ }
      play(rvid);
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
    // the same lab flips a series of posts: a name and a count for each, and the system to show over it
    const names = el.dataset.names ? JSON.parse(el.dataset.names) : null;
    const flI = $('[data-fl-i]', el), flName = $('[data-fl-name]', el), sys = $('[data-sys]', el);
    const pad = String(N - 1).length < 3 ? 2 : 3;
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
        im.src = `${base}${String(i).padStart(pad, '0')}.webp`;
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
      if (tc) {
        const t = cur * (24 / fps); // source frames at 24 fps, every second one kept
        const s = Math.floor(t / 24), f = Math.floor(t % 24);
        tc.textContent = `00:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
      }
      if (names) {
        flI.textContent = String(cur + 1).padStart(2, '0');
        flName.textContent = names[cur];
      }
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
    $('[data-pour], [data-riffle]', el).addEventListener('click', play);
    const back = $('[data-back]', el);
    if (back) back.addEventListener('click', () => { stop(); set(0); });
    if (sys) {
      const show = () => el.classList.toggle('is-sys', sys.checked);
      sys.addEventListener('change', show);
      show(); // ticked before the lab woke up
    }
    let onScreen = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (!onScreen) stop(); }, { threshold: 0.5 }).observe(frame);
    }
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || !onScreen || e.repeat) return;
      const t = e.target;
      if (t && t !== document.body && t.closest('input:not([data-range]), textarea, select, [contenteditable], a, button:not([data-pour]):not([data-riffle])')) return;
      e.preventDefault();
      if (playing) stop(); else play();
    });
    draw();
    if (!reduce) onceSeen(frame, () => setTimeout(() => { if (!el.classList.contains('is-used')) play(); }, 400), 0.6);
  }

  /* ------------------------------------------------------------ Walk the gallery
     A year of shows framed on one wall. Drag to walk (it coasts and settles on the nearest
     piece), or step with the arrows; the piece in front of you is lit and gets its wall label.
     Until the visitor takes over, it walks on its own, one piece at a time. */
  function gallery(el) {
    const room = $('.gw__room', el), track = $('.gw__track', el), pieces = $$('.gw__piece', el);
    const iOut = $('[data-gw-i]', el), tOut = $('[data-gw-t]', el);
    let x = 0, cur = -1, raf = 0, auto = 0, touched = false, cs = [];
    const measure = () => { cs = pieces.map((p) => p.offsetLeft + p.offsetWidth / 2); };
    const mid = () => room.clientWidth / 2;
    const clampX = (v) => Math.max(mid() - cs[cs.length - 1], Math.min(mid() - cs[0], v));
    function nearestTo(px) {
      const c = mid() - px;
      let k = 0;
      cs.forEach((v, j) => { if (Math.abs(v - c) < Math.abs(cs[k] - c)) k = j; });
      return k;
    }
    function setX(v) {
      x = clampX(v);
      track.style.transform = `translateX(${x.toFixed(1)}px)`;
      const k = nearestTo(x);
      if (k !== cur) {
        cur = k;
        pieces.forEach((p, j) => p.classList.toggle('is-lit', j === k));
        iOut.textContent = String(k + 1).padStart(2, '0');
        tOut.textContent = $('.gw__label b', pieces[k]).textContent;
        // the next two pictures load before you get there
        [k + 1, k + 2].forEach((j) => { const im = pieces[j] && $('img', pieces[j]); if (im) im.loading = 'eager'; });
      }
    }
    function goTo(i, ms = 900) {
      cancelAnimationFrame(raf);
      const to = clampX(mid() - cs[Math.max(0, Math.min(pieces.length - 1, i))]);
      if (reduce || !ms) { setX(to); return; }
      const from = x, t0 = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        setX(from + (to - from) * ease(t));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }
    function take() { touched = true; clearInterval(auto); el.classList.add('is-used'); }
    let x0 = null, start = 0, vx = 0, lx = 0, lt = 0;
    room.addEventListener('pointerdown', (e) => {
      take();
      cancelAnimationFrame(raf);
      x0 = e.clientX; start = x; lx = e.clientX; lt = performance.now(); vx = 0;
      room.classList.add('is-dragging');
      if (e.pointerType !== 'touch') room.setPointerCapture(e.pointerId);
    });
    room.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      setX(start + (e.clientX - x0));
      const now = performance.now();
      vx = (e.clientX - lx) / Math.max(1, now - lt); lx = e.clientX; lt = now;
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null;
      room.classList.remove('is-dragging');
      goTo(nearestTo(clampX(x + vx * 260)), 650); // where the throw would land, then the nearest piece
    };
    room.addEventListener('pointerup', end);
    room.addEventListener('pointercancel', end);
    $$('[data-step]', el).forEach((b) => b.addEventListener('click', () => { take(); goTo(cur + +b.dataset.step); }));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { take(); goTo(cur + 1); }
      if (e.key === 'ArrowLeft') { take(); goTo(cur - 1); }
    });
    const fit = () => { measure(); goTo(Math.max(0, cur), 0); };
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(room); else addEventListener('resize', fit);
    // pictures arrive square or A3 and change the widths: measure again
    $$('img', track).forEach((im) => im.addEventListener('load', fit, { once: true }));
    fit();
    if (!reduce) {
      onceSeen(room, () => {
        if (touched) return;
        auto = setInterval(() => { if (!touched) goTo(cur + 1 < pieces.length ? cur + 1 : 0, 1100); }, 2800);
      }, 0.5);
    }
  }

  /* ----------------------------------------------------------- Wake the cast
     Baby Boo's five friends from the labels. Each drawing is cut into parts (clip-path on one image)
     that turn on their own joints: the idle loops run in css on the outer span, a tap plays the
     animal's own move with web animations on the inner span, so the two never fight. The elephant
     blows bubbles from the tip of its trunk; bath time wakes all five. */
  const ZK = (a, g) => a.querySelector(`.zo__g--${g} > .zo__k`);
  const zAnim = (node, frames, o) => (node ? node.animate(frames, { easing: 'cubic-bezier(.3,.7,.3,1)', ...o }) : null);
  const zFlag = (a, cls, ms) => {
    clearTimeout(a['_t' + cls]);
    a.classList.add(cls);
    a['_t' + cls] = setTimeout(() => a.classList.remove(cls), ms);
  };
  // the koala sleeps: a tap lifts its head, it blushes, then it drifts back off
  function koalaWake(a) {
    zFlag(a, 'is-awake', 2700);
    if (reduce) return;
    zAnim(ZK(a, 'head'), [
      { transform: 'none' }, { transform: 'rotate(17deg)', offset: 0.2 }, { transform: 'rotate(13deg)', offset: 0.32 },
      { transform: 'rotate(15deg)', offset: 0.78 }, { transform: 'none' }], { duration: 2900, easing: 'ease-in-out' });
    zAnim(ZK(a, 'body'), [{ transform: 'none' }, { transform: 'scale(1.025, .97)', offset: 0.16 }, { transform: 'none', offset: 0.42 }, { transform: 'none' }],
      { duration: 2900 });
  }
  $$('[data-zo-solo]').forEach((a) => {
    let last = 0;
    const go = () => { if (Date.now() - last > 3200) { last = Date.now(); koalaWake(a); } };
    a.addEventListener('pointerenter', go);
    a.addEventListener('click', go);
  });

  function mascots(el) {
    const cast = $('.zo__cast', el), scroller = $('.zo__scroll', el), bubbles = $('.zo__bubbles', el);
    const info = JSON.parse(el.dataset.parts);
    const nameOut = $('[data-zo-name]', el), partsOut = $('[data-zo-parts]', el);
    const A = {};
    $$('.zo__a', el).forEach((a) => (A[a.dataset.a] = a));
    const keys = Object.keys(A);
    let unit = 1, onScreen = false, live = 0;
    const fit = () => {
      unit = cast.getBoundingClientRect().width / 1500 || 1;
      cast.style.setProperty('--lw', (4.4 * unit).toFixed(2) + 'px');
    };
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(cast); else addEventListener('resize', fit);
    fit();
    // a phone scrolls the cast sideways: start on the middle of it, three friends in view
    if (scroller.scrollWidth > scroller.clientWidth + 2) scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;

    function hop(a, h = 9, d = 720) {
      return zAnim($('.zo__in', a), [
        { transform: 'none' },
        { transform: 'scale(1.05, .93)', offset: 0.16 },
        { transform: `translateY(-${h}%) scale(.97, 1.04)`, offset: 0.46 },
        { transform: 'scale(1.04, .95)', offset: 0.74 },
        { transform: 'none' }], { duration: d });
    }
    // a tail shears about the line it was cut on (skewY), so it wags without opening the joint
    const wag = [{ transform: 'none' }, { transform: 'skewY(-26deg)' }, { transform: 'skewY(16deg)' }, { transform: 'skewY(-18deg)' }, { transform: 'skewY(7deg)' }, { transform: 'none' }];

    // bubbles from the trunk's tip (or anywhere along the floor at bath time), drawn in the same ink
    function bubble(x, y, i, spread) {
      if (live > 70) return;
      live++;
      const b = document.createElement('i');
      b.className = 'zo__bub';
      const s = (14 + Math.random() * 30) * unit, rise = (190 + Math.random() * 260) * unit;
      const dx = (Math.random() - 0.5) * spread * unit, w = (12 + Math.random() * 18) * unit;
      b.style.setProperty('--s', s.toFixed(1) + 'px');
      bubbles.appendChild(b);
      const at = (p, sc = 1) => ({ transform: `translate(${(x + dx * p + Math.sin(p * 7 + i) * w).toFixed(1)}px, ${(y - rise * p).toFixed(1)}px) scale(${sc})` });
      const an = b.animate([
        { ...at(0, 0.2), opacity: 0 }, { ...at(0.08, 1), opacity: 1, offset: 0.08 }, { ...at(0.5), offset: 0.5 },
        { ...at(0.94, 1.05), opacity: 1, offset: 0.94 }, { ...at(1, 1.35), opacity: 0 }],
      { duration: 2400 + Math.random() * 1800, delay: i * 85, easing: 'linear', fill: 'backwards' });
      an.onfinish = () => { b.remove(); live--; };
    }
    function blow(a, n, spread = 140) {
      const tip = $('.zo__tip', a);
      if (!tip) return;
      const c = cast.getBoundingClientRect(), r = tip.getBoundingClientRect();
      for (let i = 0; i < n; i++) bubble(r.left - c.left, r.top - c.top, i, spread);
    }

    const MOVES = {
      lion(a) {
        zFlag(a, 'is-happy', 1900);
        if (reduce) return;
        hop(a, 7);
        zAnim(ZK(a, 'head'), [{ transform: 'none' }, { transform: 'skewX(-7deg)' }, { transform: 'skewX(6deg)' }, { transform: 'skewX(-3deg)' }, { transform: 'none' }], { duration: 950 });
        zAnim(ZK(a, 'tail'), wag, { duration: 1250 });
      },
      koala: koalaWake,
      elephant(a) {
        if (reduce) { zFlag(a, 'is-happy', 1500); return; }
        hop(a, 4, 620);
        zAnim(ZK(a, 'head'), [{ transform: 'none' }, { transform: 'skewX(4deg) scaleY(1.02)' }, { transform: 'skewX(-3deg)' }, { transform: 'none' }], { duration: 900 });
        zAnim(ZK(a, 'trunk'), [{ transform: 'none' }, { transform: 'rotate(122deg)', offset: 0.26 }, { transform: 'rotate(114deg)', offset: 0.72 }, { transform: 'none' }],
          { duration: 2500, easing: 'ease-in-out' });
        setTimeout(() => blow(a, 11), 640);
      },
      bunny(a) {
        if (reduce) return;
        hop(a, 15, 780);
        const flop = (s) => [{ transform: 'none' }, { transform: `skewX(${16 * s}deg)`, offset: 0.3 }, { transform: `skewX(${-12 * s}deg)`, offset: 0.56 },
          { transform: `skewX(${6 * s}deg)`, offset: 0.8 }, { transform: 'none' }];
        zAnim(ZK(a, 'earl'), flop(1), { duration: 1150 });
        zAnim(ZK(a, 'earr'), flop(-1), { duration: 1150, delay: 70 });
      },
      giraffe(a) {
        zFlag(a, 'is-happy', 2700);
        if (reduce) return;
        zAnim(ZK(a, 'neck'), [{ transform: 'none' }, { transform: 'skewX(-9deg)', offset: 0.3 }, { transform: 'skewX(7deg)', offset: 0.6 }, { transform: 'skewX(-3deg)', offset: 0.85 }, { transform: 'none' }],
          { duration: 1600, easing: 'ease-in-out' });
        zAnim(ZK(a, 'tail'), wag, { duration: 1250, delay: 150 });
      },
    };

    function say(k) {
      if (!k) { nameOut.textContent = 'All five, awake'; partsOut.textContent = keys.reduce((n, x) => n + info[x][1].length, 0) + ' parts on the move'; return; }
      nameOut.textContent = info[k][0];
      partsOut.textContent = info[k][1].length + ' parts · ' + info[k][1].join(', ');
    }
    function press(k) { $$('[data-wake]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wake === k))); }
    function wake(k, from) {
      const a = A[k];
      if (!a) return;
      el.classList.add('is-used');
      if (from === 'button' && scroller.scrollWidth > scroller.clientWidth + 2) { // a phone: bring it into view first
        const r = a.getBoundingClientRect(), s = scroller.getBoundingClientRect();
        scroller.scrollBy({ left: r.left + r.width / 2 - (s.left + s.width / 2), behavior: reduce ? 'auto' : 'smooth' });
      }
      MOVES[k](a);
      say(k);
      press(k);
    }
    function bath() {
      el.classList.add('is-used');
      say(null);
      press(null);
      keys.forEach((k, i) => setTimeout(() => MOVES[k](A[k]), (k === 'elephant' ? 0 : 200 + i * 170)));
      if (reduce) return;
      const c = cast.getBoundingClientRect();
      setTimeout(() => {   // the whole stage foams up
        for (let i = 0; i < 22; i++) bubble(c.width * (0.06 + Math.random() * 0.88), c.height * (0.84 + Math.random() * 0.08), i * 0.8, 120);
      }, 400);
    }

    keys.forEach((k) => A[k].addEventListener('click', () => wake(k)));
    $$('[data-wake]', el).forEach((b) => b.addEventListener('click', () => wake(b.dataset.wake, 'button')));
    $('[data-bath]', el).addEventListener('click', bath);
    // the stage, not the cast: on a phone the cast is wider than the screen and never shows enough of itself
    if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => (onScreen = en.isIntersecting), { threshold: 0.35 }).observe(scroller);
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || !onScreen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(e.target.tagName)) return; // a focused button keeps its own Space
      e.preventDefault();
      bath();
    });

    // they lean a little toward the pointer
    if (!reduce && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      let raf = 0, px = 0;
      const lean = () => {
        raf = 0;
        const c = cast.getBoundingClientRect();
        keys.forEach((k) => {
          const r = A[k].getBoundingClientRect();
          const d = (px - (r.left + r.width / 2)) / c.width;
          A[k].style.setProperty('--lean', Math.max(-1, Math.min(1, -d * 2.4)).toFixed(3));
        });
      };
      el.addEventListener('pointermove', (e) => { px = e.clientX; if (!raf) raf = requestAnimationFrame(lean); });
      el.addEventListener('pointerleave', () => keys.forEach((k) => A[k].style.setProperty('--lean', 0)));
    }

    // the cast arrives one by one; if nobody touches it, the elephant shows what a tap does
    if (reduce || !('IntersectionObserver' in window)) { cast.classList.remove('is-pre'); return; }
    onceSeen(scroller, () => {
      keys.forEach((k, i) => zAnim(A[k], [{ opacity: 0, translate: '0 -28%' }, { opacity: 1, translate: '0 3%', offset: 0.7 }, { opacity: 1, translate: '0 0' }],
        { duration: 760, delay: 120 + i * 150, fill: 'backwards', easing: 'cubic-bezier(.4,0,.6,1)' }));
      cast.classList.remove('is-pre');
      setTimeout(() => { if (!el.classList.contains('is-used')) MOVES.giraffe(A.giraffe); }, 1500);
      setTimeout(() => { if (!el.classList.contains('is-used')) MOVES.elephant(A.elephant); }, 2600);
    }, 0.45);
  }

  const LABS = { mixer, driveby, loupe, scrub, flip: scrub, gallery, mascots };
  $$('[data-lab]').forEach((el) => {
    const f = LABS[el.dataset.lab];
    if (f) whenNear(el, () => f(el));
  });
})();
