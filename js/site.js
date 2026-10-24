/* Boško Kosić — portfolio · "ON AIR"
   One small script for every page, no dependencies. Each feature boots only if
   its markup exists. Video starts only after first paint, only when visible,
   and never on low-end devices or with reduced motion ("lite" mode). */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const LOOPS = 'media/loops/';
  const FX = new URL('../media/fx/', document.currentScript.src).href; // works from case pages too
  const CASES = {
    live: 'live-on-the-streets', ballies: 'ballies', keyart: 'key-art',
    fsu: 'fsu-2026', series: 'series-at-scale', babyboo: 'baby-boo',
  };

  const mqDesktop = matchMedia('(min-width: 768px)');
  const mqHover = matchMedia('(hover: hover) and (pointer: fine)');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = navigator.connection || {};
  const lowEnd =
    !!conn.saveData ||
    /(^|-)2g$/.test(conn.effectiveType || '') ||
    (navigator.deviceMemory && navigator.deviceMemory < 4) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4);
  let lite = reduceMotion || lowEnd;
  root.classList.toggle('is-lite', lite);
  root.classList.toggle('no-motion', reduceMotion);

  const hero = $('.hero');
  const isCase = document.body.classList.contains('page-case');
  let heroVisible = true;
  let heroOnScreen = true; // any of it in view (heroVisible flips a little earlier)
  const onLiteOff = []; // features that start when the visitor opts into motion

  /* ------------------------------------------------------------------ video */
  function makeVideo(src) {
    const v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('disablepictureinpicture', '');
    v.preload = 'auto';
    v.src = src;
    return v;
  }
  const play = (v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
    del: (k) => { try { sessionStorage.removeItem(k); } catch { /* private mode */ } },
  };

  /* ------------------------------------------------ film burn (desktop only)
     One 84 KB shot of red film burn, screen-blended over the page: on the first
     visit, and as a cut between pages (rises on the old page, fades on the new). */
  const burnOK = () => mqDesktop.matches && !lite && !reduceMotion;
  let burnV = null;
  function getBurn() {
    if (!burnV) {
      burnV = makeVideo(FX + 'burn.mp4');
      burnV.loop = false;
      burnV.className = 'fx-burn';
      burnV.setAttribute('aria-hidden', 'true');
      burnV.addEventListener('ended', () => burnV.classList.remove('is-on'));
      document.body.appendChild(burnV);
    }
    return burnV;
  }
  // plays from `from` seconds; gives up if the clip is not ready within `wait` ms
  function playBurn(from, rate, wait) {
    const v = getBurn();
    const t = performance.now();
    const go = () => {
      if (performance.now() - t > wait) return;
      v.currentTime = from;
      v.playbackRate = rate;
      v.classList.add('is-on');
      play(v);
      // slow devices can stall the clip; never leave the red wash on screen
      clearTimeout(v._off);
      v._off = setTimeout(() => { v.pause(); v.classList.remove('is-on'); }, ((2.2 - from) / rate) * 1000 + 500);
    };
    if (v.readyState >= 3) go(); else v.addEventListener('canplay', go, { once: true });
  }
  function go(href) {
    if (!burnOK() || !burnV || burnV.readyState < 3) { location.href = href; return; }
    store.set('bk-burn', '1');
    playBurn(0, 2, 0);
    setTimeout(() => { location.href = href; }, 430); // leave near the peak of the burn
  }
  function setupBurn() {
    if (store.get('bk-burn')) {
      store.del('bk-burn');
      if (burnOK()) playBurn(0.85, 1, 700); // the tail of the burn reveals the new page
    }
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target || a.hasAttribute('download')) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || u.pathname === location.pathname) return;
      if (!burnOK() || !burnV || burnV.readyState < 3) return;
      e.preventDefault();
      go(u.href);
    });
    // preload the clip once the page has settled
    addEventListener('load', () => setTimeout(() => { if (burnOK()) getBurn(); }, 1500));
    // back/forward cache: never come back to a page frozen mid-burn
    addEventListener('pageshow', (e) => {
      if (e.persisted && burnV) { burnV.pause(); burnV.classList.remove('is-on'); }
    });
  }

  /* --------------------------------------------- avatar intro (home, desktop)
     <head> decides (html.is-intro) so the black cover is there from the first paint.
     ~1.3 s: the logo avatar pops up and winks; a tilt of the head launches it into the logo
     while the black closes into it like a camera iris. Any click, key or scroll skips it. */
  let introPlayed = false;
  let introReveal = Promise.resolve(); // the hero powers on when the iris starts to open
  function setupIntro() {
    if (!root.classList.contains('is-intro')) return;
    const cover = $('.intro');
    const markAv = $('.mark__av');
    // not allowed after all, or the page started too slowly: show it as is
    if (!cover || !markAv || lite || !mqDesktop.matches || performance.now() > 2500) {
      root.classList.remove('is-intro');
      return;
    }
    introPlayed = true;
    store.set('bk-intro', '1');

    const wrap = document.createElement('div');
    wrap.className = 'intro__av';
    const av = $('svg', markAv).cloneNode(true);
    $('clipPath', av).id = 'av-clip-intro';
    $('[clip-path]', av).setAttribute('clip-path', 'url(#av-clip-intro)');
    wrap.appendChild(av);
    cover.appendChild(wrap);
    const head = $('.av-head', av);

    let open;
    introReveal = new Promise((r) => { open = r; });
    const anims = [];
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const run = (el, kf, o) => anims.push(el.animate(kf, { fill: 'forwards', ...o }));
    const POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
    const CUT = 'cubic-bezier(0.75, 0, 0.15, 1)';
    const TILT = 'rotate(-8deg) translateY(-2px)';

    // 1) the red disc pops, then I pop up out of it
    run(wrap, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 380, easing: POP });
    run(head, [{ transform: 'translateY(130px)' }, { transform: 'translateY(0)' }], { duration: 440, delay: 110, easing: POP });
    // 2) a wink
    at(500, () => av.classList.add('is-wink'));
    // 3) the head tilts and that launches it into the logo; the black closes into it like an iris
    at(740, () => {
      av.classList.remove('is-wink');
      const a = wrap.getBoundingClientRect();
      const b = markAv.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const cx = a.left + a.width / 2;
      const cy = a.top + a.height / 2;
      const o = { duration: 560, easing: CUT };
      run(wrap, [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${b.width / a.width})` }], o);
      run(head, [{ transform: 'translateY(0)', easing: 'cubic-bezier(0.3, 1.4, 0.6, 1)' }, { transform: TILT, offset: 0.4, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
        { transform: 'none' }], { duration: 560 });
      run(cover, [
        { clipPath: `circle(${Math.hypot(innerWidth, innerHeight)}px at ${cx}px ${cy}px)` },
        { clipPath: `circle(${b.width / 2}px at ${cx + dx}px ${cy + dy}px)` },
      ], o);
      open();
    });
    // 4) hand over to the real logo
    at(1310, finish);

    const SKIP = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    function finish() {
      timers.forEach(clearTimeout);
      SKIP.forEach((t) => removeEventListener(t, finish));
      open();
      cover.remove();
      anims.forEach((x) => x.cancel());
      root.classList.remove('is-intro');
      markAv.classList.add('is-landed');
      setTimeout(() => markAv.classList.remove('is-landed'), 1000);
    }
    SKIP.forEach((t) => addEventListener(t, finish, { passive: true }));
  }

  /* ------------------------------------------------- pixel sparks on the background
     Single LED pixels, scattered: each one lights up on its own in an empty patch of the
     black background, flickers, drifts up a little and goes out, then lights up again
     somewhere else. New spots are picked far from the pixels already lit (the best of a
     few random tries), so a handful covers the whole screen; more light up while the page
     scrolls, ahead of the scroll, where the eye is going. They live in .field, behind every
     section and scrolling with the page, never on text or images.
     Cheap by design: a fixed pool of boxes made once and reused, each placed and moved only
     by its own transform/opacity animation (no layout, the compositor plays it); a pixel's
     next life starts when its animation ends, so there is no timer loop. Phones, weaker
     machines and any device that drops frames get fewer; a hidden tab puts them all out. */
  function setupCyber() {
    const field = $('.field');
    if (!field || lite || reduceMotion || !('animate' in Element.prototype)) return;
    const RED = '#ff4d1f';
    const WHITE = '#f2efea';
    const R = (a, b) => a + Math.random() * (b - a);
    const RI = (a, b) => Math.floor(R(a, b + 1));

    // pixels lit at once per device [still, scrolling]
    const FULL = [16, 26], LESS = [10, 16], PHONE = [7, 12];
    let weak = false;
    const thin = () => { weak = true; field.dataset.sparks = 'less'; };
    if ((navigator.hardwareConcurrency || 8) < 8 || (navigator.deviceMemory || 8) < 8) thin();
    const tier = () => (!mqDesktop.matches ? PHONE : weak ? LESS : FULL);

    // a desktop that can't hold 40 fps while the sparks run (two slow readings in a row,
    // at most four 1.5 s readings, taken while the page is still) gets fewer pixels
    let probes = 0, slowRuns = 0, probing = false, probedAt = -1e4;
    function probe() {
      if (weak || probing || probes >= 4 || !mqDesktop.matches || performance.now() - probedAt < 8000) return;
      probing = true;
      probes++;
      let n = 0;
      const t0 = performance.now();
      const f = (t) => {
        if (document.hidden) { probing = false; return; }
        n++;
        if (t - t0 < 1500) { requestAnimationFrame(f); return; }
        probing = false;
        probedAt = t;
        if ((n * 1000) / (t - t0) >= 40) slowRuns = 0;
        else if (++slowRuns >= 2) thin();
      };
      requestAnimationFrame(f);
    }

    // empty background only: the page itself, or a bare layout box with no text and no fill
    const SKIP = 'a,button,p,h1,h2,h3,li,dt,dd,img,picture,video,figure,input,label,blockquote,.hero,.topbar,.dock,.pr__stage,.peek,.intro,.card,.about__intro';
    const isEmpty = (x, y) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return false;
      if (el === root || el === document.body) return true;
      if (el.closest(SKIP)) return false;
      for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return false;
      return getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)';
    };
    // the pixel, its glow on both sides and the way up it drifts
    const PROBES = [[0, 0], [-12, 0], [12, 0], [0, 12], [0, -36]];
    const GAP = 70;                                       // never two lit pixels closer than this
    const lit = new Map();                                // pixel -> its spot on the page
    // a free spot in the viewport, as far as it gets from the lit pixels; while scrolling,
    // in the part of the screen the page is scrolling into
    function spot(dir) {
      let lo = 90, hi = innerHeight - 30;
      if (hi - lo < 60 || innerWidth < 80) return null;
      if (dir > 0) lo = Math.max(lo, innerHeight * 0.4);
      if (dir < 0) hi = Math.min(hi, innerHeight * 0.6);
      let best = null, far = GAP * GAP;
      for (let k = 6; k > 0; k--) {
        const x = R(16, innerWidth - 16), y = R(lo, hi);
        const px = x + scrollX, py = y + scrollY;
        let d = Infinity;
        for (const q of lit.values()) d = Math.min(d, (q.x - px) ** 2 + (q.y - py) ** 2);
        if (d <= far || !PROBES.every(([dx, dy]) => isEmpty(x + dx, y + dy))) continue;
        best = { x: px, y: py };
        far = d;
      }
      return best;
    }

    // the pool: made once, sizes and colours mixed, every box reused for life after life
    const pool = [], idle = [];
    function make() {
      const p = document.createElement('i');
      const c = Math.random() < 0.15 ? RI(5, 6) : RI(2, 4);
      p.className = 'cy';
      p.style.cssText = `width:${c}px;height:${c}px;color:${Math.random() < 0.3 ? WHITE : RED}`;
      field.appendChild(p);
      pool.push(p);
      return p;
    }

    let lastY = scrollY, dir = 0, scrolledAt = -1e4, queued = false;
    const moving = () => performance.now() - scrolledAt < 350;
    const want = () => tier()[+moving()];

    // one life: snaps on, flickers like an LED, drifts up and goes out (some blink out).
    // No free spot on screen right now (a full section): it looks again a little later
    // the hero fills the screen: there is no background to light until the page scrolls
    // (the scroll handler fills them in again), so nothing searches the screen meanwhile
    const heroFills = () => !!hero && !isCase && scrollY + innerHeight - 30 <= hero.offsetTop + hero.offsetHeight;
    function light(p, delay = 0) {
      clearTimeout(p.wait);
      if (document.hidden || root.classList.contains('is-intro') || lit.size >= want() || heroFills()) { rest(p); return; }
      const at = spot(moving() ? dir : 0);
      if (!at) { rest(p); idle.splice(idle.indexOf(p), 1); p.wait = setTimeout(() => light(p), R(400, 1000)); return; }
      lit.set(p, at);
      const T = R(2200, 4200), rise = R(8, 32), sway = R(-4, 4);
      const pos = (u) => `translate(${(at.x + sway * u).toFixed(1)}px,${(at.y - rise * u).toFixed(1)}px)`;
      const out = Math.random() < 0.3
        ? [{ opacity: 0.9, offset: 0.86 }, { opacity: 0, offset: 0.9 }, { opacity: 0.8, offset: 0.94 }]
        : [{ opacity: 0.85, offset: 0.7 }];
      const kf = [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.05 }, { opacity: 0.3, offset: 0.09 }, { opacity: 1, offset: 0.14 }, ...out, { opacity: 0, offset: 1 }];
      kf.forEach((k) => (k.transform = pos(k.offset)));
      if (p.anim) p.anim.cancel();
      p.anim = p.animate(kf, { duration: T, delay, easing: 'linear' });
      p.anim.onfinish = () => { lit.delete(p); light(p); };
      if (!moving()) probe();
    }
    function rest(p) {
      clearTimeout(p.wait);
      lit.delete(p);
      if (p.anim) { p.anim.cancel(); p.anim = null; }
      if (!idle.includes(p)) idle.push(p);
    }
    // bring the lit pixels up to the count wanted now; staggered, so they never come on together
    function fill(spread) {
      let n = want() - lit.size;
      while (n-- > 0) {
        const p = idle.pop() || (pool.length < tier()[1] ? make() : null);
        if (!p) return;
        light(p, R(0, spread));
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pool.forEach(rest);
      else fill(1500);
    });
    addEventListener('scroll', () => {
      const y = scrollY;
      if (y !== lastY) dir = y > lastY ? 1 : -1;
      lastY = y;
      scrolledAt = performance.now();
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        // pixels the page has carried far off screen start their next life in view
        const top = scrollY - 100, bottom = scrollY + innerHeight + 100;
        for (const [p, at] of lit) if (at.y < top || at.y > bottom) { lit.delete(p); light(p, R(0, 200)); }
        fill(300);
      });
    }, { passive: true });
    setTimeout(() => fill(2500), 1200);
  }

  /* ------------------------------------ red ambience behind section headings */
  function setupLit() {
    const els = $$('[data-lit]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-lit')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-lit');
      io.unobserve(en.target);
    }), { rootMargin: '400px 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* ------------------------------------ in-page links land on the section's top */
  // Sections that skip their rendering until they come near (content-visibility) only have a
  // guessed height at the click, which throws the jump off by hundreds of pixels; they are
  // laid out for real before the browser works out where to scroll, then go back to skipping
  // (their real size stays remembered, so nothing moves)
  function setupJumps() {
    const lazy = $$('main > section').filter((s) => getComputedStyle(s).contentVisibility === 'auto');
    if (!lazy.length) return;
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      const id = a && a.getAttribute('href').slice(1);
      if (!id || !document.getElementById(id)) return;
      lazy.forEach((s) => (s.style.contentVisibility = 'visible'));
      requestAnimationFrame(() => requestAnimationFrame(() => lazy.forEach((s) => (s.style.contentVisibility = ''))));
    }, true);
  }

  /* ------------------------------------------------ about: the portrait, the intro, the cards
     While About is on screen REC blinks and the clients keep moving; the first full look
     brings everything in one after another (CSS, one screen only) and the numbers count
     up once they're in view. Over a card, a soft light follows the pointer */
  function setupAbout() {
    const sec = $('#about');
    if (!sec) return;
    ['.about__photo', '.about__intro', '.card--xp', '.card--do', '.card--kit', '.card--edu', '.card--clients'].forEach((q, i) => {
      const el = $(q, sec);
      if (el) el.style.setProperty('--i', i);
    });
    const show = (on, full) => {
      sec.classList.toggle('is-on', on);
      if (full) sec.classList.add('is-seen');
    };
    // the numbers: from 0 up to what they say, easing out
    const nums = $$('.stats b[data-n]', sec);
    const count = () => nums.forEach((b, k) => {
      const n = +b.dataset.n, txt = b.firstChild, t0 = performance.now() + k * 120;
      txt.nodeValue = '0';
      const step = (t) => {
        const p = Math.max(0, Math.min(1, (t - t0) / 1100));
        txt.nodeValue = Math.round(n * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    if (mqHover.matches && !reduceMotion) {
      let card = null, x = 0, y = 0, raf = 0;
      sec.addEventListener('pointermove', (e) => {
        card = e.target.closest('.card');
        if (!card) return;
        x = e.clientX;
        y = e.clientY;
        if (!raf) raf = requestAnimationFrame(() => {
          raf = 0;
          const r = card.getBoundingClientRect();
          card.style.setProperty('--mx', x - r.left + 'px');
          card.style.setProperty('--my', y - r.top + 'px');
        });
      });
    }
    if (!('IntersectionObserver' in window)) return show(true, true);
    new IntersectionObserver(([en]) => show(en.isIntersecting, en.intersectionRatio >= 0.5), { threshold: [0, 0.5] }).observe(sec);
    const stats = $('.stats', sec);
    if (stats && nums.length && !lite) {
      const io = new IntersectionObserver(([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        count();
      }, { threshold: 0.6 });
      io.observe(stats);
    }
  }

  /* ---------------------------------------------------------- timecode/clock
     Hours, minutes and seconds are text that changes once a second; the frames (00–24) are a
     strip of 25 numbers that a CSS animation steps on the compositor (css: .tc__ff), so the
     running timecode never re-lays-out and repaints the page 25 times a second. The strip
     stops with the hero's other loops when the hero is out of view, and so does the count. */
  const pad = (n) => String(n).padStart(2, '0');
  if (!reduceMotion) $$('[data-tc]').forEach((el) => {
    const hms = document.createElement('span');
    const ff = document.createElement('span');
    hms.textContent = '00:00:00';
    ff.className = 'tc__ff';
    ff.innerHTML = '<span>' + Array.from({ length: 25 }, (_, i) => pad(i)).join('<br>') + '</span>';
    el.replaceChildren(hms, ':', ff);
    // every lap of the strip is a second; elapsedTime counts only the time it has run
    ff.addEventListener('animationiteration', (e) => {
      const s = Math.round(e.elapsedTime);
      hms.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    });
  });
  const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit', hour12: false });
  const clock = () => { const t = clockFmt.format(new Date()); $$('[data-clock]').forEach((el) => (el.textContent = t)); };
  clock();
  setInterval(clock, 20000);

  /* ---------------------------------------------------------- copy email */
  $$('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const hint = $('[data-copy-hint]', b);
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        b.classList.add('is-copied');
        hint.textContent = 'Copied. Talk soon.';
        setTimeout(() => { b.classList.remove('is-copied'); hint.textContent = 'Click to copy'; }, 2400);
      } catch {
        location.href = 'mailto:' + b.dataset.copy;
      }
    })
  );

  /* ------------------------------------------------- contact: quick brief
     Three taps build an email: what, when, send. The send link is a plain mailto that works
     on its own; the taps only fill in its subject and body, so nothing leaves the page.
     Beside it: the avatar from the top bar (cloned before setupAvatar, so it blinks too) and
     an honest reply time, by the hour in Belgrade. */
  function setupContact() {
    const slot = $('[data-av-slot]');
    const av = $('.mark__av svg');
    if (slot && av) {
      const c = av.cloneNode(true);
      $('clipPath', c).id = 'av-clip-ct';
      $('[clip-path]', c).setAttribute('clip-path', 'url(#av-clip-ct)');
      slot.prepend(c);
    }
    const pres = $('[data-presence]');
    if (pres) {
      const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: 'numeric', hourCycle: 'h23' });
      const say = () => {
        const now = new Date();
        const h = +hourFmt.format(now);
        const day = h >= 9 && h < 21;
        if (slot) slot.classList.toggle('is-away', !day);
        pres.textContent = `${clockFmt.format(now)} in Belgrade · ${day ? 'usually replies within a day' : 'replies in the morning'}`;
      };
      say();
      setInterval(say, 60000);
    }

    const qb = $('[data-brief]');
    if (!qb) return;
    const send = $('[data-send]', qb);
    const subj = $('[data-subject]', qb);
    const to = send.getAttribute('href').split('?')[0];
    const groups = $$('.qb__chips', qb);
    function update() {
      const picked = groups.map((g) => $$('[aria-pressed="true"]', g).map((b) => b.textContent.trim()));
      const [need, when] = picked;
      groups.forEach((g, i) => g.closest('.qb__q').classList.toggle('is-done', picked[i].length > 0));
      qb.classList.toggle('is-armed', need.length > 0);
      const s = need.length ? `Brief: ${need.join(' + ')}${when.length ? ` (${when[0].toLowerCase()})` : ''}` : 'Project brief';
      const body = [
        'Hi Boško,', '',
        `What I need: ${need.join(', ') || '…'}`,
        `When: ${when[0] || '…'}`, '',
        'A few words about the project:', '', '',
        'Links or references:', '', '',
        'Budget (optional):', '', '',
        'Thanks,', '',
      ].join('\r\n');
      send.href = `${to}?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(body)}`;
      subj.textContent = need.length ? `Subject: ${s}` : 'Opens your email with the brief filled in';
    }
    groups.forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('.qb__chip');
      if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      if (g.dataset.pick === 'one') $$('.qb__chip', g).forEach((c) => c.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', String(on));
      update();
    }));
    update();
    send.addEventListener('click', () => { if (window.gtag) window.gtag('event', 'generate_lead', { method: 'quick_brief' }); });

    // the same soft pointer light as the About cards
    if (mqHover.matches && !reduceMotion) {
      let x = 0, y = 0, raf = 0;
      qb.addEventListener('pointermove', (e) => {
        x = e.clientX;
        y = e.clientY;
        if (!raf) raf = requestAnimationFrame(() => {
          raf = 0;
          const r = qb.getBoundingClientRect();
          qb.style.setProperty('--mx', x - r.left + 'px');
          qb.style.setProperty('--my', y - r.top + 'px');
        });
      });
    }
  }

  /* --------------------------------------------------- dialog helpers */
  function openDialog(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function closeDialog(d) {
    $$('video', d).forEach((v) => v.pause());
    if (d.close) d.close(); else d.removeAttribute('open');
  }

  /* ================================================================ HOME */
  function setupHome() {
    if (!hero) return;

    /* fit the name to the full width */
    function fitName() {
      $$('[data-fit]').forEach((el) => {
        const parent = el.parentElement;
        const cs = getComputedStyle(parent);
        const avail = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        el.style.fontSize = '100px';
        el.style.width = 'max-content';
        const w = el.offsetWidth;
        el.style.width = '';
        el.style.fontSize = Math.floor(((100 * avail) / w) * 0.995) + 'px';
      });
    }

    /* the wall director: a few screens run at once; every ~1.7 s it "cuts"
       to another one, and the red tally marks the latest cut */
    const projTpl = {}; // projects that open in place (see "projects" below)
    let proj = null; // the one that is open
    $$('template[data-proj]').forEach((t) => (projTpl[t.dataset.proj] = t));
    const tiles = $$('.tile');
    // only the projects' screens (.s) run; the older work around them stays a still, standby wall
    const videoTiles = tiles.filter((t) => t.dataset.video && t.classList.contains('s'));
    const MAX_LIVE = (navigator.hardwareConcurrency || 4) >= 8 ? 6 : 4;
    let live = [];
    let timer = null;
    let tally = null;
    const inView = (el) => {
      const r = el.getBoundingClientRect();
      return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
    };
    const ownVideo = (t) => t.querySelector('video:not(.fx-static)');
    function tileVideo(t) {
      let v = ownVideo(t);
      if (!v) {
        v = makeVideo(LOOPS + t.dataset.video + '.mp4');
        v.addEventListener('playing', () => t.classList.add('has-video'), { once: true });
        t.appendChild(v);
      }
      return v;
    }
    // a held screen (data-hold: the newest project) is always on air, outside the rotation
    const held = videoTiles.filter((t) => t.hasAttribute('data-hold'));
    const holdOn = () => held.forEach((t) => { const v = tileVideo(t); if (v.paused) play(v); });
    function goLive(t) {
      play(tileVideo(t));
      live.push(t);
      if (tally) tally.classList.remove('is-tally');
      tally = t;
      t.classList.add('is-tally');
      flashStatic(t);
    }
    const goOff = (t) => { const v = ownVideo(t); if (v) v.pause(); };

    /* every cut gets a burst of TV static (one shared 30 KB clip) */
    let staticV = null, staticTile = null, staticT = 0;
    function flashStatic(t) {
      if (!staticV) {
        staticV = makeVideo(FX + 'static.mp4');
        staticV.className = 'fx-static';
      }
      if (staticTile) staticTile.classList.remove('is-cut');
      staticTile = t;
      t.appendChild(staticV);
      if (staticV.readyState >= 1) staticV.currentTime = Math.random() * 0.6;
      play(staticV);
      t.classList.add('is-cut');
      clearTimeout(staticT);
      staticT = setTimeout(() => { t.classList.remove('is-cut'); staticV.pause(); }, 380);
    }

    /* the focus reticle locks on to the screen under the cursor and names it (css: .hud__tag) */
    const tag = document.createElement('span');
    tag.className = 'hud__tag';
    tag.setAttribute('aria-hidden', 'true');
    hero.appendChild(tag);
    tiles.forEach((t) => {
      t.addEventListener('mouseenter', () => { tag.textContent = t.dataset.label; hero.classList.add('is-aim'); });
      t.addEventListener('mouseleave', () => hero.classList.remove('is-aim'));
    });

    function cut() {
      if (document.hidden || !heroVisible || proj) return;
      holdOn();
      const cand = videoTiles.filter((t) => !live.includes(t) && !held.includes(t) && inView(t));
      if (!cand.length) return;
      goLive(cand[(Math.random() * cand.length) | 0]);
      while (live.length > MAX_LIVE) goOff(live.shift());
    }
    function startDirector() {
      if (timer || lite || !mqDesktop.matches) return;
      holdOn();
      cut();
      setTimeout(cut, 500);
      setTimeout(cut, 1000);
      timer = setInterval(cut, 1700);
    }
    function stopDirector() {
      clearInterval(timer);
      timer = null;
      live.forEach(goOff);
      held.forEach(goOff);
      live = [];
    }
    tiles.forEach((t) => {
      t.style.setProperty('--d', Math.round(Math.random() * 900) + 'ms');
      // take: a flash on the screen and the reticle snapping shut, then the cut to the case
      t.addEventListener('click', () => {
        const own = projTpl[t.dataset.project] ? t.dataset.project : '';
        const slug = CASES[t.dataset.project];
        if ((!own && !slug) || hero.classList.contains('is-take') || proj) return;
        t.classList.add('is-take');
        hero.classList.add('is-take');
        setTimeout(() => (own ? openProject(own, t) : go('work/' + slug + '/')), reduceMotion ? 0 : 160);
      });
    });

    /* spotlight + parallax. Each moving part gets its own property on its own layer
       (nothing on .hero itself, which every element below would inherit), so a frame
       restyles six elements and repaints only the name's extrusion */
    const plane = $('.wall__plane', hero);
    const spot = $('.hero__spot', hero);
    const focus = $('.hud__focus', hero);
    const name = $('.name', hero);
    const faces = $$('.name__t', name);
    // a copy of each word on its own layer beside the face (css: .name__x, .name__sh), made when first needed
    const copy = (cls) => faces.map((f) => {
      const c = document.createElement('span');
      c.className = cls;
      c.setAttribute('aria-hidden', 'true');
      c.textContent = f.dataset.t;
      f.after(c);
      return c;
    });
    let swing = null, sheen = null;
    let mx = innerWidth * 0.7, my = innerHeight * 0.4, cx = mx, cy = my, raf = 0, ex = '', ey = '';
    function loop() {
      cx += (mx - cx) * 0.12;
      cy += (my - cy) * 0.12;
      const at = cx.toFixed(1) + 'px ' + cy.toFixed(1) + 'px';
      const nx = cx / innerWidth - 0.5;
      const ny = cy / innerHeight - 0.5;
      spot.style.translate = at;
      if (focus) focus.style.translate = at;
      tag.style.translate = at;
      plane.style.setProperty('--px', (nx * -36).toFixed(2) + 'px');
      plane.style.setProperty('--py', (ny * -24).toFixed(2) + 'px');
      if (!lite) {
        // the name turns to face the cursor; its extrusion swings the other way
        // (the extrusion is the one thing that repaints, so only when it really moves)
        if (!swing) { swing = copy('name__x'); name.classList.add('has-swing'); }
        name.style.transform = `perspective(1600px) rotateX(${(-ny * 7).toFixed(2)}deg) rotateY(${(nx * 10).toFixed(2)}deg)`;
        const x = (-nx * 1.8).toFixed(2), y = (0.55 - ny * 1.1).toFixed(2);
        if (x !== ex || y !== ey) {
          ex = x; ey = y;
          swing.forEach((s) => { s.style.setProperty('--ex', x); s.style.setProperty('--ey', y); });
        }
      }
      raf = Math.abs(mx - cx) + Math.abs(my - cy) > 0.5 ? requestAnimationFrame(loop) : 0;
    }
    /* a light sweep across the chrome name now and then */
    setInterval(() => {
      if (lite || document.hidden || !heroVisible || proj || !mqDesktop.matches || !hero.classList.contains('is-on')) return;
      if (!sheen) sheen = copy('name__sh').map((c) => {
        // the word inside the box that carries the band (css: .name__sh > span)
        const band = document.createElement('span');
        const word = document.createElement('span');
        word.textContent = c.textContent;
        band.appendChild(word);
        c.replaceChildren(band);
        return c;
      });
      requestAnimationFrame(() => name.classList.add('is-sheen'));
    }, 6500);
    name.addEventListener('animationend', (e) => { if (e.animationName === 'sheen') name.classList.remove('is-sheen'); });

    /* living glow: red flares light up random spots behind the letters (capable desktops) */
    if (!lite && mqDesktop.matches && 'animate' in Element.prototype) {
      const fx = document.createElement('span');
      fx.className = 'name__fx';
      fx.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 6; i++) fx.appendChild(document.createElement('i'));
      name.prepend(fx);
      name.classList.add('has-flares');
      const free = $$('i', fx);
      const flare = () => {
        setTimeout(flare, 260 + Math.random() * 700);
        if (document.hidden || !heroVisible || proj || !hero.classList.contains('is-on') || !free.length) return;
        const f = free.pop();
        const x = Math.random() * fx.clientWidth;
        const y = fx.clientHeight * (0.35 + Math.random() * 0.4);
        const s = 0.6 + Math.random() * 0.6;
        const sx = 1 + Math.random() * 0.6;
        const at = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) `;
        f.animate([
          { opacity: 0, transform: at + `scale(${(s * sx * 0.6).toFixed(3)}, ${(s * 0.6).toFixed(3)})` },
          { opacity: 0.45 + Math.random() * 0.55, transform: at + `scale(${(s * sx).toFixed(3)}, ${s.toFixed(3)})`, offset: 0.3 },
          { opacity: 0, transform: at + `scale(${(s * sx * 1.15).toFixed(3)}, ${(s * 1.1).toFixed(3)})` },
        ], { duration: 1200 + Math.random() * 1600, easing: 'ease-in-out' }).finished.then(() => free.push(f), () => free.push(f));
      };
      flare();
    }

    hero.addEventListener('pointermove', (e) => {
      if (!mqHover.matches || reduceMotion || proj) return;
      mx = e.clientX;
      my = e.clientY;
      if (!raf) raf = requestAnimationFrame(loop);
    });

    /* mobile: vertical reel behind the hero. The biggest file on the page, so it loads only
       once the page has settled and the hero is in view; a data saver or a slow connection
       keeps the poster (unless the visitor asked for motion with the lite chip). */
    let reelReady = false, motionAsked = false;
    const slowNet = () => !!conn.saveData || /(^|-)[23]g$/.test(conn.effectiveType || '') || (conn.downlink > 0 && conn.downlink < 1);
    function startMobileReel() {
      if (!reelReady || mqDesktop.matches || lite || !heroOnScreen) return;
      if (slowNet() && !motionAsked) return;
      const box = $('.hero__reel');
      if (!box || box.querySelector('video')) return;
      const v = makeVideo('media/reel/mobile-reel.mp4');
      v.addEventListener('playing', () => box.classList.add('has-video'), { once: true });
      box.appendChild(v);
      play(v);
    }

    /* mobile: play the feed card that is in view */
    let feedReady = false;
    function setupFeed() {
      if (feedReady || mqDesktop.matches || lite || !('IntersectionObserver' in window)) return;
      feedReady = true;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          const img = en.target.querySelector('img[data-vsrc]');
          if (!img) return;
          let v = en.target.querySelector('video');
          if (en.isIntersecting) {
            if (!v) {
              v = makeVideo(LOOPS + img.dataset.vsrc + '.mp4');
              en.target.appendChild(v);
            }
            play(v);
          } else if (v) v.pause();
        });
      }, { threshold: 0.55 });
      $$('.row__media').forEach((m) => io.observe(m));
    }

    /* desktop: floating preview that follows the cursor over the rundown */
    const peek = $('.peek');
    const peekInner = $('.peek__inner');
    let px = -999, py = -999, tx = -999, ty = -999, praf = 0, peekVideo = null;
    function peekLoop() {
      px += (tx - px) * 0.16;
      py += (ty - py) * 0.16;
      peek.style.setProperty('--x', px.toFixed(1) + 'px');
      peek.style.setProperty('--y', py.toFixed(1) + 'px');
      praf = Math.abs(tx - px) + Math.abs(ty - py) > 0.5 ? requestAnimationFrame(peekLoop) : 0;
    }
    function placePeek(e) {
      const w = peek.offsetWidth, h = peek.offsetHeight;
      tx = e.clientX + 28 + w > innerWidth ? e.clientX - w - 28 : e.clientX + 28;
      ty = Math.min(Math.max(e.clientY - h / 2, 72), innerHeight - h - 16);
      if (px < -900) { px = tx; py = ty; }
      if (!praf) praf = requestAnimationFrame(peekLoop);
    }
    $$('.row').forEach((row) => {
      row.addEventListener('mouseenter', (e) => {
        if (!mqHover.matches || !mqDesktop.matches) return;
        peekInner.textContent = '';
        peek.classList.remove('is-vert', 'is-square');
        const slug = row.dataset.preview;
        if (slug && !lite) {
          const v = peekVideo = makeVideo(LOOPS + slug + '.mp4');
          v.addEventListener('loadedmetadata', () => { // the pointer may have left the row by now
            const r = v.videoWidth / v.videoHeight;
            peek.classList.toggle('is-vert', r < 0.8);
            peek.classList.toggle('is-square', r >= 0.8 && r <= 1.2);
          }, { once: true });
          const poster = new Image();
          poster.src = LOOPS + slug + '.webp';
          peekInner.append(poster, peekVideo);
          play(peekVideo);
        } else {
          const src = row.querySelector('.row__media img');
          const img = new Image();
          img.src = src.currentSrc || src.src;
          const r = +src.getAttribute('width') / +src.getAttribute('height');
          peek.classList.toggle('is-vert', r < 0.8);
          peek.classList.toggle('is-square', r >= 0.8 && r <= 1.2);
          peekInner.append(img);
        }
        placePeek(e);
        peek.classList.add('is-on');
      });
      row.addEventListener('mousemove', placePeek);
      row.addEventListener('mouseleave', () => {
        peek.classList.remove('is-on');
        if (peekVideo) { peekVideo.pause(); peekVideo = null; }
      });
    });

    /* reel player */
    const dlg = $('[data-player]');
    if (dlg) {
      $$('[data-reel], [data-reel-link]').forEach((b) => b.addEventListener('click', (e) => {
        e.preventDefault();
        const frame = $('.player__frame', dlg);
        frame.textContent = '';
        const v = makeVideo('media/reel/mobile-reel.mp4');
        v.controls = true;
        frame.appendChild(v);
        openDialog(dlg);
        play(v);
      }));
      $('[data-close]', dlg).addEventListener('click', () => closeDialog(dlg));
      dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(dlg); });
      dlg.addEventListener('close', () => { $$('video', dlg).forEach((v) => v.pause()); });
    }

    /* the playhead steps one device pixel at a time across the track (css: .bar__head) */
    const track = $('.bar__track', hero);
    if (track) {
      const steps = () => {
        const n = Math.max(1, Math.round(track.getBoundingClientRect().width * devicePixelRatio));
        track.style.setProperty('--ph-steps', n);
        track.style.setProperty('--ph-w', n / devicePixelRatio + 'px');
      };
      if ('ResizeObserver' in window) new ResizeObserver(steps).observe(track); else steps();
    }

    /* phone: the viewfinder frame ends above the text block (css: .hud --ch) */
    const hud = $('.hud', hero), content = $('.hero__content', hero);
    if (hud && content && 'ResizeObserver' in window) {
      new ResizeObserver(() => hud.style.setProperty('--ch', content.offsetHeight + 'px')).observe(content);
    }

    /* lite-mode chip in the on-air bar */
    if (lite && !reduceMotion) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'lite-chip';
      chip.textContent = 'Lite mode · play motion';
      chip.addEventListener('click', () => {
        lite = false;
        motionAsked = true;
        root.classList.remove('is-lite');
        chip.remove();
        onLiteOff.forEach((f) => f());
      });
      $('.bar').insertBefore(chip, $('.bar__track'));
    }
    onLiteOff.push(startDirector, startMobileReel, setupFeed);
    // back from a case (back/forward cache): the wall is as it was before the take
    addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      hero.classList.remove('is-take');
      $$('.tile.is-take').forEach((t) => t.classList.remove('is-take'));
    });

    /* ---------------------------------------------------------------- projects
       A screen on the wall opens its project right here (markup: tools/build_projects.py,
       css: PROJECTS IN PLACE). One view transition does the move: the clicked screen grows
       into the program monitor while the wall, a single snapshot, pushes in and goes dark,
       so the 34 screens never animate themselves. While a project is open the wall is hidden
       and its loops, flares and light sweeps stop. ✕, Esc or Back put it back on the wall */
    function setOrigin(el) {
      const r = el.getBoundingClientRect();
      root.style.setProperty('--tx', Math.round(r.left + r.width / 2) + 'px');
      root.style.setProperty('--ty', Math.round(r.top + r.height / 2) + 'px');
    }
    function moveTo(cls, update) {
      if (!document.startViewTransition || lite || reduceMotion) { update(false); return Promise.resolve(); }
      root.classList.add(cls);
      const vt = document.startViewTransition(() => update(true));
      return vt.finished.catch(() => {}).finally(() => root.classList.remove(cls));
    }
    const tileFor = (slug) => $(`.tile[data-project="${slug}"][data-hold]`) || $(`.tile[data-project="${slug}"]`);
    // stop what a monitor plays (a project's own page hears "<slug>:pause")
    const hush = (box, slug) => {
      $$('video', box).forEach((v) => v.pause());
      $$('iframe', box).forEach((f) => { try { f.contentWindow.postMessage(slug + ':pause', '*'); } catch { /* gone */ } });
    };

    // what a monitor puts on program
    function piece(m, p) {
      if (m.kind === 'live') {
        const frame = () => {
          const f = document.createElement('iframe');
          f.src = m.src;
          f.title = m.label;
          f.allow = 'autoplay; microphone';
          f.referrerPolicy = 'no-referrer';
          return f;
        };
        const fromDisk = location.protocol === 'file:';
        if (!lite && !fromDisk) return frame();
        // a weak device (or reduced motion) gets the still, and the live page only on request
        const box = document.createElement('div');
        box.className = 'mv__ask';
        const im = new Image();
        im.decoding = 'async';
        im.alt = '';
        im.src = m.poster;
        if (fromDisk) { // only on the author's machine: from disk a live page can't load its data
          const note = document.createElement('p');
          note.className = 'mv__note';
          note.textContent = 'Živa strana radi preko servera: otvori sajt sa pokreni-sajt.bat';
          box.append(im, note);
          return box;
        }
        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'btn btn--live';
        go.innerHTML = '<span class="btn__play" aria-hidden="true"></span>Run it live';
        go.addEventListener('click', () => box.replaceWith(frame()));
        box.append(im, go);
        return box;
      }
      if (m.kind === 'image') {
        const im = new Image();
        im.decoding = 'async';
        im.alt = m.label || '';
        if (m.srcset) { im.srcset = m.srcset; im.sizes = m.sizes || Math.round(p.pgm.clientWidth) + 'px'; }
        im.src = m.src;
        return im;
      }
      if (m.kind === 'set') {
        const box = document.createElement('div');
        box.className = 'mv__set';
        box.style.setProperty('--cols', m.cols);
        box.style.setProperty('--rows', Math.ceil(m.items.length / m.cols));
        // pieces of one shape: the cells hug them, so every gutter is the same (css: .is-fit)
        const ar = m.items.map((it) => it.w / it.h);
        if (ar.every((a) => a > 0 && Math.abs(a / ar[0] - 1) < 0.02)) {
          box.classList.add('is-fit');
          box.style.setProperty('--ar', ar[0].toFixed(4));
        }
        const cellW = Math.round(p.pgm.clientWidth / m.cols) + 'px';
        m.items.forEach((it) => {
          const c = document.createElement('button');
          c.type = 'button';
          c.className = 'mv__cell';
          c.setAttribute('aria-label', 'Enlarge');
          c.appendChild(piece({ ...it, sizes: cellW, label: '' }, p));
          c.addEventListener('click', () => {
            const solo = !c.classList.contains('is-pick');
            $$('.mv__cell', box).forEach((x) => x.classList.toggle('is-pick', solo && x === c));
            box.classList.toggle('is-solo', solo);
            const im = c.querySelector('img');
            if (im && solo) im.sizes = Math.round(p.pgm.clientWidth) + 'px';
          });
          box.appendChild(c);
        });
        return box;
      }
      const v = makeVideo(m.src);
      v.poster = m.poster;
      if (m.kind === 'film') { // once, with its sound (the click is the permission) and controls
        v.loop = false;
        v.removeAttribute('muted');
        v.muted = false;
        v.controls = true;
      }
      play(v);
      return v;
    }
    function showOn(p, i, flash = true) {
      const m = p.mons[i];
      hush(p.screen, p.slug);
      // the wall's own loop goes back on as it was
      const el = m.kind === 'loop' && p.tv ? p.tv : piece(m, p);
      if (el === p.tv) play(el);
      p.screen.replaceChildren(el);
      p.screen.className = 'mv__screen is-' + m.fit;
      p.pgm.classList.toggle('is-live', m.kind === 'live');
      p.umd.textContent = m.label;
      $$('.mv__mon', p.el).forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
      p.cur = i;
      if (flash) {
        p.pgm.classList.remove('is-cut');
        void p.pgm.offsetWidth;
        p.pgm.classList.add('is-cut');
      }
    }

    function openProject(slug, tile, how = 'push') {
      const tpl = projTpl[slug];
      if (!tpl || proj) return;
      if (scrollY > 0) scrollTo({ top: 0, behavior: 'instant' });
      const el = tpl.content.firstElementChild.cloneNode(true);
      const p = proj = {
        slug, el, tile, tv: null, cur: 0,
        mons: JSON.parse($('script[data-mons]', el).textContent),
        pgm: $('.proj__pgm', el), screen: $('[data-screen]', el), umd: $('[data-umd]', el),
      };
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cut]');
        if (b) showOn(p, +b.dataset.cut - 1);
        else if (e.target.closest('[data-proj-close]')) back();
      });
      if (tile) { setOrigin(tile); tile.style.viewTransitionName = 'take'; }
      moveTo('vt-open', (animated) => {
        if (tile) tile.style.viewTransitionName = '';
        if (animated) p.pgm.style.viewTransitionName = 'take';
        hero.classList.remove('is-take', 'is-aim');
        $$('.tile.is-take').forEach((t) => t.classList.remove('is-take'));
        // the screen's loop carries on in the monitor, from the frame it is on
        const tv = tile && ownVideo(tile);
        const running = tv && !tv.paused && p.mons[0].kind === 'loop' && tv.currentSrc.endsWith(p.mons[0].src);
        stopDirector();
        if (running) { p.tv = tv; p.screen.replaceChildren(tv); play(tv); } else showOn(p, 0, false);
        hero.appendChild(el);
        hero.classList.add('is-open');
        root.classList.add('is-proj');
        el.classList.add(animated ? 'is-in' : 'is-fade');
      }).then(() => {
        p.pgm.style.viewTransitionName = '';
        if (proj === p) el.focus({ preventScroll: true });
      });
      if (how === 'push') history.pushState({ proj: slug }, '', '#' + slug);
      else if (how === 'link') history.replaceState({ proj: slug, link: true }, '', '#' + slug);
    }
    function closeProject() {
      const p = proj;
      if (!p) return;
      hush(p.el, p.slug);
      proj = null;
      const tile = p.tile || tileFor(p.slug);
      p.pgm.style.viewTransitionName = 'take';
      moveTo('vt-close', () => {
        p.pgm.style.viewTransitionName = '';
        p.el.remove();
        hero.classList.remove('is-open');
        root.classList.remove('is-proj');
        if (tile) {
          if (p.tv) tile.appendChild(p.tv);
          tile.style.viewTransitionName = 'take';
          setOrigin(tile);
        }
        startDirector();
      }).then(() => { if (tile) tile.style.viewTransitionName = ''; });
    }
    // ✕ and Esc step back in history when the project added a step, so Back and ✕ agree
    function back() {
      if (history.state && history.state.proj && !history.state.link) history.back();
      else { closeProject(); history.replaceState(null, '', location.pathname + location.search); }
    }
    addEventListener('popstate', (e) => {
      const s = e.state && e.state.proj;
      if (proj && proj.slug !== s) closeProject();
      if (s && !proj && projTpl[s]) openProject(s, tileFor(s), 'none');
    });
    // a link to #slug from the page itself (or typed into the address bar)
    addEventListener('hashchange', () => {
      const s = decodeURIComponent(location.hash.slice(1));
      if (projTpl[s] && !proj) openProject(s, tileFor(s), 'none');
    });
    addEventListener('keydown', (e) => {
      if (!proj || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (e.key === 'Escape') { e.preventDefault(); back(); return; }
      if (/^(INPUT|TEXTAREA|SELECT|VIDEO)$/.test(e.target.tagName)) return;
      const n = proj.mons.length, k = +e.key;
      if (k >= 1 && k <= n) showOn(proj, k - 1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') showOn(proj, (proj.cur + (e.key === 'ArrowRight' ? 1 : n - 1)) % n);
    });

    /* observers + boot */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => {
        heroVisible = en.isIntersecting;
        document.body.classList.toggle('is-scrolled', !en.isIntersecting);
        const v = $('.hero__reel video');
        if (v) heroVisible ? play(v) : v.pause();
        if (!heroVisible) {
          live.forEach(goOff);
          held.forEach(goOff);
          live = [];
        }
      }, { threshold: 0.08 }).observe(hero);
      // all the way out of view: the hero's CSS loops pause (.is-offscreen) and the timecode stops
      new IntersectionObserver(([en]) => {
        heroOnScreen = en.isIntersecting;
        hero.classList.toggle('is-offscreen', !heroOnScreen);
        startMobileReel();
      }).observe(hero);
    }
    mqDesktop.addEventListener('change', () => {
      fitName();
      if (mqDesktop.matches) startDirector();
      else { stopDirector(); startMobileReel(); setupFeed(); }
    });
    let resizeT;
    addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(fitName, 120); });
    fitName();
    // never hold the intro hostage to a slow font request: wait at most 700 ms
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 700))]).then(() => introReveal).then(() => {
      fitName();
      requestAnimationFrame(() => hero.classList.add('is-on'));
      const linked = decodeURIComponent(location.hash.slice(1));
      if (projTpl[linked]) openProject(linked, null, 'link');
    });
    fontsReady.then(fitName);
    addEventListener('load', () => {
      setTimeout(() => { startDirector(); setupFeed(); }, reduceMotion ? 0 : 900);
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
      setTimeout(() => idle(() => { reelReady = true; startMobileReel(); }, { timeout: 3000 }), 900);
    });
  }

  /* ------------------------------------------------ process: a brief becomes four banners
     Five steps on a stage. data-step on .pr is the whole state and every step has a still
     frame in CSS. The demo plays on its own while it is on screen; a click jumps to a step.
     Full motion animates between the frames (WAAPI, transform/opacity only); lite mode, or
     a device that can't keep up, just cross-fades the still frames. The four banners come
     from one template; the cat and the toy wait inline in another (16 KB, built by
     tools/build_process.py) and go into the banners when the section gets close. */
  const PR_DUR = [0, 4400, 3600, 3700, 4300, 15800];   // 05 runs the motion loop twice

  /* the cat comes alive: a one-off intro, then a 7 s loop in which every part runs 7 s
     with keyframes at absolute times, so they all stay in sync. Pivots are set in the SVG
     (tools/build_process.py). t0 delays the whole thing. */
  function purr(bn, t0) {
    const T = 7000, INTRO = t0 + 1500;
    const SMOOTH = 'cubic-bezier(.45,0,.55,1)';
    // keyframes at absolute ms; easing per segment (pose to pose), the animation runs linear
    const at = (list, len = T, easing = SMOOTH) => list.map(([ms, p]) => ({ offset: Math.min(1, ms / len), easing, ...p }));
    const run = (el, frames, o) => el && el.animate(frames, { fill: 'both', easing: 'linear', ...o });
    // 'forwards': while the intro runs, a loop leaves its part alone
    const loop = (el, list, fill = 'forwards', ease) => run(el, at(list, T, ease), { duration: T, delay: INTRO, iterations: Infinity, fill });
    const tr = (list) => list.map(([ms, v]) => [ms, { transform: v }]);
    const rot = (list) => list.map(([ms, a]) => [ms, { transform: `rotate(${a}deg)` }]);
    const svg = $('.bn__cat svg', bn), toy = $('.bn__toy svg', bn);
    const c = (n) => svg && $('.c-' + n, svg);

    /* intro: the box hops, the cat comes up, paws over the rim, the copy pops in */
    if (svg) {
      svg.style.transformOrigin = '50% 100%';
      run(svg, at([[0, { transform: 'none' }], [120, { transform: 'scale(1.03,.94)' }], [330, { transform: 'translateY(-4%) scale(.97,1.04)' }],
        [520, { transform: 'scale(1.03,.96)' }], [660, { transform: 'none' }]], 660), { duration: 660, delay: t0 });
      run(c('cat'), at([[0, { transform: 'translateY(460px)' }], [250, { transform: 'translateY(460px)' }], [640, { transform: 'translateY(-34px)' }],
        [790, { transform: 'translateY(8px)' }], [900, { transform: 'none' }]], 900), { duration: 900, delay: t0 });
      for (const [side, d] of [['L', 700], ['R', 860]]) {
        const f = at([[0, { transform: 'translateY(-90px)', opacity: 0 }], [110, { transform: 'translateY(-50px)', opacity: 1 }],
          [240, { transform: 'translateY(6px)', opacity: 1 }], [320, { transform: 'none', opacity: 1 }]], 320);
        run(c(`paw${side}w`), f, { duration: 320, delay: t0 + d });
        run(c(`arm${side}w`), f.map(({ opacity, ...k }) => k), { duration: 320, delay: t0 + d });
      }
      run(c('pawRshw'), [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: t0 + 1100 });
    }
    const pop = (el, d, from = 'translateY(40%) scale(.6)') => run(el, at([[0, { transform: from, opacity: 0 }],
      [290, { transform: 'scale(1.08)', opacity: 1 }], [420, { transform: 'none', opacity: 1 }]], 420), { duration: 420, delay: t0 + d });
    pop($('.bn__logo', bn), 200);
    $$('.bn__head span', bn).forEach((s, i) => pop(s, 380 + i * 90));
    pop($('.bn__sub', bn), 900, 'translateY(30%)');
    run($('.bn__sticker', bn), at([[0, { transform: 'rotate(-200deg) scale(0)' }], [390, { transform: 'rotate(-4deg) scale(1.1)' }],
      [520, { transform: 'rotate(-12deg) scale(1)' }]], 520), { duration: 520, delay: t0 + 1050 });
    pop($('.bn__cta', bn), 1250);
    if (!svg) return;

    // the toy swings in from off-frame, settles, is swatted at 3.65 s, settles, is pulled away
    const SW = [[0, -38], [300, -38], [1000, 6], [1600, -4], [2100, 2.4], [2600, -1.2], [3000, 0], [3640, 0],
      [3900, -22], [4500, 6], [5000, -3.5], [5450, 1.8], [5850, -0.8], [6250, 0], [6500, 0], [7000, -38]];
    if (toy) {
      loop($('.t-swing', toy), rot(SW), 'both');
      loop($('.t-feather', toy), SW.map(([ms, a], i) => [ms, { transform: `rotate(${-(a - (SW[i - 1] || SW[0])[1]) * 0.6}deg)` }]));
    }
    // pupils follow the feather (it hangs right of the face), widen while stalking, narrow after
    const look = (a) => Math.max(-14, Math.min(22, 12 - Math.sin(a * Math.PI / 180) * 90));
    const dil = (ms) => (ms < 1300 ? 1 : ms < 1900 ? 1.25 : ms < 3640 ? 1.3 : ms < 3900 ? 1.05 : ms < 6000 ? 0.9 : 1);
    const LID = [[0, 0], [380, 0], [450, 152], [530, 0], [620, 0], [690, 152], [770, 0], [4500, 0], [4900, 96], [5600, 96], [6000, 0],
      [6550, 0], [6620, 152], [6700, 0], [7000, 0]];
    for (const s of ['L', 'R']) {
      loop(c('pupil' + s), SW.map(([ms, a]) => {
        const off = Math.abs(a) > 30;                         // toy off-frame: look ahead
        return [ms, { transform: `translate(${off ? 0 : look(a)}px,${off ? 0 : -9}px) scale(${dil(ms)})` }];
      }));
      loop(c('lid' + s), LID.map(([ms, y]) => [ms, { transform: `translateY(${y}px)` }]));
    }
    // head: tilts to the toy, crouches while stalking, pops up on the swat, tilts happy
    loop(c('head'), tr([[0, 'none'], [1300, 'none'], [1700, 'rotate(4deg)'], [2300, 'translateY(20px) rotate(5deg)'], [3520, 'translateY(26px) rotate(6deg)'],
      [3650, 'translateY(-16px) rotate(-2deg)'], [3950, 'translateY(-4px) rotate(-1deg)'], [4400, 'rotate(-5deg)'], [5900, 'rotate(-5deg)'], [6500, 'none'], [7000, 'none']]));
    loop(c('earR'), rot([[0, 0], [800, 0], [880, 14], [990, -3], [1080, 0], [2300, 0], [2500, 9], [3600, 9], [3800, 0], [5200, 0], [5280, 12], [5400, 0], [7000, 0]]));
    loop(c('earL'), rot([[0, 0], [2300, 0], [2500, -9], [3600, -9], [3800, 0], [6100, 0], [6180, -12], [6300, 0], [7000, 0]]));
    loop(c('whiskL'), rot([[0, 0], [1200, 0], [1260, 5], [1360, 0], [2300, 0], [2500, 7], [3600, 7], [3800, 0], [7000, 0]]));
    loop(c('whiskR'), rot([[0, 0], [1200, 0], [1260, -5], [1360, 0], [2300, 0], [2500, -7], [3600, -7], [3800, 0], [7000, 0]]));
    // the swat: arm and paw turn from one shoulder; the paw's shadow on the box goes while it's up
    const SWAT = tr([[0, 'none'], [3480, 'none'], [3560, 'translate(-6px,14px) rotate(-4deg)'], [3650, 'translate(170px,-200px) rotate(16deg)'],
      [3730, 'translate(176px,-196px) rotate(18deg)'], [3900, 'translate(80px,-80px) rotate(7deg)'], [4040, 'translate(0,8px)'], [4140, 'none'], [7000, 'none']]);
    loop(c('armR'), SWAT);
    loop(c('pawR'), SWAT);
    loop(c('pawRsh'), [[0, 1], [3540, 1], [3600, 0], [4080, 0], [4180, 1], [7000, 1]].map(([ms, o]) => [ms, { opacity: o }]));
    // content kneading with the left paw
    const KNEAD = tr([[0, 'none'], [5250, 'none'], [5360, 'translateY(-34px) rotate(-6deg)'], [5480, 'none'], [5700, 'none'],
      [5810, 'translateY(-30px) rotate(-5deg)'], [5930, 'none'], [7000, 'none']]);
    loop(c('armL'), KNEAD);
    loop(c('pawL'), KNEAD);
    // tail: a wave down the chain (each joint later and wider), quick flicks while stalking;
    // the phase is whole cycles at 0 and 7 s, so the loop has no seam
    for (let i = 1; i <= 6; i++) {
      const list = [];
      for (let ms = 0; ms <= T; ms += 100) {
        const stalk = ms > 2200 && ms < 3700;
        const amp = (stalk ? 5 : 3) + i * (stalk ? 3.2 : 1.6);
        const ph = 2 * Math.PI * Math.round((stalk ? 2.6 : 0.75) * T / 1000) * ms / T - i * 0.55;
        list.push([ms, { transform: `rotate(${(Math.sin(ph) * amp).toFixed(2)}deg)` }]);
      }
      loop(c('t' + i), list, 'forwards', 'linear');
    }
    // the logo purrs, the sticker gets a nudge, the button asks for the click. They popped in
    // with transform; these use translate, rotate and scale, so two animations never share one
    // property (that would put both on the main thread). The sticker sits at -12° already.
    const JIT = [[0, 0, 0], [5000, 0, 0]];
    for (let ms = 5040; ms < 6000; ms += 40) JIT.push([ms, (ms / 40) % 2 ? 1.6 : -1.6, (ms / 80) % 2 ? -0.8 : 0.8]);
    JIT.push([6000, 0, 0], [7000, 0, 0]);
    loop($('.bn__logo', bn), JIT.map(([ms, x, y]) => [ms, { translate: `${x}px ${y}px` }]));
    loop(c('logo'), JIT.map(([ms, x, y]) => [ms, { transform: x || y ? `translate(${x}px,${y}px)` : 'none' }]));
    loop($('.bn__sticker', bn), [[0, -12], [1900, -12], [2050, -2], [2200, -18], [2350, -10], [2450, -12], [7000, -12]].map(([ms, a]) => [ms, { rotate: `${a + 12}deg` }]));
    loop($('.bn__cta', bn), [[0, 1], [6200, 1], [6350, 1.09], [6500, 0.98], [6620, 1], [7000, 1]].map(([ms, k]) => [ms, { scale: `${k}` }]));
  }

  /* steps 02-04: the cat is already alive, just not on air yet. Still most of the time, then
     clear beats: a blink, a look left and a look right (eyes and head together, quick, held),
     an ear twitch; only the tail keeps breathing. A 6 s loop; phase (0-1) shifts it per
     banner, so four cats never blink together. */
  function idle(bn, t0, phase) {
    const T = 6000;
    const SMOOTH = 'cubic-bezier(.45,0,.55,1)';
    const svg = $('.bn__cat svg', bn);
    if (!svg) return;
    const c = (n) => $('.c-' + n, svg);
    const loop = (el, list, easing = SMOOTH) => el && el.animate(list.map(([ms, p]) => ({ offset: ms / T, easing, ...p })),
      { duration: T, delay: t0, iterations: Infinity, iterationStart: phase, fill: 'both', easing: 'linear' });
    const rot = (list) => list.map(([ms, a]) => [ms, { transform: `rotate(${a}deg)` }]);
    const LID = [[0, 0], [1100, 0], [1170, 152], [1250, 0], [4300, 0], [4370, 152], [4450, 0], [4540, 0], [4610, 152], [4690, 0], [6000, 0]];
    const EYE = [[0, '0px,0px'], [1700, '0px,0px'], [1850, '-12px,-5px'], [2900, '-12px,-5px'], [3050, '14px,6px'], [3900, '14px,6px'],
      [4050, '0px,0px'], [6000, '0px,0px']];
    for (const s of ['L', 'R']) {
      loop(c('lid' + s), LID.map(([ms, y]) => [ms, { transform: `translateY(${y}px)` }]));
      loop(c('pupil' + s), EYE.map(([ms, v]) => [ms, { transform: `translate(${v})` }]));
    }
    loop(c('head'), rot([[0, 0], [1700, 0], [1950, -3], [2900, -3], [3150, 4], [3900, 4], [4150, 0], [6000, 0]]));
    loop(c('earR'), rot([[0, 0], [2500, 0], [2580, 13], [2690, -3], [2780, 0], [6000, 0]]));
    loop(c('earL'), rot([[0, 0], [5000, 0], [5080, -12], [5190, 2], [5280, 0], [6000, 0]]));
    loop(c('whiskL'), rot([[0, 0], [3300, 0], [3360, 5], [3460, 0], [6000, 0]]));
    loop(c('whiskR'), rot([[0, 0], [3300, 0], [3360, -5], [3460, 0], [6000, 0]]));
    // the tail: a slow wave down the chain, two whole cycles a loop
    for (let i = 1; i <= 6; i++) {
      const list = [];
      for (let ms = 0; ms <= T; ms += 150) {
        const ph = 4 * Math.PI * ms / T - i * 0.5;
        list.push([ms, { transform: `rotate(${(Math.sin(ph) * (2 + i * 1.4)).toFixed(2)}deg)` }]);
      }
      loop(c('t' + i), list, 'linear');
    }
  }

  /* a click (or a tap) on a cat: it swats the toy, the toy swings, the cat squints, pleased.
     These add on top of whatever the cat is doing (composite: add), so they work in any step */
  function swat(bn) {
    const svg = $('.bn__cat svg', bn), toy = $('.bn__toy svg', bn);
    const now = performance.now();
    if (!svg || now - (bn.swatAt || 0) < 900) return;
    bn.swatAt = now;
    const c = (n) => $('.c-' + n, svg);
    const SMOOTH = 'cubic-bezier(.45,0,.55,1)';
    const add = (el, list, o) => el && el.animate(list.map(([offset, transform]) => ({ offset, easing: SMOOTH, transform })),
      { easing: 'linear', composite: 'add', ...o });
    const PAW = [[0, 'translate(0px,0px) rotate(0deg)'], [0.16, 'translate(-6px,14px) rotate(-4deg)'], [0.36, 'translate(170px,-200px) rotate(16deg)'],
      [0.48, 'translate(176px,-196px) rotate(18deg)'], [0.74, 'translate(80px,-80px) rotate(7deg)'], [0.92, 'translate(0px,8px) rotate(0deg)'],
      [1, 'translate(0px,0px) rotate(0deg)']];
    add(c('armR'), PAW, { duration: 640 });
    add(c('pawR'), PAW, { duration: 640 });
    const sh = c('pawRsh');
    if (sh) sh.animate([{ opacity: 1 }, { opacity: 0, offset: 0.12 }, { opacity: 0, offset: 0.86 }, { opacity: 1 }], { duration: 640 });
    add(c('head'), [[0, 'translate(0px,0px) rotate(0deg)'], [0.3, 'translate(0px,-12px) rotate(-3deg)'], [0.65, 'translate(0px,0px) rotate(-4deg)'],
      [1, 'translate(0px,0px) rotate(0deg)']], { duration: 1300, delay: 120 });
    for (const s of ['L', 'R']) {
      add(c('lid' + s), [[0, 'translateY(0px)'], [0.18, 'translateY(100px)'], [0.75, 'translateY(100px)'], [1, 'translateY(0px)']], { duration: 1300, delay: 260 });
      add(c('ear' + s), [[0, 'rotate(0deg)'], [0.4, `rotate(${s === 'L' ? -10 : 10}deg)`], [1, 'rotate(0deg)']], { duration: 500, delay: 200 });
    }
    if (toy) {
      const K = [[0, 0], [0.1, -26], [0.33, 10], [0.52, -5], [0.7, 2.4], [0.86, -1], [1, 0]];
      add($('.t-swing', toy), K.map(([o, a]) => [o, `rotate(${a}deg)`]), { duration: 1800, delay: 210 });
      add($('.t-feather', toy), K.map(([o, a], i) => [o, `rotate(${(-(a - (K[i - 1] || K[0])[1]) * 0.5).toFixed(1)}deg)`]), { duration: 1800, delay: 210 });
    }
  }

  /* ------------------------------------------------ Night Court: project 2 of the demo
     A streetball league under floodlights. The art (the player cut into parts, with the
     hoop and the ball; the passer) waits in js/pr-court.js, built by tools/build_court.py,
     and is fetched only when the demo is about to show this project. In the motion step one
     play runs through all four formats: a power cut, the lights come on lamp by lamp, the
     passer on TV lobs the ball out of his frame, it flies across the stage into the poster
     and the player there dunks it; the score, the LED board and the story answer. */
  const NC_DUR = [0, 4400, 3600, 3700, 4300, 16000];   // 05 runs the 8 s play twice

  /* the story's player hangs on the rim (its pose is in the CSS). When he swings, the body
     turns about the hand on the rim, not about its own middle (1230,1650, the transform-origin):
     this is the body's transform for a swing of a° */
  const NC_O = [1230, 1650], NC_HANG = [-123, 118], NC_TILT = 3;
  const ncTurn = ([x, y], a) => {
    const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
    return [x * c - y * s, x * s + y * c];
  };
  const NC_GRIP = (() => {                  // the hand: the ball's centre, arm turned 60° at the shoulder, then the hang
    const arm = ncTurn([1206 - 1335, 488 - 1170], 60), q = ncTurn([1335 + arm[0] - NC_O[0], 1170 + arm[1] - NC_O[1]], NC_TILT);
    return [NC_O[0] + NC_HANG[0] + q[0], NC_O[1] + NC_HANG[1] + q[1]];
  })();
  function ncSwing(a) {
    const v = ncTurn([NC_O[0] + NC_HANG[0] - NC_GRIP[0], NC_O[1] + NC_HANG[1] - NC_GRIP[1]], a);
    return `translate(${(NC_GRIP[0] - NC_O[0] + v[0]).toFixed(1)}px,${(NC_GRIP[1] - NC_O[1] + v[1]).toFixed(1)}px) rotate(${(NC_TILT + a).toFixed(2)}deg)`;
  }

  function court(set, t0) {
    const T = 8000;
    const SMOOTH = 'cubic-bezier(.45,0,.55,1)', OUT = 'cubic-bezier(.12,.72,.32,1)', IN = 'cubic-bezier(.55,0,.9,.55)';
    // keyframes at absolute ms, easing per segment; every part loops in step
    const at = (list, easing) => list.map(([ms, p, e]) => ({ offset: Math.min(1, ms / T), easing: e || easing || SMOOTH, ...p }));
    const loop = (el, list, easing) => el && el.animate(at(list, easing), { duration: T, delay: t0, iterations: Infinity, fill: 'both', easing: 'linear' });
    const op = (list) => list.map(([ms, o, e]) => [ms, { opacity: o }, e]);
    const tf = (list) => list.map(([ms, v, e]) => [ms, { transform: v }, e]);
    const rot = (list) => list.map(([ms, a, e]) => [ms, { transform: `rotate(${a}deg)` }, e]);
    const B = (k) => $('.bn--' + k, set);
    const tv = B('tv'), poster = B('poster'), story = B('story'), led = B('led');

    /* a power cut, then the banks come on lamp by lamp, stuttering; the line lights up after */
    [tv, poster, story].forEach((bn, k) => {
      const d = k * 70;
      loop($('.nc__dark', bn), op([[0, 1], [450 + d, 1], [520 + d, 0.55], [600 + d, 0.9], [700 + d, 0.3], [820 + d, 0.65], [1000 + d, 0.12],
        [1350 + d, 0], [7350, 0], [7700, 1], [8000, 1]]), 'linear');
      loop($('.nc__beam', bn), op([[0, 0], [700 + d, 0], [760 + d, 0.7], [810 + d, 0.2], [900 + d, 0.85], [1350 + d, 1], [7350, 1], [7600, 0], [8000, 0]]), 'linear');
      $$('.nc__bank i', bn).forEach((lamp, j) => {
        const on = 450 + d + ((j * 5) % 16) * 38;
        loop(lamp, op([[0, 0.14], [on, 0.14], [on + 30, 1], [on + 70, 0.35], [on + 110, 1], [7350, 1], [7380 + j * 6, 0.14], [8000, 0.14]]), 'linear');
      });
      $$('.nc__head .l', bn).forEach((l, j) => {
        const on = 1000 + d + j * 36;
        loop(l, op([[0, 0.1], [on, 0.1], [on + 40, 1], [on + 80, 0.35], [on + 120, 1], [7350, 1], [7450, 0.1], [8000, 0.1]]), 'linear');
      });
      loop($('.nc__flash', bn), op([[0, 0], [4380, 0], [4410, 0.62, 'ease-out'], [4800, 0], [8000, 0]]), 'linear');
      loop($('.nc__badge', bn), rot([[0, -10], [4420, -10], [4520, -22], [4640, -4], [4760, -12], [4880, -10], [8000, -10]]));
    });

    /* the poster: he flies in from the left (the type sits low, so he never passes behind it),
       meets the ball at the rim, dunks it and hangs there till the lights go out; he is back
       at the start in the dark. The ball's layer copies the body and arm moves, so it stays in the hand. */
    const dunk = (bn) => {
      const svg = $('.nc-hero', bn);
      if (!svg) return;
      const g = (n) => $('.h-' + n, svg);
      const T0 = 3300, T1 = 4150, START = 'translate(-1750px,380px) rotate(10deg)';
      // the leap: slowing into the rim and rising less and less, so the catch is the top of the jump
      const LEAP = [[0, START], [T0, START, 'linear']];
      for (let i = 1; i < 8; i++) {
        const u = i / 8;
        LEAP.push([T0 + (T1 - T0) * u, `translate(${(-1750 * (1 - u) ** 2).toFixed(1)}px,${(380 * (1 - u) ** 3).toFixed(1)}px) rotate(${(10 * (1 - u)).toFixed(2)}deg)`, 'linear']);
      }
      const BODY = tf([...LEAP, [T1, 'translate(0px,0px) rotate(0deg)', IN], [4380, 'translate(-123px,113px) rotate(3deg)'],
        [4650, 'translate(-123px,130px) rotate(4deg)'], [5250, 'translate(-123px,112px) rotate(2.5deg)'], [5850, 'translate(-123px,124px) rotate(3.5deg)'],
        [6450, 'translate(-123px,114px) rotate(2.6deg)'], [7050, 'translate(-123px,122px) rotate(3.3deg)'], [7700, 'translate(-123px,118px) rotate(3deg)'],
        [7701, START], [8000, START]]);
      const ARM = rot([[0, -32], [T0, -32, OUT], [T1, 0, IN], [4380, 60], [7700, 60], [7701, -32], [8000, -32]]);
      loop(g('body'), BODY);
      loop(g('bodyB'), BODY);
      loop(g('armU'), ARM);
      loop(g('armUB'), ARM);
      loop(g('armB'), rot([[0, 18], [T0, 18, OUT], [T1, 0], [4380, -22], [5000, -12], [6000, -17], [7000, -13], [7700, -15], [7701, 18], [8000, 18]]));
      loop(g('legB'), rot([[0, -16], [T0, -16, OUT], [T1, 0], [4420, 14], [5200, 5], [5900, 11], [6600, 6], [7300, 9], [7700, 8], [7701, -16], [8000, -16]]));
      loop(g('legF'), rot([[0, 22], [T0, 22, OUT], [T1, 0], [4420, -18], [5200, -8], [5900, -15], [6600, -10], [7300, -13], [7700, -12], [7701, 22], [8000, 22]]));
      loop(g('head'), rot([[0, -8], [T0, -8, OUT], [T1, 0], [4380, 10], [7700, 6], [7701, -8], [8000, -8]]));
      // the ball shows up in the hand at the catch; after the slam it drops through the net
      // (the arm is turned 60°, so straight down is (sin 60°, cos 60°) in the arm's frame)
      const z = 'translate(0px,0px)';
      loop(g('ball'), [[0, { opacity: 0, transform: z }], [4149, { opacity: 0, transform: z }], [4150, { opacity: 1, transform: z }],
        [4380, { opacity: 1, transform: z }, 'cubic-bezier(.5,0,1,1)'], [4720, { opacity: 1, transform: 'translate(780px,450px)' }],
        [4800, { opacity: 0, transform: 'translate(840px,485px)' }], [8000, { opacity: 0, transform: z }]], 'linear');
      loop(g('net'), tf([[0, 'scale(1,1)'], [4400, 'scale(1,1)'], [4480, 'scale(.96,1.3)'], [4600, 'scale(1.02,.9)'], [4720, 'scale(.99,1.08)'],
        [4880, 'scale(1,1)'], [8000, 'scale(1,1)']]));
      loop(g('board'), rot([[0, 0], [4380, 0], [4430, -1.4], [4520, 1], [4620, -0.6], [4740, 0], [8000, 0]]));
    };
    dunk(poster);

    /* the story: a shot of its own. The dunk is done, he hangs on the rim and still swings;
       when the poster scores he yells and the free arm goes up (the legs, behind the type,
       only swing along), and the camera slowly pushes in on the rim.
       Curves, sampled: denser where the yell is quick. */
    const hang = (bn) => {
      const svg = $('.nc-hero', bn);
      if (!svg) return;
      const g = (n) => $('.h-' + n, svg);
      const fade = (t, from, tau) => (t < from ? 0 : Math.exp(-(t - from) / tau));
      const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
      const wave = (t, from, period) => Math.sin(2 * Math.PI * (t - from) / period);
      const sw = (t) => 9 * fade(t, 0, 2600) * wave(t, 0, 1700) + 5 * fade(t, 4450, 2200) * wave(t, 4450, 1700);
      const up = (t) => ease((t - 4430) / 170) - ease((t - 5600) / 600);
      const lag = (t, d) => sw(t - d) - sw(t);
      const TS = [];
      for (let t = 0; t < T; t += t >= 4400 && t < 4900 ? 40 : 100) TS.push(t);
      TS.push(T);
      const curve = (el, fn) => el && loop(el, TS.map((t) => [t, { transform: fn(t) }]), 'linear');
      const deg = (a) => `rotate(${a.toFixed(2)}deg)`;
      curve(g('body'), (t) => ncSwing(sw(t)));      // (bodyB only carries the ball, which the story doesn't show)
      curve(g('armB'), (t) => deg(-16 + 116 * up(t) + 9 * up(t) * wave(t, 4450, 450) + lag(t, 150)));
      curve(g('legB'), (t) => deg(8 + 6 * up(t) + 1.6 * lag(t, 200)));
      curve(g('legF'), (t) => deg(-12 - 6 * up(t) + 1.6 * lag(t, 200)));
      curve(g('head'), (t) => deg(6 - 18 * up(t) + 0.6 * lag(t, 120)));
      curve(g('net'), (t) => `skewX(${(0.7 * sw(t - 250)).toFixed(2)}deg)`);
      curve(g('board'), (t) => deg(0.9 * fade(t, 4460, 160) * wave(t, 4460, 150)));
      loop($('.nc__hero', bn), tf([[0, 'scale(1)'], [1000, 'scale(1)'], [7700, 'scale(1.07)'], [7701, 'scale(1)'], [8000, 'scale(1)']]), 'linear');
    };
    hang(story);

    /* TV: four bounces, the ball goes up with the arms, and he lobs it out of the frame */
    const ps = $('.nc-passer', tv);
    if (ps) {
      loop($('.p-dribble', ps), op([[0, 1], [3300, 1], [3301, 0], [7999, 0], [8000, 1]]), 'linear');
      loop($('.p-lob', ps), op([[0, 0], [3300, 0], [3301, 1], [7999, 1], [8000, 0]]), 'linear');
      const Y = [[0, 'translate(0px,0px)']];
      for (const b of [1500, 1950, 2400, 2850]) Y.push([b, 'translate(0px,0px)', 'cubic-bezier(.55,0,1,.45)'], [b + 210, 'translate(0px,433px)', 'cubic-bezier(0,.55,.45,1)']);
      Y.push([3300, 'translate(0px,0px)', OUT], [3420, 'translate(32px,-1240px)'], [7999, 'translate(32px,-1240px)'], [8000, 'translate(0px,0px)']);
      loop($('.p-ballY', ps), tf(Y), 'linear');
      loop($('.p-ball', ps), op([[0, 1], [3450, 1], [3451, 0], [7999, 0], [8000, 1]]), 'linear');
    }
    /* the pass: from the passer's hands, across the stage, into the poster player's hand.
       Layout boxes, not the screen: some frames may still be sliding in when this starts. */
    const fly = $('.nc-fly', set), pass = window.prCourt && window.prCourt.pass, hw = $('.nc__hero', poster);
    if (fly && ps && pass && hw) {
      const off = (el) => {
        let x = 0, y = 0;
        for (let e = el; e && e !== set; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
        return [x, y];
      };
      const pw = ps.parentNode, [px, py] = off(pw), pk = pw.offsetWidth / 1400;        // passer viewBox -700 -1960 1400 2010
      const S = [px + (pass.lob[0] + 700) * pk, py + (pass.lob[1] + 1960) * pk], rS = pass.lob[2] * pk;
      const [hx, hy] = off(hw), hk = hw.offsetWidth / 2320;                              // hero viewBox 340 300 2320 2400
      const E = [hx + (1206 - 340) * hk, hy + (488 - 300) * hk], rE = 145 * hk;
      fly.style.width = fly.style.height = 2 * rE + 'px';
      const pose = (x, y, r, a) => `translate(${(x - rE).toFixed(1)}px,${(y - rE).toFixed(1)}px) scale(${(r / rE).toFixed(3)}) rotate(${a}deg)`;
      // how high the lob goes: a real arc, but never out over the top of the stage
      let H = Math.abs(E[0] - S[0]) * 0.35;
      const top = (h) => Math.min(...[...Array(11)].map((_, i) => S[1] + (E[1] - S[1]) * (i / 10) - h * 4 * (i / 10) * (1 - i / 10)));
      while (H > 0 && top(H) < rE * 1.3) H -= 2;
      const list = [[0, { opacity: 0, transform: pose(S[0], S[1], rS, 0) }], [3449, { opacity: 0, transform: pose(S[0], S[1], rS, 0) }]];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        list.push([3450 + 700 * u, { opacity: 1, transform: pose(S[0] + (E[0] - S[0]) * u, S[1] + (E[1] - S[1]) * u - H * 4 * u * (1 - u), rS + (rE - rS) * u, u * 540) }]);
      }
      list.push([4151, { opacity: 0, transform: pose(E[0], E[1], rE, 540) }], [8000, { opacity: 0, transform: pose(S[0], S[1], rS, 0) }]);
      loop(fly, list, 'linear');
    }

    /* the answer: +2 on the bug, a new lower third, the LED flashes, the story gets a sticker */
    const sc = $$('.nc__sc i', tv);
    loop(sc[0], op([[0, 1], [4450, 1], [4451, 0], [7999, 0], [8000, 1]]), 'linear');
    loop(sc[1], [[0, { opacity: 0, transform: 'scale(1.6)' }], [4450, { opacity: 0, transform: 'scale(1.6)' }], [4451, { opacity: 1, transform: 'scale(1.6)' }, OUT],
      [4650, { opacity: 1, transform: 'scale(1)' }], [7999, { opacity: 1, transform: 'scale(1)' }], [8000, { opacity: 0, transform: 'scale(1.6)' }]], 'linear');
    loop($('.nc__bug', tv), tf([[0, 'scale(1)'], [4450, 'scale(1)'], [4530, 'scale(1.08)'], [4700, 'scale(1)'], [8000, 'scale(1)']]));
    const l3 = $$('.nc__l3 i', tv);
    loop(l3[0], op([[0, 1], [4600, 1], [4650, 0], [7999, 0], [8000, 1]]), 'linear');
    loop(l3[1], [[0, { opacity: 0, transform: 'translateX(-12%)' }], [4600, { opacity: 0, transform: 'translateX(-12%)' }, OUT],
      [4780, { opacity: 1, transform: 'none' }], [7999, { opacity: 1, transform: 'none' }], [8000, { opacity: 0, transform: 'translateX(-12%)' }]], 'linear');
    const tk = $('.nc__ticker', led);
    if (tk) tk.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }], { duration: 9000, delay: t0, iterations: Infinity });
    loop($('.nc__swish', led), op([[0, 0], [4420, 0], [4440, 1], [4540, 0], [4640, 1], [4740, 0], [4840, 1], [5900, 1], [5950, 0], [8000, 0]]), 'linear');
    loop($('.nc__swish', story), [[0, { opacity: 0, transform: 'rotate(-30deg) scale(0)' }], [4450, { opacity: 0, transform: 'rotate(-30deg) scale(0)' }, OUT],
      [4650, { opacity: 1, transform: 'rotate(-8deg) scale(1.12)' }], [4800, { opacity: 1, transform: 'rotate(-10deg) scale(1)' }],
      [7300, { opacity: 1, transform: 'rotate(-10deg) scale(1)' }], [7450, { opacity: 0, transform: 'rotate(-10deg) scale(.6)' }],
      [8000, { opacity: 0, transform: 'rotate(-30deg) scale(0)' }]]);
  }

  /* steps 03-04: hang time. The player floats at the rim (on the story he hangs from it and
     swings a little, the legs a beat behind), one lamp stutters now and then.
     On the board (02) everything holds still. */
  function courtLife(bn, t0, phase, n) {
    if (n === 2) return;
    const T = 3600, SMOOTH = 'cubic-bezier(.45,0,.55,1)';
    const loop = (el, list, easing = SMOOTH) => el && el.animate(list.map(([ms, v]) => ({ offset: ms / T, easing, transform: v })),
      { duration: T, delay: t0, iterations: Infinity, iterationStart: phase, fill: 'both', easing: 'linear' });
    const svg = $('.nc-hero', bn);
    if (svg && bn.classList.contains('bn--story')) {
      const sw = (t) => 3 * Math.sin(2 * Math.PI * t / T);
      const kf = (fn) => [...Array(25)].map((_, i) => [i * 150, fn(i * 150)]);
      loop($('.h-body', svg), kf((t) => ncSwing(sw(t))), 'linear');   // (no ball on the story: bodyB stays)
      loop($('.h-legB', svg), kf((t) => `rotate(${(8 + 1.6 * (sw(t - 300) - sw(t))).toFixed(2)}deg)`), 'linear');
      loop($('.h-legF', svg), kf((t) => `rotate(${(-12 + 1.6 * (sw(t - 300) - sw(t))).toFixed(2)}deg)`), 'linear');
    } else if (svg) {
      const F = [[0, 'translate(0px,0px)'], [1800, 'translate(0px,-26px)'], [3600, 'translate(0px,0px)']];
      loop($('.h-body', svg), F);
      loop($('.h-bodyB', svg), F);
      loop($('.h-legB', svg), [[0, 'rotate(0deg)'], [1800, 'rotate(4deg)'], [3600, 'rotate(0deg)']]);
      loop($('.h-legF', svg), [[0, 'rotate(0deg)'], [1800, 'rotate(-5deg)'], [3600, 'rotate(0deg)']]);
    }
    const lamps = $$('.nc__bank i', bn);
    const lamp = lamps[Math.floor(phase * 16 + 5) % 16];
    if (lamp && lamp.getClientRects().length) lamp.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0.25, offset: 0.62 }, { opacity: 1, offset: 0.64 },
      { opacity: 0.4, offset: 0.66 }, { opacity: 1, offset: 0.7 }, { opacity: 1 }], { duration: 4200, delay: t0, iterations: Infinity, iterationStart: phase });
  }

  /* the board shows the player taken apart (that is what lets him fly); 03 puts him together */
  const NC_APART = {
    armU: 'translate(80px,-120px) rotate(-6deg)', armUB: 'translate(80px,-120px) rotate(-6deg)', armB: 'translate(-110px,-20px)',
    head: 'translate(-40px,-110px)', legB: 'translate(-90px,110px)', legF: 'translate(110px,90px)', net: 'translate(150px,60px)', board: 'translate(190px,-60px)',
  };
  function courtParts(bn, apart, o, but = []) {
    const svg = $('.nc-hero', bn);
    if (!svg) return;
    for (const [k, v] of Object.entries(NC_APART)) {
      if (but.includes(k)) continue;
      const kf = [{ transform: 'none' }, { transform: v }];
      $('.h-' + k, svg).animate(apart ? kf : kf.reverse(), { fill: 'both', easing: 'cubic-bezier(.2,.8,.2,1)', ...o });
    }
  }

  /* ------------------------------------------------ fizz: project 3 of the demo
     A pink lemonade in a can (made up). The key visual is the can's label, flat, the way a
     printer gets it. In step 04 a copy of it rolls up into a 3D can: 30 strips, each a hinge
     turned 12° from the one before, close into a ring (CSS 3D, transforms only). In the motion
     step the can turns, the tab goes up, and the pssst spills over the other formats. The
     drawings (lemons, splashes, ice, the can's metal) wait in js/pr-fizz.js, built by
     tools/build_fizz.py, as <use> symbols; it is fetched when the demo is about to show fizz. */
  const FZ_DUR = [0, 4400, 3600, 3700, 4600, 16000];   // 05 plays the 8 s loop twice
  const FZ_N = 30, FZ_A = 360 / FZ_N, FZ_TILT = -13.7;

  // the label as printed: what the strips of the 3D can and the small can show
  function fizzPrint(bn) {
    const p = document.createElement('div');
    p.className = 'bn fz bn--label';
    $$('[data-print]', bn).forEach((el) => {
      const c = el.cloneNode(true);
      ['data-print', 'data-part', 'data-label'].forEach((a) => c.removeAttribute(a));
      p.appendChild(c);
    });
    return p;
  }

  /* the ring: one strip in front (the middle of the label), the strips to its right hinged on
     to its right edge one after another, the same to the left; two half strips meet at the
     back. Flat until the CSS of 04/05 (or the roll-up) turns every hinge 12°. */
  function fizzRoll(bn) {
    const print = fizzPrint(bn), w = 100 / FZ_N;
    const strip = (x, width, side) => {
      const h = document.createElement('div');
      h.className = 'fz-h' + (side ? ' fz-h--' + side : '');
      h.style.width = width + 'cqw';
      const f = document.createElement('div');
      f.className = 'fz-f';
      const p = print.cloneNode(true);
      p.style.left = 0.15 - x + 'cqw';    // the face is 0.15cqw wider on each side
      f.appendChild(p);
      const b = document.createElement('i');
      b.className = 'fz-b';                 // the back of the paper, seen while it rolls
      h.append(f, b);
      return h;
    };
    const root = strip(50 - w / 2, w, '');
    root.style.left = 50 - w / 2 + 'cqw';
    let r = root, l = root;
    for (let k = 1; k <= FZ_N / 2; k++) {
      const ww = k === FZ_N / 2 ? w / 2 : w;
      const nr = strip(50 + w / 2 + (k - 1) * w, ww, 'r');
      const nl = strip(50 - w / 2 - (k - 1) * w - ww, ww, 'l');
      r.appendChild(nr);
      l.appendChild(nl);
      r = nr;
      l = nl;
    }
    const wrap = document.createElement('div'), roll = document.createElement('div'), spin = document.createElement('div');
    wrap.className = 'fz-3d';
    roll.className = 'fz-roll';             // the tilt (we look from above)
    spin.className = 'fz-spin';             // the turn about the can's axis
    spin.appendChild(root);
    roll.appendChild(spin);
    const core = document.createElement('i');
    core.className = 'fz-core';             // at the axis: what shows between the strips is pink, not the inside
    roll.appendChild(core);
    wrap.appendChild(roll);
    bn.insertBefore(wrap, $('.fz__shade', bn));
    return print;
  }

  /* the small can (citylight) holds still, so it needs no 3D: the front half of the label
     goes round it in 18 flat strips, each squeezed by the cosine of its angle and dropped
     along the lid's ellipse (skewed, so neighbours meet), the way the big can's camera sees
     it. Units: cqw of the can's body (the can is 100 wide, the label 2π·50 round). */
  function fizzCan(body, print) {
    const N = 18, R = 50, RY = 11.8, rad = Math.PI / 180, w = (R * Math.PI) / N;
    for (let k = 0; k < N; k++) {
      const a0 = (-90 + (k * 180) / N) * rad, a1 = a0 + (180 / N) * rad;
      const x0 = R + R * Math.sin(a0), x1 = R + R * Math.sin(a1);
      const s = (x1 - x0) / w, skew = Math.atan2(RY * (Math.cos(a1) - Math.cos(a0)), x1 - x0) / rad;
      const st = document.createElement('div');
      st.className = 'fz-cs';
      // a hair wider than its share (0.8cqw once squeezed), so no seam shows between strips
      st.style.cssText = `left:${x0.toFixed(3)}cqw;width:${(w + 0.8 / s).toFixed(3)}cqw;` +
        `transform:translateY(${(RY * Math.cos(a0)).toFixed(3)}cqw) skewY(${skew.toFixed(3)}deg) scaleX(${s.toFixed(4)})`;
      const p = print.cloneNode(true);
      p.style.left = (-(Math.PI * R + R * a0)).toFixed(3) + 'cqw';   // the label at this angle (its middle faces us)
      st.appendChild(p);
      body.appendChild(st);
    }
  }

  function fizz(set, t0) {
    const T = 8000, OPEN = 1500;            // OPEN: the tab goes up
    const SMOOTH = 'cubic-bezier(.45,0,.55,1)', OUT = 'cubic-bezier(.12,.72,.32,1)', IN = 'cubic-bezier(.55,0,.9,.55)';
    const at = (list, easing) => list.map(([ms, p, e]) => ({ offset: Math.min(1, ms / T), easing: e || easing || SMOOTH, ...p }));
    const loop = (el, list, easing) => el && el.animate(at(list, easing), { duration: T, delay: t0, iterations: Infinity, fill: 'both', easing: 'linear' });
    const op = (list) => list.map(([ms, o, e]) => [ms, { opacity: o }, e]);
    const tf = (list) => list.map(([ms, v, e]) => [ms, { transform: v }, e]);
    const B = (k) => $('.bn--' + k, set);
    const can = B('label'), city = B('city'), wob = B('wob'), six = B('six');
    if (!can || !city || !wob || !six) return;
    const k = can.offsetWidth / 100, ck = city.offsetWidth / 100, sk = six.offsetWidth / 100;   // 1cqw, in px

    /* the can: one turn to show the whole label, then the tab goes up: pssst. Later it turns
       to the line on its side, and on round to the front */
    loop($('.fz-spin', can), tf([[0, 'rotateY(0deg)', 'cubic-bezier(.55,0,.3,1)'], [1350, 'rotateY(-360deg)'], [5000, 'rotateY(-360deg)'],
      [6200, 'rotateY(-470deg)'], [7000, 'rotateY(-470deg)', 'cubic-bezier(.5,0,.3,1)'], [8000, 'rotateY(-720deg)']]));
    const TAB0 = 'translateY(0%) rotate(0deg)', TAB1 = 'translateY(-3%) rotate(-30deg)';
    loop($('.fz__tab', can), tf([[0, TAB0], [OPEN - 80, TAB0, OUT], [OPEN + 40, TAB1], [7550, TAB1], [7800, TAB0], [8000, TAB0]]));
    loop($('.fz__mouth', can), op([[0, 0], [OPEN + 20, 0], [OPEN + 40, 1], [7700, 1], [7720, 0], [8000, 0]]), 'linear');
    const C0 = 'translateY(0%) scale(1,1)';
    loop(can, tf([[0, C0], [OPEN + 30, C0, OUT], [OPEN + 90, 'translateY(0.8%) scale(1.025,.965)'], [OPEN + 220, 'translateY(-2%) scale(.985,1.03)'],
      [OPEN + 380, C0], [8000, C0]]));
    const CR0 = { opacity: 0, transform: 'translateY(0%) scale(.2)' };
    loop($('.fz__crown', can), [[0, CR0], [OPEN + 30, CR0], [OPEN + 40, { opacity: 1, transform: 'translateY(0%) scale(.25)' }, OUT],
      [OPEN + 260, { opacity: 1, transform: 'translateY(0%) scale(1.08)' }], [OPEN + 420, { opacity: 1, transform: 'translateY(0%) scale(1)' }],
      [OPEN + 900, { opacity: 1, transform: 'translateY(3%) scale(1.02)' }, IN], [OPEN + 1250, { opacity: 0, transform: 'translateY(16%) scale(.9)' }], [8000, CR0]]);
    const PS0 = { opacity: 0, transform: 'rotate(-24deg) scale(0)' }, PS1 = { opacity: 1, transform: 'rotate(-10deg) scale(1)' };
    loop($('.fz__pssst', can), [[0, PS0], [OPEN + 60, PS0], [OPEN + 70, { opacity: 1, transform: 'rotate(-24deg) scale(.2)' }, OUT],
      [OPEN + 260, { opacity: 1, transform: 'rotate(-6deg) scale(1.15)' }], [OPEN + 400, PS1], [OPEN + 1150, PS1],
      [OPEN + 1350, { opacity: 0, transform: 'rotate(-10deg) scale(.85)' }], [8000, PS0]]);
    // bubbles out of the mouth: a burst, then a slow fizz
    const B0 = { opacity: 0, transform: 'translate(0px,0px) scale(.4)' };
    $$('.fz__bubs i', can).forEach((b, i) => {
      const L = [[0, B0]];
      for (const s of [OPEN + 40 + i * 60, OPEN + 1300 + i * 380]) {
        const dx = ((i % 3) - 1) * 1.6 * k, dy = (9 + (i % 4) * 2.5) * k;
        L.push([s, B0, OUT], [s + 90, { opacity: 1, transform: `translate(${(dx * 0.2).toFixed(1)}px,${(-dy * 0.15).toFixed(1)}px) scale(.8)` }, 'linear'],
          [s + 900, { opacity: 0, transform: `translate(${dx.toFixed(1)}px,${(-dy).toFixed(1)}px) scale(1.1)` }]);
      }
      L.push([T, B0]);
      loop(b, L);
    });
    // cold: a drop of condensation now and then runs down (none while it spins)
    const D0 = { opacity: 0, transform: 'translateY(0px)' }, D1 = { opacity: 1, transform: 'translateY(0px)' };
    $$('.fz__wet i', can).forEach((d, i) => {
      const s = [2600, 3400, 4100][i];
      loop(d, [[0, D0], [1350, D0], [1600, D1], [s, D1, 'cubic-bezier(.5,0,.8,.6)'],
        [s + 1300, { opacity: 0, transform: `translateY(${((20 + i * 6) * k).toFixed(1)}px)` }], [s + 1301, D0], [T, D0]]);
    });

    /* the pssst flies: a swarm of bubbles from the mouth over the stage, most into the
       citylight's letters, the last three into the wobbler. Layout boxes, not the screen. */
    const fly = $('.fz-fly', set), head = $(':scope > .fz__head', city);   // (not the one on the small can's label)
    const HIT = 1620 + 9 * 45 + 760;        // when the wobbler gets hit
    if (fly && head) {
      const off = (el) => {
        let x = 0, y = 0;
        for (let e = el; e && e !== set; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
        return [x, y];
      };
      const [cx, cy] = off(can), S = [cx + 47.5 * k, cy - 6.6 * k];   // the mouth
      const [hx, hy] = off(head), [wx, wy] = off(wob);
      const sz = set.offsetWidth / 100;
      $$('i', fly).forEach((b, i) => {
        const toWob = i >= 9, r = (0.6 + ((i * 7) % 5) * 0.22) * sz;
        b.style.width = b.style.height = (2 * r).toFixed(1) + 'px';
        const E = toWob ? [wx + wob.offsetWidth * (0.3 + 0.2 * (i - 9)), wy + wob.offsetHeight * (0.36 + 0.1 * (i % 2))]
          : [hx + head.offsetWidth * (((i * 37) % 100) / 100), hy + head.offsetHeight * (0.2 + ((i * 53) % 60) / 100)];
        const s = 1620 + i * 45, d = toWob ? 760 : 680 + (i % 3) * 60, H = (10 + (i % 4) * 2.5) * sz;
        const P0 = { opacity: 0, transform: `translate(${(S[0] - r).toFixed(1)}px,${(S[1] - r).toFixed(1)}px) scale(.3)` };
        const L = [[0, P0], [s, P0]];
        for (let j = 1; j <= 8; j++) {
          const u = j / 8;
          const x = S[0] + (E[0] - S[0]) * u + Math.sin(u * Math.PI * 3 + i) * 0.8 * sz, y = S[1] + (E[1] - S[1]) * u - H * 4 * u * (1 - u);
          L.push([s + d * u, { opacity: 1, transform: `translate(${(x - r).toFixed(1)}px,${(y - r).toFixed(1)}px) scale(${(0.5 + 0.5 * u).toFixed(2)})` }, 'linear']);
        }
        L.push([s + d + 140, { opacity: 0, transform: `translate(${(E[0] - r).toFixed(1)}px,${(E[1] - r).toFixed(1)}px) scale(1.7)` }], [T, P0]);
        loop(b, L, 'linear');
      });
    }

    /* citylight: the letters are empty glass; the lemonade rises in them (a window that
       slides up over a filled copy), stays, and drains before the loop starts over */
    const liq = $(':scope > .fz__head .fz__liq', city), lq = liq && $('.fz__t', liq);
    if (lq) {
      const h = liq.offsetHeight;
      const F = [[0, h], [2350, h, OUT], [3900, 0], [6500, 0, IN], [7400, h], [8000, h]];
      loop(liq, F.map(([ms, y, e]) => [ms, { transform: `translateY(${y}px)` }, e]));
      loop(lq, F.map(([ms, y, e]) => [ms, { transform: `translateY(${-y}px)` }, e]));
    }
    loop($(':scope > .fz__badge', city), tf([[0, 'scale(1)'], [3900, 'scale(1)'], [4000, 'scale(1.18)'], [4160, 'scale(.96)'], [4280, 'scale(1)'], [8000, 'scale(1)']]));
    // ice and a slice drop in and bounce, then go before the next round
    $$('.fz__fall svg', city).forEach((el, i) => {
      const r = el.getBoundingClientRect(), s = 4000 + i * 230, a0 = [-50, 35, -25][i];
      const y0 = -(r.bottom - city.getBoundingClientRect().top + 2 * ck);   // just above the poster (an <svg> has no offsetTop)
      const up = { opacity: 1, transform: `translateY(${y0.toFixed(1)}px) rotate(${a0}deg)` }, rest = { opacity: 1, transform: 'translateY(0px) rotate(0deg)' };
      loop(el, [[0, up], [s, up, IN], [s + 430, rest, OUT], [s + 560, { opacity: 1, transform: `translateY(${(-7 * ck).toFixed(1)}px) rotate(${(-a0 * 0.12).toFixed(1)}deg)` }, IN],
        [s + 690, rest, OUT], [s + 760, { opacity: 1, transform: `translateY(${(-2 * ck).toFixed(1)}px) rotate(0deg)` }, IN], [s + 830, rest], [6900, rest],
        [7300, { opacity: 0, transform: 'translateY(0px) rotate(0deg)' }], [7301, { opacity: 0, transform: up.transform }], [8000, up]]);
    });

    /* the wobbler: hit by the bubbles, it rocks on its stem, less and less */
    const swing = wob.parentNode;
    if (swing && swing.classList.contains('fz-swing')) {
      const L = [];
      for (let t = 0; t <= T; t += 80) {
        const u = t - HIT, a = u < 0 ? 0 : 11 * Math.exp(-u / 1000) * Math.sin((2 * Math.PI * u) / 780);
        L.push([t, { transform: `rotate(${a.toFixed(2)}deg)` }]);
      }
      loop(swing, L, 'linear');
    }

    /* the six-pack: the lids pop one by one, left to right, front and back in turn */
    const lids = $$('.fz-lid', six);
    [3, 0, 4, 1, 5, 2].forEach((n, j) => {
      const lid = lids[n];
      if (!lid) return;
      const s = 3050 + j * 170, Y0 = 'translateY(0px)';
      loop(lid, tf([[0, Y0], [s, Y0, OUT], [s + 100, `translateY(${(-5 * sk).toFixed(1)}px)`, IN], [s + 250, Y0, OUT],
        [s + 320, `translateY(${(-1.2 * sk).toFixed(1)}px)`, IN], [s + 390, Y0], [T, Y0]]));
      loop($('.fz-lt', lid), tf([[0, TAB0], [s + 40, TAB0, OUT], [s + 140, TAB1], [7400 + j * 40, TAB1], [7650 + j * 40, TAB0], [T, TAB0]]));
      $$('b', lid).forEach((b, i) => loop(b, [[0, B0], [s + 60 + i * 60, B0, OUT],
        [s + 140 + i * 60, { opacity: 1, transform: `translate(0px,${(-3 * sk).toFixed(1)}px) scale(.8)` }, 'linear'],
        [s + 700 + i * 60, { opacity: 0, transform: `translate(${((i ? 1 : -1) * 1.5 * sk).toFixed(1)}px,${(-11 * sk).toFixed(1)}px) scale(1.1)` }], [T, B0]]));
    });
    loop($('.fz__head', six), tf([[0, 'scale(1)'], [4100, 'scale(1)'], [4180, 'scale(1.16)'], [4320, 'scale(.97)'], [4440, 'scale(1)'], [8000, 'scale(1)']]));
  }

  /* a click (or a tap) on the can: it cracks open on the spot. These go over whatever the
     can is doing (in 05 the loop takes over again when they end). */
  function fizzPop(bn) {
    const now = performance.now();
    if (now - (bn.popAt || 0) < 1500) return;
    bn.popAt = now;
    const OUT = 'cubic-bezier(.12,.72,.32,1)';
    const a = (el, kf, o) => el && el.animate(kf, { easing: 'linear', ...o });
    const TAB0 = 'translateY(0%) rotate(0deg)', TAB1 = 'translateY(-3%) rotate(-30deg)';
    a($('.fz__tab', bn), [{ transform: TAB0, easing: OUT }, { transform: TAB1, offset: 0.08 }, { transform: TAB1, offset: 0.85 }, { transform: TAB0 }], { duration: 1700 });
    a($('.fz__mouth', bn), [{ opacity: 0 }, { opacity: 1, offset: 0.04 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: 1700 });
    a(bn, [{ transform: 'translateY(0%) scale(1,1)', easing: OUT }, { transform: 'translateY(0.8%) scale(1.025,.965)', offset: 0.15 },
      { transform: 'translateY(-2%) scale(.985,1.03)', offset: 0.5 }, { transform: 'translateY(0%) scale(1,1)' }], { duration: 400, delay: 60, easing: 'cubic-bezier(.45,0,.55,1)' });
    a($('.fz__crown', bn), [{ opacity: 1, transform: 'translateY(0%) scale(.25)', easing: OUT }, { opacity: 1, transform: 'translateY(0%) scale(1.08)', offset: 0.18 },
      { opacity: 1, transform: 'translateY(0%) scale(1)', offset: 0.3 }, { opacity: 1, transform: 'translateY(3%) scale(1.02)', offset: 0.7 },
      { opacity: 0, transform: 'translateY(16%) scale(.9)' }], { duration: 1250, delay: 60 });
    a($('.fz__pssst', bn), [{ opacity: 1, transform: 'rotate(-24deg) scale(.2)', easing: OUT }, { opacity: 1, transform: 'rotate(-6deg) scale(1.15)', offset: 0.15 },
      { opacity: 1, transform: 'rotate(-10deg) scale(1)', offset: 0.26 }, { opacity: 1, transform: 'rotate(-10deg) scale(1)', offset: 0.85 },
      { opacity: 0, transform: 'rotate(-10deg) scale(.85)' }], { duration: 1300, delay: 80 });
    const k = bn.offsetWidth / 100;
    $$('.fz__bubs i', bn).forEach((b, i) => a(b, [{ opacity: 0, transform: 'translate(0px,0px) scale(.4)', easing: OUT },
      { opacity: 1, transform: `translate(0px,${(-1.4 * k).toFixed(1)}px) scale(.8)`, offset: 0.1 },
      { opacity: 0, transform: `translate(${(((i % 3) - 1) * 1.6 * k).toFixed(1)}px,${(-(9 + (i % 4) * 2.5) * k).toFixed(1)}px) scale(1.1)` }], { duration: 900, delay: 60 + i * 60 }));
  }

  /* 03: the dieline is drawn over the flat label. 04: once it is a can, it turns a little
     now and then (it is round now); the wobbler sways. On the board (02) all holds still. */
  function fizzLife(bn, t0, phase, n) {
    const SMOOTH = 'cubic-bezier(.45,0,.55,1)';
    const label = bn.classList.contains('bn--label');
    if (n === 3 && label) {
      const die = $('.fz__die', bn);
      if (die) die.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: t0 + 900, fill: 'both' });
      return;
    }
    if (n !== 4) return;
    const T = 7000;
    const loop = (el, list, delay) => el && el.animate(list.map(([ms, v]) => ({ offset: ms / T, easing: SMOOTH, transform: v })),
      { duration: T, delay, iterations: Infinity, iterationStart: phase, fill: 'both', easing: 'linear' });
    if (label) loop($('.fz-spin', bn), [[0, 'rotateY(0deg)'], [1400, 'rotateY(-42deg)'], [2600, 'rotateY(-42deg)'], [4200, 'rotateY(28deg)'],
      [5200, 'rotateY(28deg)'], [7000, 'rotateY(0deg)']], t0 + 1500);
    else if (bn.classList.contains('bn--wob')) loop(bn.parentNode, [[0, 'rotate(0deg)'], [1750, 'rotate(1.8deg)'], [3500, 'rotate(0deg)'],
      [5250, 'rotate(-1.6deg)'], [7000, 'rotate(0deg)']], t0);
  }

  /* ------------------------------------------------ Afterlight: project 4 of the demo
     Key art for a made-up sci-fi film, composited from photographs (the layers are images
     in media/process/afterlight, in the set's markup, so they load when the set is built).
     03 pulls the one-sheet apart into its layers in 3D and puts it back together; in 05
     every format is a motion poster: out of the black, the camera creeps in, the planet
     rises behind the dune, dust blows across and the title catches the light. */
  const AL_DUR = [0, 4400, 4200, 7600, 4300, 16000];   // 05 runs the 8 s loop twice
  const AL_LAYERS = ['sky', 'planet', 'dune', 'hero', 'dust', 'grade', 'type', 'bill'];

  // 03: first the sheet turns as one piece, then its layers peel off back to front, each showing
  // its frame and name as it leaves; they close up front to back and the sheet turns back flat.
  // Returns the timings, so the layers panel can follow along
  function alApart(bn, t0) {
    const stack = $('.al__stack', bn);
    if (!stack) return null;
    const CUT = 'cubic-bezier(.75,0,.15,1)', OUT = 'cubic-bezier(.2,.8,.2,1)';
    const n = AL_LAYERS.length, T = 3900, gap = bn.offsetWidth * 0.2, mid = (n - 1) / 2;
    const go = (i) => 700 + i * 90, back = (i) => 2400 + (n - 1 - i) * 80;
    const o = (ms) => Math.min(1, ms / T);
    const a = (el, kf) => el && el.animate(kf, { duration: T, delay: t0, fill: 'both', easing: 'linear' });
    const TURN = 'translateX(-20%) rotateX(14deg) rotateY(-38deg) scale(.62)';   // (left: the layers panel is on the right)
    a(stack, [{ transform: 'none', offset: 0, easing: CUT }, { transform: TURN, offset: o(700) }, { transform: TURN, offset: o(3300), easing: CUT }, { transform: 'none', offset: 1 }]);
    AL_LAYERS.forEach((name, i) => {
      const z = `translateZ(${((i - mid) * gap).toFixed(1)}px)`, Z0 = 'translateZ(0px)';
      a($('.al__l--' + name, bn), [{ transform: Z0, offset: 0 }, { transform: Z0, offset: o(go(i)), easing: OUT }, { transform: z, offset: o(go(i) + 650) },
        { transform: z, offset: o(back(i)), easing: CUT }, { transform: Z0, offset: o(back(i) + 550) }, { transform: Z0, offset: 1 }]);
      a($(`.al__l--${name} > .al__name`, bn), [{ opacity: 0, offset: 0 }, { opacity: 0, offset: o(go(i) + 100) }, { opacity: 1, offset: o(go(i) + 450) },
        { opacity: 1, offset: o(back(i)) }, { opacity: 0, offset: o(back(i) + 250) }, { opacity: 0, offset: 1 }]);
    });
    return { T, go, back };
  }

  // steps 03-04: the dust drifts a little; on the board (02) everything holds still
  function alLife(bn, t0, phase, n) {
    const dust = $('.al__dust', bn);
    if (n === 2 || !dust || !dust.getClientRects().length) return;
    const k = bn.offsetWidth / 100;
    dust.animate([{ translate: `${(-3 * k).toFixed(1)}px 0` }, { translate: `${(3 * k).toFixed(1)}px 0` }],
      { duration: 9000, delay: t0, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', iterationStart: phase, fill: 'both' });
  }

  function afterlight(set, t0) {
    const T = 8000;
    const SMOOTH = 'cubic-bezier(.45,0,.55,1)', OUT = 'cubic-bezier(.12,.72,.32,1)';
    // keyframes at absolute ms, easing per segment; every part loops in step. Hidden parts
    // (the walker on the close-up, ...) get nothing: an animation on them would run on the main thread
    const at = (list, easing) => list.map(([ms, p, e]) => ({ offset: Math.min(1, ms / T), easing: e || easing || SMOOTH, ...p }));
    const loop = (el, list, easing) => el && el.getClientRects().length &&
      el.animate(at(list, easing), { duration: T, delay: t0, iterations: Infinity, fill: 'both', easing: 'linear' });
    const op = (list) => list.map(([ms, o, e]) => [ms, { opacity: o }, e]);
    const tf = (list) => list.map(([ms, v, e]) => [ms, { transform: v }, e]);
    $$('.bn.al', set).forEach((bn) => {
      const k = bn.offsetWidth / 100;                    // 1cqw of this banner, in px
      const px = (v) => `${(v * k).toFixed(1)}px`;
      const L = (n) => $('.al__l--' + n, bn);
      // out of the black, and back into it
      loop($('.al__dark', bn), op([[0, 1], [900, 0, OUT], [7300, 0], [7900, 1], [8000, 1]]), 'linear');
      // the camera creeps in; the far layers move less than the near ones
      loop($('.al__stack', bn), tf([[0, 'scale(1)'], [7900, 'scale(1.07)'], [8000, 'scale(1)']]), 'linear');
      loop(L('sky'), tf([[0, `translateY(${px(-1.5)})`], [7900, 'translateY(0px)'], [8000, `translateY(${px(-1.5)})`]]), 'linear');
      loop(L('dune'), tf([[0, 'translateY(0px)'], [7900, `translateY(${px(1.2)})`], [8000, 'translateY(0px)']]), 'linear');
      // the planet comes up from behind the dune (and in the visor, mirrored)
      loop(L('planet'), tf([[0, `translateY(${px(12)})`], [500, `translateY(${px(12)})`, OUT], [5200, 'translateY(0px)'], [8000, 'translateY(0px)']]));
      const vp = $('.al__visor picture', bn);
      if (vp) loop(vp, tf([[0, `translateY(${(vp.offsetHeight * 1.1).toFixed(1)}px)`], [500, `translateY(${(vp.offsetHeight * 1.1).toFixed(1)}px)`, OUT],
        [5200, 'translateY(0px)'], [8000, 'translateY(0px)']]));
      loop($('.al__glint', bn), tf([[0, 'translateX(-130%) skewX(-18deg)'], [4400, 'translateX(-130%) skewX(-18deg)'], [5200, 'translateX(520%) skewX(-18deg)'],
        [8000, 'translateX(520%) skewX(-18deg)']]));
      // he walks on, up the slope, smaller and smaller. Low gravity: three slow, soft bounces a
      // loop (2.6 s each) and a gentle rock from foot to foot; sampled finely, so it stays smooth.
      // The bounce is a share of his own height, so he floats the same in every format
      const hero = $('.al__hero', bn);
      if (hero && hero.getClientRects().length) {
        const W = [], HOP = 7900 / 3, up = hero.offsetHeight * 0.04;
        for (let t = 0; t < 7900; t += 100) {
          const u = t / 7900;
          const bob = -up * (1 - Math.cos((2 * Math.PI * t) / HOP)) / 2;
          const rock = 1.6 * Math.sin((Math.PI * t) / HOP);
          W.push([t, `translate(${px(-1.6 * u)},${(-1.4 * u * k + bob).toFixed(1)}px) rotate(${rock.toFixed(2)}deg) scale(${(1 - 0.06 * u).toFixed(3)})`, 'linear']);
        }
        W.push([7900, `translate(${px(-1.6)},${px(-1.4)}) rotate(0deg) scale(.94)`], [8000, 'translate(0px,0px) rotate(0deg) scale(1)']);
        loop(hero, tf(W), 'linear');
      }
      loop($('.al__dust', bn), [[0, { opacity: 0, transform: `translateX(${px(-14)})` }], [1600, { opacity: 1, transform: `translateX(${px(-8.4)})` }],
        [6200, { opacity: 1, transform: `translateX(${px(7.7)})` }], [7900, { opacity: 0, transform: `translateX(${px(14)})` }],
        [8000, { opacity: 0, transform: `translateX(${px(-14)})` }]], 'linear');
      // the type: the line, the title, then the light runs across it with a streak
      loop($('.al__tag', bn), op([[0, 0], [1000, 0], [1900, 1], [8000, 1]]));
      const ti = $('.al__title', bn);
      loop(ti, [[0, { opacity: 0, transform: `translateY(${px(1.2)})` }], [1700, { opacity: 0, transform: `translateY(${px(1.2)})` }, OUT],
        [2800, { opacity: 1, transform: 'translateY(0px)' }], [8000, { opacity: 1, transform: 'translateY(0px)' }]]);
      const sh = ti && $('.al__shine', ti);
      if (sh && ti.getClientRects().length) {
        // the window and the copy in it move the same way in opposite directions: the copy holds still
        const wt = ti.offsetWidth, w = sh.offsetWidth, S0 = 2900, S1 = 3900;
        loop(sh, [[0, { opacity: 1, transform: `translateX(${-w}px)` }], [S0, { opacity: 1, transform: `translateX(${-w}px)` }, SMOOTH],
          [S1, { opacity: 1, transform: `translateX(${wt}px)` }], [8000, { opacity: 1, transform: `translateX(${wt}px)` }]]);
        loop(sh.firstElementChild, tf([[0, `translateX(${w}px)`], [S0, `translateX(${w}px)`, SMOOTH], [S1, `translateX(${-wt}px)`], [8000, `translateX(${-wt}px)`]]));
      }
      loop($('.al__flare', bn), [[0, { opacity: 0, transform: 'scaleX(.2)' }], [3150, { opacity: 0, transform: 'scaleX(.2)' }, OUT],
        [3450, { opacity: 1, transform: 'scaleX(1.1)' }], [4200, { opacity: 0, transform: 'scaleX(1.5)' }], [8000, { opacity: 0, transform: 'scaleX(.2)' }]]);
      loop($('.al__date', bn), op([[0, 0], [3700, 0], [4500, 1], [8000, 1]]));
      loop($('.al__bill', bn), op([[0, 0], [4000, 0], [4800, 1], [8000, 1]]));
      loop($('.al__cta', bn), op([[0, 0], [4400, 0], [5100, 1], [8000, 1]]));
      // the app: the shelf slides in, the trailer plays, Play asks to be pressed
      loop($('.al__row', bn), [[0, { opacity: 0, transform: `translateX(${px(8)})` }], [700, { opacity: 0, transform: `translateX(${px(8)})` }, OUT],
        [1900, { opacity: 1, transform: 'translateX(0px)' }], [8000, { opacity: 1, transform: 'translateX(0px)' }]]);
      loop($('.al__new', bn), op([[0, 0], [1200, 0], [1900, 1], [8000, 1]]));
      loop($('.al__btns', bn), op([[0, 0], [3300, 0], [4000, 1], [8000, 1]]));
      loop($('.al__btns span', bn), tf([[0, 'scale(1)'], [5000, 'scale(1)'], [5200, 'scale(1.08)'], [5500, 'scale(1)'], [8000, 'scale(1)']]));
      loop($('.al__bar i', bn), tf([[0, 'scaleX(.04)'], [7900, 'scaleX(1)'], [8000, 'scaleX(.04)']]), 'linear');
    });
  }

  function setupProcess() {
    const pr = $('[data-pr]');
    if (!pr) return;
    const stage = $('.pr__stage', pr);
    const btns = $$('.pr__step', pr);
    const dots = $$('.pj__dot[data-pj]');
    const cap = $('.pr__cap', pr);
    const pauseBtn = $('.pr__pause', pr);
    // one set (brief, board, artboards) per project; each fills its banners from its template,
    // the first time it is needed: a project that isn't on yet adds nothing to the page
    const SETS = {}, built = new Set();
    $$('.pj-set', stage).forEach((s) => (SETS[s.dataset.set] = s));
    function build(k) {
      const s = SETS[k];
      if (!s || built.has(k)) return;
      built.add(k);
      const tpl = $('template[data-bn]', s);
      $$('.bn', s).forEach((b) => b.appendChild(tpl.content.cloneNode(true)));
      // the court's line lights up letter by letter
      $$('.nc__head > span', s).forEach((w) => {
        const t = w.textContent;
        w.textContent = '';
        for (const c of t) {
          if (c === ' ') { w.append(' '); continue; }
          const l = document.createElement('i');
          l.className = 'l';
          l.textContent = c;
          w.append(l);
        }
      });
    }
    const prep = (k) => { build(k); PJ[k].load(); };
    // the active step fills up while it plays: a red layer slides in from the left over a
    // dark copy of the label that holds still (two transforms, both on the compositor)
    btns.forEach((b) => {
      const f = document.createElement('span');
      f.className = 'pr__fill';
      f.setAttribute('aria-hidden', 'true');
      f.appendChild($('.pr__lbl', b).cloneNode(true));
      b.appendChild(f);
    });
    // the brief's highlighter is a layer of its own, so it can be drawn on the compositor too
    $$('.brief__list mark', stage).forEach((m) => {
      const hl = document.createElement('i');
      hl.className = 'brief__hl';
      m.prepend(hl);
    });

    // the stage takes the height left under the title and the steps, so a jump to
    // #process shows all of it at once (its size doesn't move anything above it)
    const section = pr.closest('section') || pr;
    const fit = () => pr.style.setProperty('--pr-top', Math.round(stage.getBoundingClientRect().top - section.getBoundingClientRect().top) + 'px');
    fit();
    addEventListener('resize', fit);
    if (document.fonts) document.fonts.ready.then(fit);

    let full = !lite;                       // false: still frames, cross-faded
    let step = 1, started = false, inView = false, userPaused = false, running = false;
    let due = 0, timer = 0, flyT = 0;
    const playing = () => inView && !userPaused && !document.hidden;
    const all = () => pr.getAnimations({ subtree: true });
    const E = 'cubic-bezier(.2,.8,.2,1)', CUT = 'cubic-bezier(.75,0,.15,1)';
    const anim = (el, kf, o) => el && el.animate(kf, { fill: 'both', easing: E, ...o });
    // (the opacity and the visibility apart: the opacity can run on the compositor, the visibility can't)
    const fadeOut = (els, ms = 350) => els.forEach((el) => {
      anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-in' });
      anim(el, [{ visibility: 'visible' }, { visibility: 'hidden' }], { duration: ms, easing: 'ease-in' });
    });
    const shown = (el) => el && el.getClientRects().length > 0;   // not in a display:none

    // FLIP: from the box `from` to where el is laid out now (`r`, measured before anything moves)
    const flip = (el, from, r, o) => r.width && anim(el, [
      { transform: `translate(${from.left - r.left}px,${from.top - r.top}px) scale(${from.width / r.width})`, transformOrigin: '0 0' },
      { transform: 'none', transformOrigin: '0 0' }], { easing: CUT, ...o });
    const rect = (el) => el.getBoundingClientRect();

    /* purr.: the cat and the toy, cloned into the four banners once the section gets close */
    let purrIn = false;
    function loadPurr() {
      const src = $('template[data-purr]', pr);
      if (purrIn || !src) return;
      purrIn = true;
      const [cat, toy] = src.content.querySelectorAll('svg');
      // one copy of the clip paths serves all four cats
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      defs.setAttribute('class', 'pr__defs');
      defs.setAttribute('aria-hidden', 'true');
      defs.appendChild($('defs', cat).cloneNode(true));
      stage.appendChild(defs);
      const bare = cat.cloneNode(true);
      $('defs', bare).remove();
      // the paw's shadow fades in on a group of its own: its loop has the path's opacity
      const sh = $('.c-pawRsh', bare);
      if (sh) {
        const w = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        w.setAttribute('class', 'c-pawRshw');
        sh.replaceWith(w);
        w.appendChild(sh);
      }
      $$('.bn', SETS.purr).forEach((b) => {
        const c = $('.bn__cat', b);
        c.insertBefore(bare.cloneNode(true), c.firstChild);
        $('.bn__toy', b).appendChild(toy.cloneNode(true));
      });
    }
    /* Night Court: its art is a script of its own, fetched the first time it's needed */
    let courtIn = 0;                        // 0 not yet, 1 on its way, 2 in
    function loadCourt() {
      if (courtIn || !SETS.court) return;
      courtIn = 1;
      const s = document.createElement('script');
      s.src = 'js/pr-court.js?v=a58b3f24';
      s.onload = () => {
        const art = window.prCourt, set = SETS.court;
        if (!art) return;
        courtIn = 2;
        $$('.bn--poster .nc__hero, .bn--story .nc__hero', set).forEach((h) => (h.innerHTML = art.hero));
        $('.bn--tv .nc__passer', set).innerHTML = art.passer;
        $('.nc-fly', set).innerHTML = art.fly;
      };
      s.onerror = () => (courtIn = 0);
      document.head.appendChild(s);
    }
    /* fizz: the 3D can and the small can are copies of the label (no drawings needed for
       that); the drawings come in a script of their own, the first time they're needed */
    let fizzIn = 0, fizzBuilt = false;      // 0 not yet, 1 on its way, 2 in
    function loadFizz() {
      const set = SETS.fizz;
      if (!set) return;
      if (!fizzBuilt) {
        fizzBuilt = true;
        const print = fizzRoll($('.bn--label', set)), body = $('.bn--city .fz__cbody', set);
        if (body) fizzCan(body, print);
      }
      if (fizzIn) return;
      fizzIn = 1;
      const s = document.createElement('script');
      s.src = 'js/pr-fizz.js?v=fb546e39';
      s.onload = () => {
        if (!window.prFizz) return;
        fizzIn = 2;
        stage.insertAdjacentHTML('beforeend', window.prFizz.defs);
      };
      s.onerror = () => (fizzIn = 0);
      document.head.appendChild(s);
    }

    /* what differs per project; the steps themselves are the same machine */
    const PJ = {
      purr: {
        dur: PR_DUR, load: loadPurr, life: (bn, t0, phase) => idle(bn, t0, phase),
        motion: () => bns.forEach((bn, k) => purr(bn, 250 + k * 90)),
        keep: () => [bn1],                  // what stays alive on a slow device
        // 03 from the board: the toy's string is cut at the artboard's top
        assemble() {
          const toy = $('.bn__toy', bn1);
          const toyTop = rect(bn1).top - rect(toy).top;
          anim(toy, [{ clipPath: 'inset(80% 0 0 0)' }, { clipPath: `inset(${Math.max(0, toyTop)}px 0 0 0)` }], { duration: 700, delay: 600 });
        },
      },
      court: {
        dur: NC_DUR, load: loadCourt, life: courtLife,
        motion: () => court(set, 250),
        keep: () => [bn1, $('.bn--tv', set)],
        board: () => courtParts(bn1, true, { duration: 700, delay: 1500 }),
        // (the legs' hang-time loop takes them over at once in 03, so they don't get one too)
        assemble: () => courtParts(bn1, false, { duration: 700, delay: 200 }, ['legB', 'legF']),
      },
      fizz: {
        dur: FZ_DUR, load: loadFizz, life: fizzLife,
        motion: () => fizz(set, 250),
        keep: () => [bn1, $('.bn--city', set)],
        // 02: what the label is made of comes in after its parts
        // (the lemons are <svg>s: those move on the compositor with transform, not with translate)
        board: () => [...$$('.fz__phases > svg', bn1), $('.fz__sketch', bn1), $('.fz__ice', bn1), $('.fz__crown', bn1)].forEach((el, i) =>
          anim(el, el instanceof SVGElement ? [{ opacity: 0, transform: 'translateY(3cqw)' }, { opacity: 1, transform: 'none' }]
            : [{ opacity: 0, translate: '0 3cqw' }, { opacity: 1, translate: '0 0' }], { duration: 550, delay: 1300 + i * 140 })),
        assemble: () => [$('.fz__back', bn1), $('.fz__band', bn1)].forEach((el) => anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 650 })),
        // 04: the flat label rolls up into the can; the metal closes in as it comes round
        wrap() {
          const roll = $('.fz-roll', bn1);
          if (!roll) return;
          const o = { duration: 1150, delay: 380, easing: 'cubic-bezier(.55,0,.25,1)' };
          anim(roll, [{ transform: 'rotateX(0deg)' }, { transform: `rotateX(${FZ_TILT}deg)` }], o);
          $$('.fz-h--r', bn1).forEach((h) => anim(h, [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${FZ_A}deg)` }], o));
          $$('.fz-h--l', bn1).forEach((h) => anim(h, [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${-FZ_A}deg)` }], o));
          $$(':scope > :is(.fz__neck, .fz__bot, .fz__shade, .fz__shadow, .fz__wet):not(.fz__mouth), .fz-core', bn1)
            .forEach((el) => anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 380, delay: 1250 }));
        },
      },
    };
    PJ.afterlight = {
      dur: AL_DUR, load() {}, life: alLife,
      motion: () => afterlight(set, 250),
      keep: () => [bn1, $('.bn--app', set)],
      // 02: the hero is cut out of the studio shot: a selection runs round him, the backdrop goes
      board() {
        const h = $('.al__hero', bn1);
        anim($('.al__raw', h), [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 3000, easing: 'linear' });
        anim($('.al__ants', h), [{ opacity: 1, clipPath: 'inset(0 0 100% 0)' }, { opacity: 1, clipPath: 'inset(0 0 0% 0)', offset: 0.4 },
          { opacity: 1, clipPath: 'inset(0 0 0% 0)', offset: 0.75 }, { opacity: 0, clipPath: 'inset(0 0 0% 0)' }], { duration: 2200, delay: 1100, easing: 'linear' });
      },
      // 03: a pointer flips the layers panel to 3D, the key visual comes apart into its layers
      // (each row lights up while its layer is out), then back to 2D and it closes up
      key() {
        const S = 3300;                       // the view turns 3D here, once the guides have had their moment
        const t = alApart(bn1, S);
        const panel = $('.al-panel', set);
        if (!t || !panel || !panel.getClientRects().length) return;   // (phones: no panel, the sheet just comes apart)
        anim(panel, [{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 900 });
        // one timeline for the whole step, so every element gets a single animation per property
        const D = S + t.T;
        const tl = (el, list) => el && el.animate(list.map(([ms, p, e]) => ({ offset: Math.min(1, ms / D), easing: e || 'linear', ...p })), { duration: D, fill: 'both' });
        const rows = $$('.al-panel li', set);   // front (billing block) to back (sky)
        rows.forEach((li, r) => {
          const i = rows.length - 1 - r, on = S + t.go(i), off = S + t.back(i);
          tl($('b', li), [[0, { opacity: 0 }], [on, { opacity: 0 }], [on + 250, { opacity: 1 }], [off, { opacity: 1 }], [off + 250, { opacity: 0 }], [D, { opacity: 0 }]]);
        });
        const off = (el) => {
          let x = 0, y = 0;
          for (let e = el; e && e !== set; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
          return [x, y];
        };
        const lab = $$('.al-3d i', set), cur = $('.al-cursor', set);
        const at = (el) => { const [x, y] = off(el); return [x + el.offsetWidth * 0.5, y + el.offsetHeight * 0.6]; };
        const [ax, ay] = off(ab1), p0 = [ax + ab1.offsetWidth * 0.78, ay + ab1.offsetHeight * 0.72], p3 = at(lab[1]), p2 = at(lab[0]);
        const pos = ([x, y], s = 1) => ({ transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s})` });
        const IO = 'cubic-bezier(.45,0,.2,1)', C1 = S - 300, C2 = S + t.back(rows.length - 1) - 250;   // the two clicks
        tl(cur, [[0, { opacity: 0, ...pos(p0) }], [1900, { opacity: 0, ...pos(p0) }], [2150, { opacity: 1, ...pos(p0) }, IO],
          [C1 - 120, { opacity: 1, ...pos(p3) }], [C1, { opacity: 1, ...pos(p3) }], [C1 + 80, { opacity: 1, ...pos(p3, 0.84) }], [C1 + 200, { opacity: 1, ...pos(p3) }],
          [C2 - 380, { opacity: 1, ...pos(p3) }, IO], [C2 - 60, { opacity: 1, ...pos(p2) }], [C2, { opacity: 1, ...pos(p2) }], [C2 + 80, { opacity: 1, ...pos(p2, 0.84) }],
          [C2 + 200, { opacity: 1, ...pos(p2) }], [C2 + 450, { opacity: 1, ...pos(p2) }], [C2 + 800, { opacity: 0, ...pos([p2[0] + 18, p2[1] + 26]) }], [D, { opacity: 0, ...pos(p0) }]]);
        const ring = (s, o) => ({ opacity: o, transform: `scale(${s})` });
        tl($('i', cur), [[0, ring(0.3, 0)], [C1, ring(0.3, 0)], [C1 + 30, ring(0.4, 0.9)], [C1 + 420, ring(1.6, 0)], [C2, ring(0.3, 0)],
          [C2 + 30, ring(0.4, 0.9)], [C2 + 420, ring(1.6, 0)], [D, ring(1.6, 0)]]);
        const X1 = `translateX(${lab[1].offsetLeft - lab[0].offsetLeft}px)`;
        tl($('.al-3d em', set), [[0, { transform: 'translateX(0px)' }], [C1 + 40, { transform: 'translateX(0px)' }, IO], [C1 + 260, { transform: X1 }],
          [C2 + 40, { transform: X1 }, IO], [C2 + 260, { transform: 'translateX(0px)' }], [D, { transform: 'translateX(0px)' }]]);
      },
    };
    const ORDER = Object.keys(PJ).filter((k) => SETS[k]);
    let pj = pr.dataset.pj || ORDER[0], P, set, brief, board, abs, ab1, others, bns, bn1, caps;
    function bind() {
      P = PJ[pj];
      set = SETS[pj];
      brief = $('.pr__brief', set);
      board = $('.pr__board', set);
      abs = $$('.ab', set);
      ab1 = $('.ab--key', set);
      others = abs.filter((a) => a !== ab1);
      bns = abs.map((a) => $('.bn', a));    // not the copies of the fizz label inside them
      bn1 = $('.bn', ab1);
      caps = $$('.pj-caps li', set).map((li) => li.textContent);
    }
    bind();
    let left = P.dur[1];
    let next = () => advance();             // what happens when `left` runs out
    // a device that can't keep up: only the key banners stay alive, the others hold still
    const calm = () => { const keep = P.keep(); bns.forEach((bn) => !keep.includes(bn) && bn.getAnimations({ subtree: true }).forEach((a) => a.cancel())); };

    /* if the motion stutters on this device, the rest plays as still frames */
    let epoch = 0;                          // bumped on every step change: a probe only judges its own step
    function probe(ms, low) {
      let n = 0;
      const t0 = performance.now(), e = epoch;
      const f = (t) => {
        if (!playing() || e !== epoch) return;
        n++;
        if (t - t0 < ms) requestAnimationFrame(f);
        else if ((n * 1000) / (t - t0) < 40) low();
      };
      requestAnimationFrame(f);
    }

    const ENTER = {
      1(prev) {
        if (prev >= 4) fadeOut(abs);
        else if (prev > 1) fadeOut(prev === 2 ? [ab1, board] : [ab1]);
        anim(brief, [{ opacity: 0, transform: 'translateY(2%) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: prev > 1 ? 250 : 0 });
        $$('.brief__top, .brief__list > div', brief).forEach((r, i) =>
          anim(r, [{ opacity: 0, transform: 'translateY(0.8em)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 300 + i * 150 }));
        anim($('.brief__hl', brief), [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 500, delay: 1500, easing: 'ease-in-out' });
        const line = $('.brief__line', brief), strong = $('strong', line);
        const typing = `steps(${strong.textContent.length}, jump-end)`;
        anim(line, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 2000 });
        // typed out, one letter a step
        anim(strong, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], { duration: 950, delay: 2250, easing: typing });
        // a caret rides the typing, then keeps blinking
        const caret = $('.brief__caret', line);
        anim(caret, [{ opacity: 1, translate: `${-strong.offsetWidth}px 0` }, { opacity: 1, translate: '0 0' }], { duration: 950, delay: 2250, easing: typing });
        anim(caret, [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }],
          { duration: 900, delay: 3200, iterations: Infinity, easing: 'linear', fill: 'none' });
      },
      2(prev, first) {
        if (prev === 1) fadeOut([brief]);
        if (prev >= 4) fadeOut(others);
        if (first.ab1) flip(ab1, first.ab1, first.ab1now, { duration: 700 });
        if (prev >= 3) anim($('.bn__bg', bn1), [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
        anim(board, [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 150 });
        [...$$('[data-part]', bn1), $('.bn__pal', bn1)].forEach((el, i) => shown(el) &&
          anim(el, [{ opacity: 0, translate: '0 3cqw' }, { opacity: 1, translate: '0 0' }], { duration: 550, delay: 450 + i * 120 }));
        P.life(bn1, 600, 0, 2);
        if (P.board) P.board();
      },
      3(prev, first) {
        const parts = $$('[data-part]', bn1);
        bn1.classList.add('is-flying');
        flyT = setTimeout(() => bn1.classList.remove('is-flying'), 1500);
        if (first.ab1) flip(ab1, first.ab1, first.ab1now, { duration: 800 });
        if (first.parts) {
          fadeOut([board], 500);
          anim($('.bn__pal', bn1), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
          if (P.assemble) P.assemble();
          parts.forEach((el, i) => shown(el) && anim(el, [{ transform: first.parts[i], transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }],
            { duration: 950, delay: 250 + i * 70, easing: CUT }));
        } else {
          if (prev === 1) fadeOut([brief]);
          if (prev >= 4) fadeOut(others);
          parts.forEach((el, i) => shown(el) && anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 200 + i * 60 }));
        }
        anim($('.bn__bg', bn1), [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 150, easing: CUT });
        anim($('.bn__guides', bn1), [{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0% 0 0)', offset: 0.22 },
          { opacity: 1, clipPath: 'inset(0 0% 0 0)', offset: 0.8 }, { opacity: 0, clipPath: 'inset(0 0% 0 0)' }], { duration: 2500, delay: 800, easing: 'linear' });
        anim($('.ab__label', ab1), [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 1100 });
        if (P.key) P.key();
        P.life(bn1, 300, 0, 3);
        probe(1200, () => (full = false));
      },
      4(prev, first) {
        if (prev === 1) fadeOut([brief]);
        if (prev === 2) fadeOut([board]);
        // measure the end layout before anything moves: the parts of the new formats start
        // where the key visual has them (in proportion) and slide to their own places
        const B1 = rect(bn1);
        const twin = {};
        $$('[data-part]', bn1).forEach((el) => {
          const r = rect(el);
          twin[el.dataset.part] = { x: (r.left - B1.left) / B1.width, y: (r.top - B1.top) / B1.height, w: r.width / B1.width };
        });
        const plan = others.map((a) => {
          const bn = $('.bn', a), B = rect(bn);
          return [a, $$('[data-part]', bn).map((el) => {
            const t = twin[el.dataset.part];
            // a part the key visual doesn't have (the broadcast kit) just fades in
            return [el, t && t.w ? { left: B.left + t.x * B.width, top: B.top + t.y * B.height, width: t.w * B.width } : null, rect(el)];
          })];
        });
        if (first.ab1) flip(ab1, first.ab1, first.ab1now, { duration: 900 });
        else if (prev === 1) anim(ab1, [{ opacity: 0 }, { opacity: 1 }], { duration: 450, delay: 100 });
        P.life(bn1, 0, 0, 4);
        if (P.wrap && prev < 4) P.wrap();
        plan.forEach(([a, parts], k) => {
          const d = (first.ab1 ? 450 : 100) + k * 160;
          anim(a, [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: d });
          parts.forEach(([el, from, r], i) => (from ? flip(el, from, r, { duration: 1050, delay: d + 250 + i * 45 })
            : r.width && anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: d + 500 })));
          P.life($('.bn', a), d, (k + 1) / 4, 4);
        });
        anim($('.bn--9x16 .bn__safe, .bn--story .bn__safe, .bn--char .bn__safe', set), [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
          { duration: 2300, delay: 1400, easing: 'linear' });
        probe(1200, () => { full = false; calm(); });
      },
      5(prev, first) {
        if (prev < 4) {                       // jumped straight here: bring the grid in
          if (prev === 1) fadeOut([brief]);
          if (prev === 2) fadeOut([board]);
          if (first.ab1) flip(ab1, first.ab1, first.ab1now, { duration: 800 });
          (first.ab1 ? others : abs).forEach((a, k) => anim(a, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 200 + k * 100 }));
        }
        // a render pass sweeps across each banner, then its motion version plays
        bns.forEach((bn, k) => anim($('.bn__scan', bn), [{ opacity: 1, transform: 'translateX(-100%)' }, { opacity: 1, transform: 'translateX(100%)' }],
          { duration: 700, delay: k * 90, easing: 'ease-in-out', fill: 'none' }));
        P.motion();
        probe(1600, () => { full = false; calm(); });
      },
    };

    function go(n, animate = true) {
      const prev = step;
      const moving = full && animate && started;
      const first = {};
      if (moving) {
        // FLIP "first": snapshots before the state changes
        if (n === 3 && prev === 2) first.parts = $$('[data-part]', bn1).map((el) => getComputedStyle(el).transform);
        if (prev > 1 && n > 1 && (n >= 4) !== (prev >= 4)) first.ab1 = rect(ab1);
      }
      clearTimeout(timer);
      clearTimeout(flyT);
      running = false;
      epoch++;
      all().forEach((a) => a.cancel());
      bn1.classList.remove('is-flying');
      unaim();
      step = n;
      pr.dataset.step = n;
      btns.forEach((b, i) => {
        b.classList.toggle('is-active', i === n - 1);
        b.classList.toggle('is-done', i < n - 1);
        b.setAttribute('aria-pressed', String(i === n - 1));
      });
      const b = btns[n - 1];
      caption(`Step ${$('.pr__n', b).textContent} / 05`, $('.pr__t', b).textContent, caps[n - 1] || '');
      // the active button fills up while its step plays
      const fl = $('.pr__fill', b), fo = { duration: P.dur[n], easing: 'linear', fill: 'forwards' };
      anim(fl, [{ transform: 'translateX(-100%)' }, { transform: 'none' }], fo);
      anim(fl.firstChild, [{ transform: 'translateX(100%)' }, { transform: 'none' }], fo);
      if (first.ab1) first.ab1now = rect(ab1);
      if (n > 1) prep(pj);
      if (n >= 3 && ORDER.length > 1) prep(ORDER[(ORDER.indexOf(pj) + 1) % ORDER.length]);   // the next one, ahead of time
      if (moving) ENTER[n](prev, first);
      else if (started) anim(stage, [{ opacity: 0.2 }, { opacity: 1 }], { duration: 380, fill: 'none' });
      left = P.dur[n];
      next = () => advance();
      if (!playing()) all().forEach((a) => a.playState === 'running' && a.pause());
      sync();
    }
    // after 05 comes the next project's brief; the last one hands back to the first
    function advance() {
      if (step < 5) return go(step + 1);
      show(ORDER[(ORDER.indexOf(pj) + 1) % ORDER.length]);
    }
    function show(k) {
      if (!PJ[k] || !SETS[k]) return;
      if (k !== pj) {
        all().forEach((a) => a.cancel());
        pj = k;
        pr.dataset.pj = k;
        bind();
        dots.forEach((d) => {
          const on = d.dataset.pj === k;
          d.classList.toggle('is-active', on);
          d.setAttribute('aria-current', String(on));
        });
      }
      prep(pj);
      step = 1;                             // a new project starts on its brief
      go(1);
    }

    function caption(k, title, text) {
      const num = document.createElement('span');
      const t = document.createElement('b');
      num.textContent = k;
      t.textContent = title;
      cap.replaceChildren(num, t, text);
    }

    /* the cats look at the cursor (or at a tap, for a moment) and swat when clicked; full
       motion only. The look is a transform attribute on groups of its own, so it sits on
       top of whatever the cat is animating. */
    let aimX = 0, aimY = 0, aimOn = false, aimRaf = 0, tapT = 0;
    const eased = new Map();
    const cats = () => (step >= 4 ? bns : step > 1 ? [bn1] : []).map((b) => $('.bn__cat svg', b)).filter(Boolean);
    function aim() {
      aimRaf = 0;
      const svgs = cats();
      const boxes = svgs.map((el) => el.getBoundingClientRect());    // all reads, then all writes
      let busy = false;                   // settled: the loop stops until the pointer moves again
      svgs.forEach((el, i) => {
        const r = boxes[i], k = r.width / 1480;                       // viewBox 290 470 1480 1030
        let tx = 0, ty = 0, ta = 0;
        if (aimOn && k) {
          const dx = aimX - (r.left + 738 * k), dy = aimY - (r.top + 399 * k);   // between the eyes (1028, 869)
          const d = Math.hypot(dx, dy) || 1, f = Math.min(1, d / (r.width * 0.35));
          tx = (dx / d) * f * 20;
          ty = (dy / d) * f * 14;
          ta = Math.max(-1, Math.min(1, dx / r.width)) * 6;
        }
        const v = eased.get(el) || [0, 0, 0];
        v[0] += (tx - v[0]) * 0.18;
        v[1] += (ty - v[1]) * 0.18;
        v[2] += (ta - v[2]) * 0.14;
        eased.set(el, v);
        if (Math.abs(v[0] - tx) + Math.abs(v[1] - ty) + Math.abs(v[2] - ta) < 0.05) return;
        busy = true;
        $$('.c-lookL, .c-lookR', el).forEach((g) => g.setAttribute('transform', `translate(${v[0].toFixed(1)} ${v[1].toFixed(1)})`));
        $('.c-aim', el).setAttribute('transform', `rotate(${v[2].toFixed(2)} 1032 1040)`);
      });
      if (busy) aimRaf = requestAnimationFrame(aim);
    }
    const aimAt = (e) => {
      aimX = e.clientX;
      aimY = e.clientY;
      aimOn = true;
      if (!aimRaf) aimRaf = requestAnimationFrame(aim);
    };
    const release = () => {                 // back to looking straight ahead
      aimOn = false;
      if (!aimRaf) aimRaf = requestAnimationFrame(aim);
    };
    function unaim() {
      eased.clear();
      $$('.c-lookL, .c-lookR, .c-aim', stage).forEach((g) => g.removeAttribute('transform'));
      if (aimOn && !aimRaf) aimRaf = requestAnimationFrame(aim);
    }
    stage.addEventListener('pointermove', (e) => { if (full && e.pointerType !== 'touch') aimAt(e); });
    stage.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') release(); });
    stage.addEventListener('pointerdown', (e) => {
      if (!full || step < 2) return;
      if (e.pointerType === 'touch') {
        aimAt(e);
        clearTimeout(tapT);
        tapT = setTimeout(release, 1500);
      }
      const hit = e.target.closest('.bn__cat'), bn = hit && hit.closest('.bn');
      if (bn && (step >= 4 || bn === bn1)) swat(bn);
      if (pj === 'fizz' && step >= 4 && e.target.closest('.ab--label')) {
        const r = rect($('.fz__shade', bn1));                    // the can, from just above the lid down
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - r.height * 0.22 && e.clientY <= r.bottom) fizzPop(bn1);
      }
    });

    // start or stop the clock (and every animation) to match playing()
    function sync() {
      if (playing() && !running) {
        running = true;
        all().forEach((a) => a.playState === 'paused' && a.play());
        due = performance.now() + left;
        timer = setTimeout(next, left);
      } else if (!playing() && running) {
        running = false;
        clearTimeout(timer);
        left = Math.max(0, due - performance.now());
        // only running ones: play() on a finished animation would start it over
        all().forEach((a) => a.playState === 'running' && a.pause());
      }
    }

    const setPaused = (p) => {
      userPaused = p;
      pr.classList.toggle('is-paused', p);
      pauseBtn.setAttribute('aria-pressed', String(p));
      $('.pr__ptxt', pauseBtn).textContent = p ? 'Play' : 'Pause';
    };
    btns.forEach((b, i) => b.addEventListener('click', () => {
      setPaused(false);
      started = true;
      go(i + 1);
    }));
    dots.forEach((d) => d.addEventListener('click', () => {
      setPaused(false);
      started = true;
      show(d.dataset.pj);
    }));
    pauseBtn.addEventListener('click', () => {
      setPaused(!userPaused);
      if (!started) { started = true; go(1); } else sync();
    });
    document.addEventListener('visibilitychange', sync);
    onLiteOff.push(() => (full = true));

    go(1, false);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => {
        inView = en.isIntersecting;
        if (inView && !started) {
          started = true;
          go(1);
        } else sync();
      }, { threshold: 0.3 }).observe(stage);
      const near = new IntersectionObserver(([en]) => {
        if (!en.isIntersecting) return;
        near.disconnect();
        prep(pj);
      }, { rootMargin: '800px 0px' });
      near.observe(pr);
    } else {
      prep(pj);
      inView = started = true;
      go(1);
    }
  }

  /* =========================================================== CASE PAGES */
  function setupCase() {
    if (!isCase) return;

    addEventListener('scroll', () => {
      document.body.classList.toggle('is-scrolled', scrollY > 24);
    }, { passive: true });

    /* gallery + cover videos: play only while visible */
    const vids = $$('video[data-autoplay]');
    function startAutoplay() {
      if (lite || !('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => (en.isIntersecting ? play(en.target) : en.target.pause()));
      }, { threshold: 0.3 });
      vids.forEach((v) => io.observe(v));
    }
    startAutoplay();

    /* lightbox with arrow-key navigation (a marquee copy opens its original) */
    const dlg = $('[data-lightbox]');
    const items = $$('.g-open:not(.g-dup)');
    if (dlg && items.length) {
      const frame = $('.lightbox__frame', dlg);
      const cap = $('.lightbox__cap', dlg);
      let cur = 0;
      function show(i) {
        cur = (i + items.length) % items.length;
        const b = items[cur];
        frame.textContent = '';
        let el;
        if (b.dataset.video) {
          el = makeVideo(b.dataset.video);
          el.controls = true;
        } else {
          el = new Image();
          el.src = b.dataset.full;
          el.alt = b.getAttribute('aria-label').replace(/^Open — /, '');
          el.decoding = 'async';
        }
        frame.appendChild(el);
        const fc = b.closest('figure')?.querySelector('figcaption');
        cap.textContent = `${cur + 1} / ${items.length} — ${b.dataset.cap || (fc ? fc.textContent : '')}`;
        if (el.tagName === 'VIDEO') play(el);
      }
      items.forEach((b, i) => b.addEventListener('click', () => { show(i); openDialog(dlg); }));
      $$('.g-dup').forEach((d) => d.addEventListener('click', () => {
        const i = items.findIndex((b) => b.dataset.k === d.dataset.k);
        if (i >= 0) { show(i); openDialog(dlg); }
      }));
      $('[data-close]', dlg).addEventListener('click', () => closeDialog(dlg));
      dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target === frame) closeDialog(dlg); });
      dlg.addEventListener('close', () => { $$('video', dlg).forEach((v) => v.pause()); frame.textContent = ''; });
      dlg.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') show(cur + 1);
        if (e.key === 'ArrowLeft') show(cur - 1);
      });
    }

    /* before / after breakdown */
    $$('.bd').forEach((bd) => {
      const r = $('.bd__range', bd);
      const set = (v) => bd.style.setProperty('--pos', v + '%');
      r.addEventListener('input', () => set(r.value));
      if (reduceMotion || !('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver(([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        let start = null;
        const step = (t) => {
          if (start === null) start = t;
          const p = Math.min(1, (t - start) / 1800);
          const v = 50 + Math.sin(p * Math.PI * 2) * 30 * (1 - p * 0.3);
          set(v.toFixed(2));
          r.value = v;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, { threshold: 0.5 });
      io.observe(bd);
    });
  }

  /* ------------------------------------------------------------ work blocks
     One campaign, carousel or series per screen, grouped by kind (case pages). On a desktop
     with motion the blocks are sticky: the next one slides up over the current one, which
     shrinks and darkens. A carousel block stays pinned while the .blk-run after it scrolls
     by, and its rows move sideways in turns. A block fully covered is hidden and its videos
     pause. Cards cycle through their formats while their block is on screen. */
  function setupBlocks() {
    const wrap = $('[data-blocks]');
    if (!wrap) return;
    const blocks = $$('.blk', wrap);
    const pinned = blocks.filter((b) => b.classList.contains('blk--tracks'));
    const chap = $('.chap');
    const links = chap ? $$('a', chap) : [];
    const motion = () => mqDesktop.matches && !lite;
    blocks.forEach((b) => {
      b._in = $('.blk__in', b);
      b._shade = $('.blk__shade', b);
      b._bar = $('.tracks__bar i', b);
    });

    // how far each pinned carousel moves sideways = how long it stays pinned
    function sizeRuns() {
      const m = motion();
      blocks.forEach((b) => {
        b._h = b.offsetHeight;
        if (!m) { b._in.style.transform = ''; b._shade.style.opacity = ''; }
      });
      pinned.forEach((b) => {
        b._tracks = $$('.track', b).map((t) => {
          const view = $('.track__view', t);
          const r = $('.track__run', view);
          r.style.transform = '';
          const pad = parseFloat(getComputedStyle(view).paddingLeft) || 0;
          return { r, dir: +t.dataset.dir, max: Math.max(0, r.scrollWidth - (view.clientWidth - 2 * pad)) };
        });
        const d = Math.max(0, ...b._tracks.map((t) => t.max));
        b._dist = m && d > 80 ? Math.min(d, innerHeight * 1.4) : 0;   // long rows move a little faster than the page
        const run = b.nextElementSibling;
        if (run && run.classList.contains('blk-run')) { b._run = run; run.style.height = b._dist + 'px'; }
      });
    }

    let raf = 0;
    let current = null;
    function frame() {
      raf = 0;
      const vh = innerHeight;
      const m = motion();
      // reads first, then writes, so nothing forces a second layout
      const tops = blocks.map((b) => b.getBoundingClientRect().top);
      const runs = pinned.map((b) => (b._dist ? b._run.getBoundingClientRect().top : 0));
      const wr = wrap.getBoundingClientRect();
      let cur = null;
      blocks.forEach((b, i) => {
        const p = i + 1 < blocks.length ? Math.min(1, Math.max(0, 1 - tops[i + 1] / vh)) : 0;
        if (m) {
          b._in.style.transform = p > 0 ? `scale(${(1 - p * 0.05).toFixed(4)})` : '';
          b._shade.style.opacity = p > 0 ? (p * 0.7).toFixed(3) : '';
        }
        const under = p >= 1;
        if (under !== b.classList.contains('is-under')) {
          b.classList.toggle('is-under', under);
          $$('video', b).forEach((v) => (under ? v.pause() : !lite && play(v)));
        }
        b.classList.toggle('is-live', !under && tops[i] < vh && tops[i] + b._h > 0);
        if (tops[i] <= vh * 0.5) cur = b;
      });
      pinned.forEach((b, j) => {
        if (!b._dist) return;
        const q = Math.min(1, Math.max(0, (vh - runs[j]) / b._dist));
        b._tracks.forEach((t) => {
          const x = t.dir > 0 ? -q * t.max : -(1 - q) * t.max;
          t.r.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
        });
        if (b._bar) b._bar.style.transform = `scaleX(${q.toFixed(4)})`;
      });
      if (cur !== current) {
        current = cur;
        links.forEach((a) => a.classList.toggle('is-active', !!cur && a.dataset.kind === cur.dataset.kind));
      }
      if (chap) chap.classList.toggle('is-on', wr.top < vh * 0.5 && wr.bottom > vh * 0.6);
    }
    const req = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const refit = () => { sizeRuns(); req(); };

    // scroll work only while the blocks are near the screen
    let near = false;
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting === near) return;
      near = en.isIntersecting;
      if (near) { addEventListener('scroll', req, { passive: true }); req(); return; }
      removeEventListener('scroll', req);
      blocks.forEach((b) => b.classList.remove('is-live'));
      if (chap) chap.classList.remove('is-on');
    }, { rootMargin: '50% 0px' }).observe(wrap);
    addEventListener('resize', refit);
    mqDesktop.addEventListener('change', refit);
    onLiteOff.push(refit);
    sizeRuns();
    frame();

    // the kind bar: a block's own place in the page (a stuck block reports where it is stuck)
    links.forEach((a) => a.addEventListener('click', (e) => {
      const t = document.getElementById(a.getAttribute('href').slice(1));
      if (!t) return;
      e.preventDefault();
      let y = wrap.getBoundingClientRect().top + scrollY;
      for (const c of wrap.children) { if (c === t) break; y += c.offsetHeight; }
      scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
    }));

    // cards: one card at a time shows its next format
    const decks = $$('.card__frames', wrap).filter((d) => d.children.length > 1);
    if (decks.length && !reduceMotion) {
      let tick = 0;
      setInterval(() => {
        if (document.hidden) return;
        const live = decks.filter((d) => d.closest('.blk').classList.contains('is-live'));
        if (!live.length) return;
        const fs = Array.from(live[tick++ % live.length].children);
        const k = fs.findIndex((f) => f.classList.contains('is-on'));
        fs[k].classList.remove('is-on');
        fs[(k + 1) % fs.length].classList.add('is-on');
      }, 1700);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) $$('video').forEach((v) => v.pause());
  });

  /* ------------------------------------------------ avatar: blink + wink */
  function setupAvatar() {
    const avs = $$('.av');
    if (!avs.length || reduceMotion) return;
    const flash = (cls, ms) => {
      avs.forEach((a) => a.classList.add(cls));
      setTimeout(() => avs.forEach((a) => a.classList.remove(cls)), ms);
    };
    // blink at natural, uneven intervals; sometimes a double blink
    const blink = () => {
      if (!document.hidden) {
        flash('is-blink', 140);
        if (Math.random() < 0.22) setTimeout(() => flash('is-blink', 120), 300);
      }
      setTimeout(blink, 2200 + Math.random() * 3800);
    };
    setTimeout(blink, 1800);
    // a wink to say hello once the page has settled
    if (!introPlayed) addEventListener('load', () => setTimeout(() => flash('is-wink', 520), 1400));
  }

  /* --------------------------------------------- Google Analytics
     The same tag the old site had (G-B4G8NFN85M), fetched only once the page has
     settled so it never competes with the first paint; never on a local copy. */
  function setupAnalytics() {
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    const ID = 'G-B4G8NFN85M';
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', ID);
    const load = () => {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
      document.head.appendChild(s);
    };
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
    if (document.readyState === 'complete') idle(load, { timeout: 3000 });
    else addEventListener('load', () => idle(load, { timeout: 3000 }));
  }

  setupIntro();
  setupContact();
  setupAvatar();
  setupHome();
  setupProcess();
  setupCase();
  setupBlocks();
  setupBurn();
  setupLit();
  setupJumps();
  setupAbout();
  setupCyber();
  setupAnalytics();
})();
