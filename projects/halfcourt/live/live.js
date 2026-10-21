/* HALFCOURT · Run the broadcast. The visitor is the graphics operator in the truck: keys 1–6 (or the deck)
   fire the package over a live game. The same module (halfcourt.js) that rendered the film draws every
   graphic here, from the same cues, in DOM and SVG; only transform and opacity animate.
   The 12-second shot clock always runs: at zero the horn sounds and the ball changes hands; a basket resets it.
   Sound is off until the visitor turns it on (synthesised, Web Audio, no files). Lite mode (reduced motion,
   low memory, Save-Data) shows the poster and a "Run it live" button. Pauses when hidden, off screen, or on
   postMessage('halfcourt:pause'); resumes on 'halfcourt:play'. */
import { createPackage, CSS, sortCues, clockAt, scoreAt, STOPS, STEP, SHOT } from "./halfcourt.js";

const $ = (s) => document.querySelector(s);
const app = $("#app"), frame = $("#frame"), scaleEl = $("#scale"), video = $("#v"), stageEl = $("#stage"), deck = $("#deck");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const conn = navigator.connection || {};
const lite = reduce || (navigator.deviceMemory && navigator.deviceMemory < 3) || conn.saveData;

// ---------------------------------------------------------------- fit the 1920 × 1080 program into the frame
function fit() {
  document.documentElement.style.setProperty("--deckh", deck.offsetHeight + "px");
  scaleEl.style.transform = `scale(${frame.clientWidth / 1920})`;
}
new ResizeObserver(fit).observe(document.body);
fit();

// ---------------------------------------------------------------- the show
const TEAMS = ["TDE", "KLN"];
const ROSTER = {
  TDE: [{ name: "Rui Kasai", num: 5, line: "Tide · 2PT 3/5 · 9 pts" }, { name: "Noor Haddad", num: 7, line: "Tide · 1PT 6/8 · 6 pts" }, { name: "Tomás Ledo", num: 11, line: "Tide · 7 rebounds" }],
  KLN: [{ name: "Ade Okunola", num: 8, line: "Kiln · 2PT 4/6 · 11 pts" }, { name: "Lino Sarris", num: 14, line: "Kiln · 1PT 5/7 · 5 pts" }, { name: "Kofi Mendes", num: 21, line: "Kiln · 4 assists" }],
};
const show = { cues: [], clock: { start: 0 }, score: { TDE: 14, KLN: 13 } };
let poss = "KLN", stopI = 2, pi = { TDE: 0, KLN: 0 }, lastBase = 0, lastCycle = 0, endAt = -1, replayEnd = -1, lastSec = -1;
const push = (c) => { show.cues.push(c); sortCues(show); };

const GC = { t0: 0, from: 600 };                       // the game clock: ten minutes
let pkg = null, t0 = 0, tPaused = 0, running = false, raf = 0, visible = true, paused = false, started = false;
const now = () => (running ? (performance.now() - t0) / 1000 : tPaused);

function newGame(t, a = 0, b = 0) {
  show.cues = [{ t: t - 2, type: "bug", on: true }, { t: t - 2, type: "poss", team: poss }];
  show.score = { TDE: a, KLN: b };
  show.clock.start = t;
  lastBase = t; lastCycle = 0; endAt = -1; GC.t0 = t;
}

// ---------------------------------------------------------------- the keys
const ACT = {
  1() { // OPEN: the title over black, the arc drawn in 12 ticks, then the half-circle wipe back to the game
    const t = now();
    push({ t, type: "bug", on: false });
    push({ t, type: "open", dur: 3.0, drawAt: .3 });
    push({ t: t + 3.0, type: "wipe", pre: 0, post: .6667 });
    push({ t: t + 3.4, type: "bug", on: true });
    sfx.open(.3);
  },
  2() { score(1); },
  3() { score(2); },
  4() { // PLAYER: lower third, the team with the ball
    const r = ROSTER[poss][pi[poss]++ % 3];
    push({ t: now(), type: "player", ...r, dur: 4 });
    sfx.build();
  },
  5() { // REPLAY: the half circle covers, the tape rolls back 3 s at half speed, the half circle sinks away
    const t = now(), cut = t + .3333;
    push({ t: cut, type: "wipe", word: "Replay", pre: .3333, hold: .4, post: .5 });
    push({ t: cut, type: "replay", dur: 3.6, tagIn: .5 });
    replayEnd = cut + 3.6;
    setTimeout(() => { if (video.readyState > 1) { video.currentTime = Math.max(0, video.currentTime - 3.2); video.playbackRate = .5; } }, 333);
    sfx.whoosh(.33);
  },
  6() { // CITY: the next stop of the tour
    stopI = (stopI + 1) % 6;
    push({ t: now(), type: "city", stop: stopI, dur: 3 });
    $(".tally b + b").textContent = `Stop ${STOPS[stopI].n} · ${STOPS[stopI].city}`.toUpperCase();
    sfx.city();
  },
};

