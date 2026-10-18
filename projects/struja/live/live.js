/* STRUJA live page: the identity running in the browser.
   Idle: the river breathes. Play: the line is driven by the festival track.
   Mic: the line listens to the room. Pointer: the current bends toward you. */
(function () {
  'use strict';
  const S = window.STRUJA;
  const root = document.getElementById('struja');
  const canvas = root.querySelector('canvas');
  const btnPlay = root.querySelector('[data-play]');
  const btnMic = root.querySelector('[data-mic]');
  const poster = root.querySelector('.poster');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BEAT = 60 / 124;

  let eng, dir, tl, audio, analyser, micStream, data, raf = 0, visible = false, mode = 'idle';
  let lastBox = [0, 0];
  let clock = 0, lastT = 0, lastAudio = 0, loops = 0, frameMs = 16, scale = 1, video = null, lastWall = 0;

  function fail() { root.classList.add('is-static'); }

  function layout(w, h) {
    const portrait = h > w * 1.1;
    return portrait
      ? { cap: 0.075, restFrac: 0.72, peakFrac: 0.78, wideFrac: 0.8, tightFrac: 0.6, restAmp: 0.045, unit: 'w', end: { x0: -0.06, x1: 0.64, textY: 0.34, lineY: 0.56, textX: 0.327, textScale: 0.66 } }
      : { cap: Math.min(0.2, 0.2 * (w / h) / 1.78), restFrac: 0.72, unit: w / h < 1.4 ? 'w' : 'h' };
  }

  function size() {
    const r = root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * scale;
    const w = Math.max(320, Math.round(r.width * dpr)), h = Math.max(200, Math.round(r.height * dpr));
    if (!eng || eng.W !== w || eng.H !== h) {
      eng && eng.resize(w, h);
      if (dir) { dir.layout = layout(w, h); dir._fit = null; }
    }
  }

  async function boot() {
    const base = root.dataset.base || '';
    try {
      const [meta, bin, rest, demo] = await Promise.all([
        fetch(base + 'data/glyphs.json').then((r) => r.json()),
        fetch(base + 'data/glyphs.bin').then((r) => r.arrayBuffer()),
        fetch(base + 'data/sava.json').then((r) => r.json()),
        fetch(base + 'data/demo.json').then((r) => r.json())]);
      data = demo;
      const font = S.makeFont(meta, new Int16Array(bin));
      const r = root.getBoundingClientRect();
      eng = new S.Engine(canvas, { font, rest, width: r.width, height: r.height });
      dir = new S.Director(eng, layout(r.width, r.height));
      tl = new S.Timeline(demo, { textFromStart: true });
      size();
      root.classList.add('is-live');
      // the water: a light still first, the moving loop once the page is idle (a tall crop on tall screens)
      const wv = r.height > r.width * 1.1 ? 'water-v' : 'water';
      const still = new Image();
      still.onload = () => { if (!video) eng.setBackground(still); };
      still.src = base + 'media/' + wv + '.webp';
      if (!reduce) setTimeout(() => {
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.src = base + 'media/' + wv + '.mp4';
        v.addEventListener('canplay', () => { video = v; v.play().catch(() => {}); }, { once: true });
      }, 1200);
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }, { threshold: 0.05 }).observe(root);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
      addEventListener('resize', size);
      if (window.ResizeObserver) new ResizeObserver(() => size()).observe(root);
      if (reduce) { renderOnce(); }
    } catch (e) { console.warn('STRUJA', e); fail(); }
  }

  function start() { if (eng && !raf && visible && !document.hidden && (!reduce || mode !== 'idle')) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }

  // features for each mode
  const idle = { last: -1 };
  function idleFeatures(t) {
    const b = Math.floor(t / (BEAT * 2));
    const kick = b !== idle.last; idle.last = b;
    const ph = (t % (BEAT * 2)) / (BEAT * 2);
    return { time: t, bass: 0.55 * Math.exp(-ph * 5), mid: 0.3 + 0.2 * Math.sin(t * 0.7), high: 0.15, intensity: 0.14, tension: 0,
      kick, kickV: 0.55, text: 1, o: {} };
  }

  const mic = { buf: null, peak: { b: 0.05, m: 0.05, h: 0.05 }, prevB: 0, lastKick: -1, level: 0 };
  function micFeatures(t) {
    if (!mic.buf) mic.buf = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(mic.buf);
    const sr = analyser.context.sampleRate, n = mic.buf.length, hz = sr / 2 / n;
    const band = (a, b) => { let s = 0, c = 0; for (let i = Math.floor(a / hz); i < Math.min(n, b / hz); i++) { s += Math.pow(10, mic.buf[i] / 20); c++; } return c ? s / c : 0; };
    const raw = { b: band(30, 140), m: band(300, 2000), h: band(5000, 12000) };
    const out = {};
    for (const k of ['b', 'm', 'h']) { mic.peak[k] = Math.max(raw[k], mic.peak[k] * 0.9995, 1e-4); out[k] = Math.min(1.2, raw[k] / mic.peak[k]); }
    mic.level = mic.level * 0.97 + (out.b * 0.5 + out.m * 0.5) * 0.03;
    const kick = out.b - mic.prevB > 0.28 && t - mic.lastKick > 0.22;
    if (kick) mic.lastKick = t;
    mic.prevB = out.b;
    return { time: t, bass: out.b, mid: out.m, high: out.h, intensity: Math.min(1, 0.2 + mic.level * 1.1), tension: 0, kick, text: 1, o: {} };
  }

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    if (root.clientWidth !== lastBox[0] || root.clientHeight !== lastBox[1]) { lastBox = [root.clientWidth, root.clientHeight]; size(); }
    const raw = (now - lastT) / 1000, dt = Math.min(0.05, raw); lastT = now;
    if (raw < 0.1) frameMs = frameMs * 0.95 + (raw * 1000) * 0.05;  // ignore gaps (background tab, first frame)
    if (frameMs > 24 && scale > 0.6) { scale -= 0.1; size(); frameMs = 16; }
    clock += dt;
    let f;
    if (mode === 'play' && audio && !audio.paused) {
      const at = audio.currentTime;
      if (at + 1 < lastAudio) loops++;
      lastAudio = at;
      f = tl.at(at, Math.max(0, at - dt));
      f.time = loops * data.duration + at;   // monotonic clock across loops
      if (f.freeze) f.freeze = false;
    } else if (mode === 'mic' && analyser) {
      f = micFeatures(clock);
    } else {
      f = idleFeatures(clock);
    }
    if (video && video.readyState >= 2 && now - lastWall > 40) { eng.setBackground(video); lastWall = now; }
    eng.render(dir.params(f, dt));
    raf = requestAnimationFrame(frame);
  }

  function renderOnce() { eng.render(dir.params(idleFeatures(2.0), 1 / 60)); }

  // pointer: the current bends toward the cursor / finger
  root.addEventListener('pointermove', (e) => {
    if (!dir) return;
    const r = root.getBoundingClientRect();
    dir.pointer = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, 1];
  });
  root.addEventListener('pointerleave', () => { if (dir) dir.pointer[2] = 0; });

  btnPlay.addEventListener('click', async () => {
    if (!audio) {
      audio = new Audio(); audio.loop = true; audio.preload = 'auto';
      audio.src = (root.dataset.base || '') + 'audio/struja-demo.m4a';
    }
    stopMic();
    if (mode === 'play' && !audio.paused) { audio.pause(); mode = 'idle'; root.dataset.mode = 'idle'; btnPlay.setAttribute('aria-pressed', 'false'); return; }
    try {
      root.classList.add('is-loading');
      await audio.play();
      mode = 'play'; root.dataset.mode = 'play'; btnPlay.setAttribute('aria-pressed', 'true');
    } catch (e) { console.warn(e); }
    root.classList.remove('is-loading');
    start();
  });

  function stopMic() {
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; analyser = null; btnMic.setAttribute('aria-pressed', 'false'); }
  }
  btnMic.addEventListener('click', async () => {
    if (micStream) { stopMic(); mode = 'idle'; root.dataset.mode = 'idle'; return; }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaStreamSource(micStream);
      analyser = ac.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.2;
      src.connect(analyser);
      if (audio) audio.pause();
      btnPlay.setAttribute('aria-pressed', 'false');
      mode = 'mic'; root.dataset.mode = 'mic'; btnMic.setAttribute('aria-pressed', 'true');
      start();
    } catch (e) { console.warn('mic', e); btnMic.disabled = true; }
  });

  // small public handle for the host page (pause when the case page closes, debugging)
  S.live = {
    pause() { if (audio) audio.pause(); stopMic(); mode = 'idle'; root.dataset.mode = 'idle'; btnPlay.setAttribute('aria-pressed', 'false'); },
    seek(t) { if (audio) audio.currentTime = t; },
    state() { return { mode, fps: Math.round(1000 / frameMs), scale, size: eng ? [eng.W, eng.H] : null, layout: dir ? dir.layout : null, last: dir && dir._last ? { capPx: dir._last.capPx, wdth: dir._last.wdth, cam: dir._last.cam, unit: dir._last.unit } : null }; },
  };
  addEventListener('message', (e) => { if (e.data === 'struja:pause') S.live.pause(); });

  if (!window.WebGL2RenderingContext) fail(); else boot();
})();
