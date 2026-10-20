/* ACCORD · Spin the bottle
   48 pre-rendered frames (every 7.5°, one sprite, AVIF or WebP) crossfaded as the visitor turns the bottle.
   The note levels per angle were measured in the renders: how much light each note's own lamp puts on the
   glass (Cycles light-group passes, 96 turntable frames). They drive the three tones and the chord drawn below.
   Sound is three sine tones (110, 275, 660 Hz: 4 : 5 : 6 in open voicing) and a soft reverb, synthesised
   here and started only by a click. Pauses when hidden, off screen, or on postMessage('accord:pause'). */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const stage = $("stage"), box = $("bottle"), spin = $("spin"), wave = $("wave");
  const sctx = spin.getContext("2d"), wctx = wave.getContext("2d");
  const out = [0, 1, 2].map((k) => $("o" + k)), bar = [0, 1, 2].map((k) => $("b" + k)), degEl = $("deg");
  const put = (el, s) => (el.textContent === s ? false : ((el.textContent = s), true));
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  const FW = 480, FH = 720, COLS = 8, N = 48, STEP = 7.5;
  const COL = ["#D6E05A", "#7E6CF0", "#D08A2E"], K = [6, 5, 4], FREQ = [660, 275, 110];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const conn = navigator.connection || {};
  const lite = reduce || (navigator.deviceMemory && navigator.deviceMemory < 3) || conn.saveData;

  let levels = null, sheet = null, angle = 0, vel = 0, dragging = false, lastX = 0, lastT = 0;
  let running = false, visible = true, paused = false, raf = 0, phase = 0, idleSince = performance.now();
  let audio = null;

  // ---------------------------------------------------------------- data
  fetch("media/chord.json").then((r) => r.json()).then((d) => { levels = d.levels_96; draw(); });

  function lv(a) {  // levels at an angle, linearly between the 96 measured frames
    if (!levels) return [0.5, 0.5, 0.5];
    const p = (((a % 360) + 360) % 360) / 3.75, i = Math.floor(p) % 96, j = (i + 1) % 96, t = p - Math.floor(p);
    return [0, 1, 2].map((k) => levels[i][k] * (1 - t) + levels[j][k] * t);
  }

  // ---------------------------------------------------------------- sprite (after the first paint)
  function loadSheet() {
    const avif = new Image();
    avif.onload = () => go("media/spin.avif");
    avif.onerror = () => go("media/spin.webp");
    avif.src = "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=";
    function go(src) {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => { sheet = im; stage.classList.add("ready"); draw(); };
      im.src = src;
    }
  }

  // ---------------------------------------------------------------- drawing
  function sizeWave() {
    const r = wave.getBoundingClientRect();
    wave.width = Math.max(1, Math.round(r.width * DPR));
    wave.height = Math.max(1, Math.round(r.height * DPR));
  }

  function frameAt(i, alpha) {
    const k = ((i % N) + N) % N, sx = (k % COLS) * FW, sy = Math.floor(k / COLS) * FH;
    sctx.globalAlpha = alpha;
    sctx.drawImage(sheet, sx, sy, FW, FH, 0, 0, spin.width, spin.height);
  }

  function draw() {
    const a = (((angle % 360) + 360) % 360);
    if (sheet) {
      const p = a / STEP, i = Math.floor(p), t = p - i;
      frameAt(i, 1);
      if (t > 0.001) frameAt(i + 1, t);  // crossfade to the next frame
      sctx.globalAlpha = 1;
    }
    const L = lv(a);
    // the readout changes only now and then: touch the DOM only when a value does (no layout per frame)
    for (let k = 0; k < 3; k++) {
      const sx = L[k].toFixed(3);
      if (bar[k].v !== sx) { bar[k].v = sx; bar[k].style.transform = "scaleX(" + sx + ")"; }
    }
    const now = performance.now();  // the figures are read, not watched: ten times a second is plenty
    if (now - (draw.txt || 0) > 100 || !running) {
      draw.txt = now;
      for (let k = 0; k < 3; k++) put(out[k], L[k].toFixed(2));
      const deg = String(Math.round(a) % 360);
      if (put(degEl, "θ " + deg.padStart(3, "0") + "°")) box.setAttribute("aria-valuenow", deg);
    }
    drawWave(L);
    if (audio) audio.set(L);
  }

  function drawWave(L) {
    const w = wave.width, h = wave.height, c = wctx, mid = h / 2, amp = h * 0.36;
    c.clearRect(0, 0, w, h);
    const n = 260, sum = L[0] + L[1] + L[2];
    // the three notes, thin, each as loud as its light
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      for (let i = 0; i <= n; i++) {
        const x = i / n, u = (x - 0.5) * 2 * Math.PI, y = mid - amp * 0.55 * L[k] * Math.cos(K[k] * u + phase);
        i ? c.lineTo(x * w, y) : c.moveTo(x * w, y);
      }
      c.strokeStyle = COL[k];
      c.globalAlpha = 0.85;
      c.lineWidth = 1.2 * DPR;
      c.stroke();
    }
    // their sum: the chord, one band
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = i / n, u = (x - 0.5) * 2 * Math.PI;
      let s = 0;
      for (let k = 0; k < 3; k++) s += L[k] * Math.cos(K[k] * u + phase);
      const y = mid - amp * s / Math.max(sum, 0.001);
      i ? c.lineTo(x * w, y) : c.moveTo(x * w, y);
    }
    c.globalAlpha = 1;
    c.strokeStyle = "#F2EDE4";
    c.lineWidth = 3.4 * DPR;
    c.lineCap = c.lineJoin = "round";
    c.stroke();
  }

  // ---------------------------------------------------------------- loop
  function tick(t) {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.05, (t - (tick.t || t)) / 1000);
    tick.t = t;
    if (!dragging) {
      if (Math.abs(vel) > 0.5) { angle += vel * dt; vel *= Math.pow(0.12, dt); }
      else if (!reduce && t - idleSince > 1500) angle += 9 * dt;  // a slow turn while nobody holds it
    }
    phase += dt * 1.6;
    // in the hand: every frame; turning by itself it is slow, so 30 fps looks the same at half the work
    if (dragging || Math.abs(vel) > 0.5 || t - (tick.d || 0) > 30) { tick.d = t; draw(); }
    raf = requestAnimationFrame(tick);
  }
  function start() {
    if (running || paused || !visible || lite && !stage.classList.contains("live")) return;
    running = true;
    tick.t = 0;
    raf = requestAnimationFrame(tick);
    if (audio) audio.resume();
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (audio) audio.suspend();
  }

  // ---------------------------------------------------------------- input: mouse, touch, keys
  box.addEventListener("pointerdown", (e) => {
    dragging = true; vel = 0; lastX = e.clientX; lastT = performance.now();
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const now = performance.now(), dx = e.clientX - lastX, k = 360 / Math.max(240, box.clientWidth);
    angle -= dx * k;
    vel = -dx * k / Math.max(0.008, (now - lastT) / 1000);
    lastX = e.clientX; lastT = now; idleSince = now;
    if (!running) draw();
  });
  const up = () => { dragging = false; idleSince = performance.now(); };
  box.addEventListener("pointerup", up);
  box.addEventListener("pointercancel", up);
  box.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      angle += (e.key === "ArrowRight" ? 1 : -1) * STEP; vel = 0; idleSince = performance.now(); draw(); e.preventDefault();
    }
  });

  // ---------------------------------------------------------------- sound: only after a click
  function makeAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC(), master = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
    master.gain.value = 0;
    dry.gain.value = 0.8; wet.gain.value = 0.32;
    // a soft room: decaying noise, a little darker as it fades
    const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate, a = 0.15 + 0.6 * Math.exp(-t * 1.6);
        lp += a * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.exp(-t * 2.4);
      }
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    const voices = FREQ.map((f, k) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f; g.gain.value = 0;
      o.connect(g); g.connect(dry); g.connect(verb); o.start();
      return g;
    });
    verb.connect(wet); dry.connect(master); wet.connect(master); master.connect(ctx.destination);
    const W = [0.20, 0.30, 0.42];  // the high tone is quieter: equal loudness, roughly
    return {
      on() { master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.25); },
      off() { master.gain.setTargetAtTime(0, ctx.currentTime, 0.08); },
      set(L) { const t = ctx.currentTime; voices.forEach((g, k) => g.gain.setTargetAtTime(W[k] * L[k], t, 0.12)); },
      suspend() { if (ctx.state === "running") ctx.suspend(); },
      resume() { if (ctx.state === "suspended" && soundOn) ctx.resume(); },
    };
  }
  let soundOn = false;
  $("snd").addEventListener("click", () => {
    if (!audio) audio = makeAudio();
    if (!audio) return;
    soundOn = !soundOn;
    if (soundOn) { audio.resume(); audio.set(lv(angle)); audio.on(); } else audio.off();
    $("snd").textContent = soundOn ? "Sound off" : "Sound on";
    $("snd").setAttribute("aria-pressed", String(soundOn));
    $("snd").classList.toggle("ghost", soundOn);
  });

  // ---------------------------------------------------------------- visibility and the host page
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(stage);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  addEventListener("message", (e) => {
    if (e.data === "accord:pause") { paused = true; stop(); }
    if (e.data === "accord:play") { paused = false; start(); }
  });
  addEventListener("resize", () => { sizeWave(); draw(); });

  // ---------------------------------------------------------------- go
  spin.width = Math.round(FW * Math.min(DPR, 1.5));
  spin.height = Math.round(FH * Math.min(DPR, 1.5));
  sizeWave();
  if (lite) {
    stage.classList.add("lite");
    $("go").addEventListener("click", () => {
      stage.classList.add("live"); stage.classList.remove("lite"); loadSheet(); start();
    });
    draw();
  } else {
    addEventListener("load", () => setTimeout(loadSheet, 60));
    start();
  }
})();