function score(pts) {
  const t = now();
  if (!show.cues.some((c) => c.type === "bug" && c.on && c.t <= t)) push({ t, type: "bug", on: true });
  push({ t, type: "score", team: poss, pts });
  const s = scoreAt(t + .01, show, TEAMS).s;
  poss = TEAMS[1 - TEAMS.indexOf(poss)];               // after a basket the other team takes the ball
  push({ t: t + .5, type: "poss", team: poss });
  if (s.TDE >= 21 || s.KLN >= 21) endAt = t + 5;
  pts === 2 ? sfx.two() : sfx.one();
}

function hit(k) {
  if (!started || !ACT[k]) return;
  app.classList.add("touched");
  autopilot = false;
  ACT[k]();
  const b = deck.querySelector(`[data-k="${k}"]`);
  b.classList.add("hit"); setTimeout(() => b.classList.remove("hit"), 60);
}
deck.addEventListener("click", (e) => { const b = e.target.closest(".k[data-k]"); if (b) hit(b.dataset.k); });
addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const m = /^(?:Digit|Numpad)([1-6])$/.exec(e.code);
  if (m) { e.preventDefault(); hit(m[1]); }
});

// a gentle demo until the visitor takes over
let autopilot = true;
const DEMO = [[2.0, "4"], [6.5, "3"], [10.5, "6"], [15.0, "5"], [20.5, "2"], [24.0, "4"], [28.5, "3"]];
let demoNext = 0, demoT0 = 0;

// ---------------------------------------------------------------- the frame loop
function frameLoop() {
  raf = requestAnimationFrame(frameLoop);
  const t = now();
  if (autopilot && demoNext < DEMO.length && t - demoT0 >= DEMO[demoNext][0]) { ACT[DEMO[demoNext][1]](); demoNext++; }
  if (autopilot && demoNext >= DEMO.length && t - demoT0 > 34) { demoNext = 0; demoT0 = t; }
  const ck = clockAt(t, show);
  if (ck.base !== lastBase) { lastBase = ck.base; lastCycle = 0; }
  if (ck.cycle > lastCycle) {                         // the shot clock ran out: horn, the ball changes hands
    lastCycle = ck.cycle;
    poss = TEAMS[1 - TEAMS.indexOf(poss)];
    push({ t, type: "poss", team: poss });
    sfx.horn();
  }
  const sec = Math.ceil(ck.rem - 1e-6);
  if (sec !== lastSec) { if (sec <= 3 && sec >= 1 && ck.running) sfx.tick(); lastSec = sec; }
  if (endAt > 0 && t >= endAt) newGame(t);
  if (replayEnd > 0 && t >= replayEnd) { video.playbackRate = 1; replayEnd = -1; }
  pkg.render(t, show);
}
function start() {
  if (running || paused || !visible || !started) return;
  running = true; t0 = performance.now() - tPaused * 1000;
  if (video.src) video.play().catch(() => {});
  if (sfx.ctx) sfx.ctx.resume();
  app.classList.remove("paused");
  raf = requestAnimationFrame(frameLoop);
}
function stop() {
  if (!running) return;
  tPaused = now(); running = false; cancelAnimationFrame(raf);
  video.pause();
  if (sfx.ctx) sfx.ctx.suspend();
  app.classList.add("paused");
}

