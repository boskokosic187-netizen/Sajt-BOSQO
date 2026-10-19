/* UMBRA live: scrub the sun over Belgrade, or see what the real sun is doing to the pillars right now. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const cv = $('#c'), ui = $('#ui'), slider = $('#t'), clockEl = $('#clock'), sunEl = $('#sun'), readEl = $('#read');
  const btnPlay = $('#play'), btnNow = $('#now'), btnKey = $('#key'), dateEl = $('#date');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let eng = null, data = null, playing = !reduce, visible = true, paused = false, dirty = true, raf = 0, last = 0;
  let minutes = reduce ? 18 * 60 + 47 : 18 * 60 + 5, date = '2027-06-21', live = false, firstStop = !reduce;
  const cam = { az: -8, el: 52, dist: 128, tx: 0, tz: 1 };
  const KEY = 18 * 60 + 47;

  function fail() { document.body.classList.add('nogl'); }
  function hhmm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(m / 60 | 0).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

  function camera() {
    const e = cam.el * Math.PI / 180, a = cam.az * Math.PI / 180;
    const t = [cam.tx, 0, cam.tz];
    const pos = [t[0] + cam.dist * Math.sin(a) * Math.cos(e), t[1] + cam.dist * Math.sin(e), t[2] + cam.dist * Math.cos(a) * Math.cos(e)];
    const up = cam.el > 89.4 ? [-Math.sin(a), 0, -Math.cos(a)] : [0, 1, 0];
    const narrow = innerWidth / innerHeight < 0.8;
    return { pos, target: t, up, fov: narrow ? 52 : 30 };
  }

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (eng && (eng.W !== w || eng.H !== h)) { eng.resize(w, h); dirty = true; }
    const narrow = innerWidth / innerHeight < 0.8;
    if (narrow && cam.az > -60) { cam.az = -90; cam.el = 62; cam.dist = 124; cam.tx = -15; cam.tz = 0; }
  }

  function update(dt) {
    if (playing && !live) {
      // the clock slows to almost nothing around 18:47 and races through the night
      const d = Math.min(Math.abs(minutes - KEY), 1440 - Math.abs(minutes - KEY));
      const s = eng ? eng.sun(minutes % 1440, date) : { alt: 10 };
      let speed = 95 * (1 - 0.92 * Math.exp(-(d * d) / (2 * 14 * 14)));
      if (s.alt < -4) speed = 900;
      const prev = minutes;
      minutes = (minutes + speed * dt) % 1440;
      if (firstStop && prev < KEY && minutes >= KEY) { minutes = KEY; playing = false; firstStop = false; btnPlay.classList.remove('on'); }
      dirty = true;
    }
    if (live) {
      const now = belgradeNow(); minutes = now.minutes; date = now.date; dirty = true;
    }
  }

  function belgradeNow() {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute + +p.second / 60, tz: tzOffset() };
  }
  function tzOffset() {
    const d = new Date(), u = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' })), b = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Belgrade' }));
    return Math.round((b - u) / 3600000);
  }

  function readout(s) {
    clockEl.textContent = hhmm(minutes);
    document.body.classList.toggle('night', s.alt < -3);
    sunEl.textContent = s.alt > -0.8 ? `SUN ${s.az.toFixed(1)}° / ${s.alt.toFixed(1)}°` : 'SUN BELOW THE HORIZON';
    const az = data.key.az, alt = data.key.alt;
    const err = Math.hypot((s.az - az) * Math.cos(alt * Math.PI / 180), (s.alt - alt) * 1.6);
    const reads = err < 0.8 ? 'IT READS' : err < 6 ? 'ALMOST' : '';
    readEl.textContent = reads; readEl.className = reads === 'IT READS' ? 'on' : reads ? 'near' : '';
    if (!slider.matches(':active')) slider.value = Math.round(minutes % 1440);
    dateEl.textContent = live ? 'NOW IN BELGRADE · ' + date.split('-').reverse().join('.') : '21.06.2027';
  }

  function frame(t) {
    raf = 0;
    if (paused || !visible) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
    update(dt);
    if (dirty) {
      if (live) eng.data.tz = belgradeNow().tz; else eng.data.tz = 2;
      const s = eng.render({ minutes: minutes % 1440, date, cam: camera(), vignette: 0.18, city: true });
      readout(s); dirty = false;
    }
    if (playing || live || drag) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && !paused && visible && eng) { last = 0; raf = requestAnimationFrame(frame); } }

  // controls
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el }; cv.setPointerCapture(e.pointerId); kick(); });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    cam.az = drag.az - (e.clientX - drag.x) * 0.25; cam.el = Math.max(8, Math.min(89.6, drag.el + (e.clientY - drag.y) * 0.25));
    dirty = true; kick();
  });
  const end = () => { drag = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(30, Math.min(260, cam.dist * Math.exp(e.deltaY * 0.0012))); dirty = true; kick(); }, { passive: false });
  cv.addEventListener('dblclick', () => { cam.el = cam.el > 85 ? 52 : 89.6; dirty = true; kick(); });
  slider.addEventListener('input', () => { live = false; playing = false; minutes = +slider.value; date = '2027-06-21'; btnPlay.classList.remove('on'); btnNow.classList.remove('on'); dirty = true; kick(); });
  btnPlay.addEventListener('click', () => { live = false; playing = !playing; date = '2027-06-21'; btnPlay.classList.toggle('on', playing); btnNow.classList.remove('on'); dirty = true; kick(); });
  btnKey.addEventListener('click', () => { live = false; playing = false; minutes = KEY; date = '2027-06-21'; btnPlay.classList.remove('on'); btnNow.classList.remove('on'); dirty = true; kick(); });
  btnNow.addEventListener('click', () => { live = !live; playing = false; btnNow.classList.toggle('on', live); btnPlay.classList.remove('on'); if (!live) date = '2027-06-21'; dirty = true; kick(); });
  addEventListener('resize', () => { size(); kick(); });
  addEventListener('message', (e) => {
    if (e.data === 'umbra:pause') { paused = true; playing = false; btnPlay.classList.remove('on'); }
    else if (e.data === 'umbra:play') { paused = false; kick(); }
  });
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; kick(); });
  if ('IntersectionObserver' in window) new IntersectionObserver((en) => { visible = en[0].isIntersecting && !document.hidden; kick(); }).observe(cv);

  // boot
  fetch('data/umbra.json').then((r) => r.json()).then((d) => {
    data = d;
    const dpr = Math.min(devicePixelRatio || 1, 1.5), small = Math.min(innerWidth, innerHeight) < 700;
    try {
      eng = new UMBRA.Engine(cv, { data: d, width: Math.round(innerWidth * dpr), height: Math.round(innerHeight * dpr),
        shadowSize: small ? 2048 : 3072, samples: small ? 2 : 4, aoW: 2048, taps: small ? 8 : 14, penK: 1.0 });
    } catch (e) { fail(); return; }
    size(); btnPlay.classList.toggle('on', playing);
    document.body.classList.add('ready');
    kick();
    const img = new Image();
    img.onload = () => { eng.setGround(img, 0.7856); dirty = true; kick(); };
    img.src = 'data/concrete.webp';
  }).catch(fail);
})();
