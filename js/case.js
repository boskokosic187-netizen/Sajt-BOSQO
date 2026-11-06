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

  const LABS = { mixer };
  $$('[data-lab]').forEach((el) => {
    const f = LABS[el.dataset.lab];
    if (f) whenNear(el, () => f(el));
  });
})();