// ---------------------------------------------------------------- sound (off until asked for)
const sfx = {
  ctx: null, out: null,
  on() {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    this.ctx = new C(); this.out = this.ctx.createGain(); this.out.gain.value = .8;
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
    this.out.connect(comp); comp.connect(this.ctx.destination);
    const n = this.ctx.sampleRate; this.noise = this.ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  },
  env(g, at, a, dec, peak) { g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + a); g.gain.exponentialRampToValueAtTime(1e-4, at + a + dec); },
  osc(type, f, at, dur, peak, a = .004) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f; this.env(g, at, a, dur, peak); o.connect(g); g.connect(this.out); o.start(at); o.stop(at + a + dur + .05);
  },
  pluck(f, at, peak = .18) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), m = this.ctx.createOscillator(), mg = this.ctx.createGain(), g = this.ctx.createGain();
    o.frequency.value = f; m.frequency.value = f * 2; mg.gain.setValueAtTime(f * 2.2, at); mg.gain.exponentialRampToValueAtTime(1, at + .12);
    m.connect(mg); mg.connect(o.frequency); this.env(g, at, .002, .4, peak); o.connect(g); g.connect(this.out);
    o.start(at); m.start(at); o.stop(at + .5); m.stop(at + .5);
  },
  noiseBurst(at, dur, f0, f1, peak) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(), bp = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; bp.type = "bandpass"; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, at); bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + dur * .6); g.gain.linearRampToValueAtTime(0, at + dur);
    s.connect(bp); bp.connect(g); g.connect(this.out); s.start(at); s.stop(at + dur + .02);
  },
  get t() { return this.ctx ? this.ctx.currentTime + .01 : 0; },
  SC: [62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86, 89].map((m) => 440 * 2 ** ((m - 69) / 12)),
  open(d) { const t = this.t + d; this.SC.forEach((f, i) => this.pluck(f, t + i * STEP, .12)); this.osc("sine", 55, t + 12 * STEP, .6, .5); },
  two() { const t = this.t; this.osc("sine", 60, t, .3, .6); this.SC.forEach((f, i) => this.pluck(f, t + i * STEP * .5, .14)); },
  one() { const t = this.t; this.osc("sine", 60, t, .25, .45); this.pluck(this.SC[4], t, .16); this.pluck(this.SC[7], t + STEP, .14); },
  build() { const t = this.t; for (let i = 0; i < 6; i++) this.osc("sine", 2300 + 150 * i, t + i * STEP, .02, .05); },
  whoosh(d) { this.noiseBurst(this.t, d + .3, 300, 5000, .25); },
  city() { const t = this.t; this.noiseBurst(t, .5, 400, 3000, .2); this.pluck(this.SC[2 * stopI], t + .33, .14); this.pluck(this.SC[2 * stopI + 1], t + .5, .14); },
  tick() { const t = this.t; this.osc("triangle", 1250, t, .05, .25, .001); },
  horn() {
    if (!this.ctx) return;
    const t = this.t, bp = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    bp.type = "lowpass"; bp.frequency.value = 3200; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .015);
    g.gain.setValueAtTime(.16, t + .95); g.gain.linearRampToValueAtTime(0, t + 1.05); bp.connect(g); g.connect(this.out);
    for (const f of [466, 554, 233]) { const o = this.ctx.createOscillator(); o.type = "square"; o.frequency.value = f; o.connect(bp); o.start(t); o.stop(t + 1.1); }
  },
};
$("#snd").addEventListener("click", (e) => {
  const b = e.currentTarget;
  if (!sfx.ctx) sfx.on(); else sfx.ctx.state === "running" ? sfx.ctx.suspend() : sfx.ctx.resume();
  const on = sfx.ctx && sfx.ctx.state !== "suspended";
  b.setAttribute("aria-pressed", String(!!on)); b.textContent = on ? "Sound on" : "Sound off";
});

// ---------------------------------------------------------------- start, visibility and the host page
async function boot() {
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  const brand = await (await fetch("brand.json")).json();
  await Promise.all([document.fonts.load('700 40px "Panchang"'), document.fonts.load('700 21px "Switzer"')]);
  pkg = createPackage(stageEl, { fmt: "16x9", brand, teams: TEAMS, stop: stopI, gameClock: GC });
  newGame(0, 14, 13);
  push({ t: -2, type: "poss", team: poss });
  pkg.render(0, show);
  started = true;
  addEventListener("load", () => {                       // the game loads after the first frame
    video.src = "media/game.mp4";
    video.addEventListener("playing", () => app.classList.add("playing"), { once: true });
    if (running) video.play().catch(() => {});
  });
  if (document.readyState === "complete") dispatchEvent(new Event("load"));
  start();
}
new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(app);
document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
addEventListener("message", (e) => {
  if (e.data === "halfcourt:pause") { paused = true; stop(); }
  if (e.data === "halfcourt:play") { paused = false; start(); }
});
if (lite) {
  app.classList.add("lite");
  $("#go").addEventListener("click", () => { app.classList.remove("lite"); boot(); }, { once: true });
} else boot();
