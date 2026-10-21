// HALFCOURT · the broadcast package as one module.
//
// Every graphic lives in the arc (the 2-point arc as a half circle of 12 segments) and moves on a grid of
// 12 ticks: one tick = 1/6 s, 12 ticks = one 2-second bar at 120 BPM, and the shot clock fills one segment
// per second. The same module renders the film and loop frames in headless Chrome (deterministic
// render(t) from a list of cues) and runs the live page (the same cues, fired from the keyboard).
//
//   const pkg = createPackage(stageEl, { fmt: "16x9" | "9x16", brand });
//   pkg.render(t, show)       show = { cues: [{ t, type, ...data }], clock: { start } }
//
// Only transform and opacity animate; text and arc states change on ticks (≤ 6 times a second).

export const C = { ink: "#111314", chalk: "#F2F1EC", volt: "#CCF23D", off: "rgba(242,241,236,.16)", grey: "#2A2D2F" };
export const STEP = 1 / 6;
export const SHOT = 12;
export const STOPS = [
  { n: "01", city: "Paris", date: "15–16 May" },
  { n: "02", city: "Tokyo", date: "12–13 June" },
  { n: "03", city: "Manila", date: "10–11 July" },
  { n: "04", city: "Lagos", date: "14–15 August" },
  { n: "05", city: "São Paulo", date: "11–12 September" },
  { n: "06", city: "New York", date: "16–17 October" },
];
export const LINE = "One hoop. Twelve seconds. Twenty-one points.";
export const FONT_H = "Panchang", FONT_T = "Switzer";

// ------------------------------------------------------------------ easing and the 12-tick grid
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
export const easeIn = x => Math.pow(clamp(x), 3);
export const easeInOut = x => (x = clamp(x), x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// progress over n ticks starting at t0; each tick snaps in the first `snap` of its length and then holds
export function ticks(t, t0, n, snap = .5, step = STEP) {
  const x = (t - t0) / step;
  if (x <= 0) return 0;
  if (x >= n) return 1;
  const i = Math.floor(x);
  return (i + easeOut((x - i) / snap)) / n;
}
// whole ticks elapsed (integer), for things that switch on beats
export const tickIndex = (t, t0, step = STEP) => Math.floor((t - t0) / step + 1e-6);
// a smooth window: 0 before a, 1 between a+inD and b-outD, 0 after b
export function win(t, a, b, inD, outD, eIn = easeOut, eOut = easeIn) {
  if (t < a || t > b) return 0;
  if (t < a + inD) return eIn((t - a) / inD);
  if (t > b - outD) return 1 - eOut((t - (b - outD)) / outD);
  return 1;
}

// ------------------------------------------------------------------ geometry of the mark
// segment i (0 = left) of a half ring of centreline radius R and width w around (cx, cy), y down;
// the gaps have parallel sides and constant width (as in brand.py)
export function segPath(cx, cy, R, w, i, gap, n = 12, a0 = Math.PI, span = Math.PI) {
  const r0 = R - w / 2, r1 = R + w / 2;
  const ga0 = gap / 2 / r0, ga1 = gap / 2 / r1;
  const a = a0 - i * span / n, b = a0 - (i + 1) * span / n;
  const ao = i === 0 && span === Math.PI ? a : a - ga1, ai = i === 0 && span === Math.PI ? a : a - ga0;
  const bo = i === n - 1 && span === Math.PI ? b : b + ga1, bi = i === n - 1 && span === Math.PI ? b : b + ga0;
  const P = (r, th) => `${(cx + r * Math.cos(th)).toFixed(2)} ${(cy - r * Math.sin(th)).toFixed(2)}`;
  return `M${P(r1, ao)}A${r1.toFixed(2)} ${r1.toFixed(2)} 0 0 1 ${P(r1, bo)}L${P(r0, bi)}A${r0.toFixed(2)} ${r0.toFixed(2)} 0 0 0 ${P(r0, ai)}Z`;
}
export const markGeom = R => ({ R, w: R * .17, gap: R * .17 * .30, baseH: R * .17 * .42, baseGap: R * .17 * .30 });

const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs = {}, parent = null, text = null) {
  const e = tag.startsWith("svg:") ? document.createElementNS(NS, tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") Object.assign(e.style, v);
    else if (k === "class") e.setAttribute("class", v);
    else e.setAttribute(k, v);
  }
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

// write a style property only when it changes (the live page touches the DOM as little as possible)
function setter(e) {
  const last = {};
  return (k, v) => { if (last[k] !== v) { last[k] = v; e.style[k] = v; } };
}
function txt(e) {
  let last = null;
  return v => { if (last !== v) { last = v; e.textContent = v; } };
}

// an arc of 12 segments: base layer (off) + lit layer (volt) per segment, lit by opacity
export class Arc {
  constructor(parent, { R, w = R * .17, gap = w * .3, base = true, baseCol = C.chalk, offCol = C.off, onCol = C.volt, dome = null, x = 0, y = 0, pad = 0, cls = "" }) {
    this.R = R; this.w = w;
    const W = 2 * R + w + 2 * pad, H = R + w / 2 + pad + (base ? w * .30 + w * .42 : 0) + 2;
    this.W = W; this.H = H;
    this.cx = W / 2; this.cy = pad + R + w / 2;
    this.svg = el("svg:svg", { width: W.toFixed(1), height: H.toFixed(1), viewBox: `0 0 ${W.toFixed(2)} ${H.toFixed(2)}`, class: "hc-arc " + cls,
      style: { position: "absolute", left: `${x - W / 2}px`, top: `${y - this.cy}px`, overflow: "visible" } }, parent);
    if (dome) el("svg:path", { d: `M${this.cx - dome} ${this.cy}A${dome} ${dome} 0 0 1 ${this.cx + dome} ${this.cy}Z`, fill: C.ink }, this.svg);
    this.offs = []; this.ons = []; this.setOn = []; this.setOff = [];
    for (let i = 0; i < 12; i++) {
      const d = segPath(this.cx, this.cy, R, w, i, gap);
      const o = el("svg:path", { d, fill: offCol }, this.svg);
      const n = el("svg:path", { d, fill: onCol, style: { opacity: 0 } }, this.svg);
      this.offs.push(o); this.ons.push(n);
      this.setOn.push(setter(n)); this.setOff.push(setter(o));
    }
    if (base) {
      this.base = el("svg:rect", { x: (this.cx - R - w / 2).toFixed(2), y: (this.cy + w * .30).toFixed(2), width: (2 * R + w).toFixed(2), height: (w * .42).toFixed(2), fill: baseCol }, this.svg);
      this.setBase = setter(this.base);
    }
    this.setSvg = setter(this.svg);
  }
  // lit: array of 12 opacities (0..1) for the volt layer; off: optional opacities of the base layer
  set(lit, off = null) {
    for (let i = 0; i < 12; i++) {
      this.setOn[i]("opacity", (+lit[i]).toFixed(3));
      if (off) this.setOff[i]("opacity", (+off[i]).toFixed(3));
    }
  }
}

// ------------------------------------------------------------------ the show: cues → state at t
export function sortCues(show) { show.cues.sort((a, b) => a.t - b.t); return show; }
export const last = (cues, type, t) => { let r = null; for (const c of cues) { if (c.t > t) break; if (c.type === type) r = c; } return r; };
export const all = (cues, type, t = Infinity) => cues.filter(c => c.type === type && c.t <= t);

// shot clock: runs from clock.start; a made basket (score cue) or a reset cue restarts it;
// at 12 s the siren sounds, the arc empties and it starts again
export function clockAt(t, show) {
  const st = show.clock?.start ?? 0;
  const stop = last(show.cues, "clockstop", t);
  if (stop) return { running: false, stopped: true, el: SHOT, rem: 0, base: st, siren: t - stop.t, cycle: 1 };
  let base = st;
  for (const c of show.cues) {
    if (c.t > t) break;
    if ((c.type === "score" || c.type === "reset") && c.t >= st) base = c.t;
  }
  if (t < st) return { running: false, el: 0, rem: SHOT, base: st, siren: -1, cycle: 0 };
  const e = t - base;
  const k = Math.floor(e / SHOT);
  const el = e - k * SHOT;
  const siren = k >= 1 ? t - (base + k * SHOT) : -1;     // seconds since the last siren (if any in this run)
  return { running: true, el, rem: SHOT - el, base, siren, cycle: k, resetAge: t - base };
}

export function scoreAt(t, show, teams) {
  const s = Object.fromEntries(teams.map(k => [k, 0]));
  const init = show.score || {};
  for (const k of teams) s[k] = init[k] || 0;
  let lastCue = null;
  for (const c of show.cues) {
    if (c.t > t) break;
    if (c.type === "score") { s[c.team] += c.pts; lastCue = c; }
  }
  return { s, lastCue };
}

// ------------------------------------------------------------------ layouts per format
const LAYOUT = {
  "16x9": { W: 1920, H: 1080, bug: { x: 96, y: 946, s: 1 }, lt: { right: 1824, bottom: 1020, s: 1 }, city: "panel-right", end: "wide" },
  "9x16": { W: 1080, H: 1920, bug: { x: 70, y: 1660, s: 1.06 }, lt: { left: 70, bottom: 1500, s: 1.0 }, city: "panels-tb", end: "tall" },
};

// fit a word in Panchang to a width: returns the font size (deterministic: canvas measureText)
const _cv = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
export function fitSize(text, family, weight, maxW, maxSize, track = 0) {
  _cv.font = `${weight} 100px ${family}`;
  const w = _cv.measureText(text).width + track * 100 * (text.length - 1);
  return Math.min(maxSize, maxW / w * 100);
}

// ------------------------------------------------------------------ the package
export function createPackage(stage, { fmt = "16x9", brand, teams = ["TDE", "KLN"], stop = 2, gameClock = null } = {}) {
  const L = LAYOUT[fmt];
  stage.style.width = L.W + "px";
  stage.style.height = L.H + "px";
  stage.classList.add("hc-stage", "hc-" + fmt);
  const P = {};   // parts, each with update(t, show)
  const wordD = brand.wordmark.d, wordW = brand.wordmark.w, wordH = brand.wordmark.h;

  function wordmark(parent, h, fill, style = {}) {
    const s = h / wordH;
    const svg = el("svg:svg", { width: (wordW * s).toFixed(1), height: h.toFixed(1), viewBox: `0 0 ${wordW} ${wordH}`, style: Object.assign({ position: "absolute", overflow: "visible" }, style) }, parent);
    el("svg:path", { d: wordD, fill }, svg);
    return svg;
  }

  // ---------- OPEN: black, the arc draws in 12 ticks, then the wordmark
  {
    const root = el("div", { class: "hc-open", style: { position: "absolute", inset: "0", opacity: 0 } }, stage);
    const bg = el("div", { style: { position: "absolute", inset: "0", background: "#000" } }, root);
    const big = fmt === "16x9";
    const R = big ? 250 : 300;
    const cy = big ? 560 : 900;
    const arc = new Arc(root, { R, x: L.W / 2, y: cy, offCol: "rgba(242,241,236,.10)" });
    const wmH = big ? 74 : 52;
    const wmW = wordW * wmH / wordH;
    const wm = wordmark(root, wmH, C.chalk, { left: `${(L.W - wmW) / 2}px`, top: `${cy + (big ? 100 : 120)}px`, opacity: 0 });
    const sub = el("div", { class: "hc-sub", style: { position: "absolute", left: 0, right: 0, top: `${cy + (big ? 210 : 220)}px`, textAlign: "center", opacity: 0 } }, root, "World Tour 2027  ·  3×3  ·  Six cities");
    const sR = setter(root), sBg = setter(bg), sWm = setter(wm), sSub = setter(sub), sArc = setter(arc.svg);
    P.open = (t, show) => {
      const c = last(show.cues, "open", t);
      if (!c || t - c.t > (c.dur || 3.2) + 1) { sR("opacity", 0); sR("visibility", "hidden"); return; }
      const a = t - c.t, dur = c.dur || 3.2, d0 = c.drawAt ?? .66;
      sR("visibility", "visible");
      sR("opacity", 1);
      sBg("opacity", c.bg === false ? 0 : 1);
      // 12 segments, one per tick
      const k = (a - d0) / STEP;
      const lit = Array.from({ length: 12 }, (_, i) => clamp((k - i) / .5));
      const flash = clamp(1 - (a - (d0 + 12 * STEP)) / .5);
      arc.set(lit.map(v => v));
      sArc("opacity", a < d0 - .2 ? 0 : 1);
      const w = ticks(t, c.t + d0 + 12 * STEP, 2);
      sWm("opacity", w.toFixed(3));
      sWm("transform", `translateY(${((1 - w) * 24).toFixed(1)}px)`);
      const s = ticks(t, c.t + d0 + 14 * STEP, 2);
      sSub("opacity", s.toFixed(3));
      sSub("transform", `translateY(${((1 - s) * 16).toFixed(1)}px)`);
      if (a > dur) sR("opacity", 0);
    };
  }

  // ---------- SCORE BUG: the clock's half disc stands on the bar like the arc on the baseline
  {
    const B = L.bug;
    const root = el("div", { class: "hc-bug", style: { position: "absolute", left: B.x + "px", top: B.y + "px", transformOrigin: "0 0", opacity: 0 } }, stage);
    const R = 74, dome = 92, barH = 74;
    const domeX = dome;                                   // dome centre, relative to root
    const bar = el("div", { style: { position: "absolute", left: 0, top: 0, height: barH + "px", background: C.ink, transformOrigin: "0 0" } }, root);
    const arcWrap = el("div", { style: { position: "absolute", left: 0, top: 0 } }, root);
    const arc = new Arc(arcWrap, { R, w: 15, x: domeX, y: 0, base: false, dome, offCol: "rgba(242,241,236,.13)" });
    const num = el("div", { class: "hc-clocknum", style: { position: "absolute", left: (domeX - 60) + "px", width: "120px", top: "-58px", textAlign: "center" } }, root, "12");
    const game = el("div", { class: "hc-gameclock", style: { position: "absolute", left: (domeX - 70) + "px", width: "140px", top: "0", height: barH + "px", lineHeight: barH + "px", textAlign: "center" } }, root, "");
    let x = 2 * dome + 18;
    const T = [];
    for (const code of teams) {
      const blk = el("div", { style: { position: "absolute", left: x + "px", top: 0, height: barH + "px", width: "214px" } }, root);
      const cd = el("div", { class: "hc-code", style: { position: "absolute", left: "22px", top: 0, lineHeight: barH + "px" } }, blk, code);
      const box = el("div", { style: { position: "absolute", right: "22px", top: 0, height: barH + "px", width: "64px", overflow: "hidden" } }, blk);
      const s0 = el("div", { class: "hc-score", style: { position: "absolute", right: 0, top: 0, lineHeight: barH + "px" } }, box, "0");
      const s1 = el("div", { class: "hc-score", style: { position: "absolute", right: 0, top: 0, lineHeight: barH + "px", opacity: 0 } }, box, "0");
      const pos = el("div", { style: { position: "absolute", left: "14px", right: "14px", bottom: "0", height: "6px", background: C.volt, transformOrigin: "50% 100%", transform: "scaleY(0)" } }, blk);
      const chip = el("div", { class: "hc-chip", style: { position: "absolute", left: "22px", top: "-62px", height: "52px", padding: "0 16px", lineHeight: "52px", background: C.volt, color: C.ink, opacity: 0 } }, blk, "+2");
      const sep = el("div", { style: { position: "absolute", left: "0", top: "16px", width: "2px", height: (barH - 32) + "px", background: C.grey } }, blk);
      T.push({ code, blk, setBlk: setter(blk), s0, s1, pos, chip, set0: setter(s0), set1: setter(s1), t0: txt(s0), t1: txt(s1), setPos: setter(pos), setChip: setter(chip), tChip: txt(chip) });
      x += 214;
    }
    const tag = el("div", { style: { position: "absolute", left: x + "px", top: 0, height: barH + "px", width: "246px" } }, root);
    el("div", { style: { position: "absolute", left: "0", top: "16px", width: "2px", height: (barH - 32) + "px", background: C.grey } }, tag);
    const tagN = el("div", { class: "hc-tagn", style: { position: "absolute", left: "24px", top: 0, lineHeight: barH + "px" } }, tag, STOPS[stop].n);
    const tagC = el("div", { class: "hc-tagc", style: { position: "absolute", left: "84px", top: 0, lineHeight: barH + "px" } }, tag, STOPS[stop].city);
    const fin = el("div", { class: "hc-final", style: { position: "absolute", left: (x + 2) + "px", top: 0, height: barH + "px", width: "244px", lineHeight: barH + "px", textAlign: "center", background: C.volt, color: C.ink, opacity: 0 } }, root, "Final");
    const sFin = setter(fin);
    const barW = x + 246;
    bar.style.width = barW + "px";
    const sR = setter(root), sBar = setter(bar), sNum = setter(num), tNum = txt(num), sArcW = setter(arcWrap), tGame = txt(game), sGame = setter(game), sTag = setter(tag);
    root.style.transform = `scale(${B.s})`;
    P.bugW = barW; P.bugDome = dome;
    P.bug = (t, show) => {
      const inC = last(show.cues, "bug", t);
      const on = inC && inC.on;
      const a = inC ? t - inC.t : 99;
      // in: the dome rises (2 ticks), the bar runs out (4 ticks), the teams land (2 ticks); out: 3 ticks
      let vis, dRise, bx, tx;
      if (on) { dRise = ticks(t, inC.t, 2); bx = ticks(t, inC.t + 2 * STEP, 4); tx = ticks(t, inC.t + 5 * STEP, 2); vis = 1; }
      else { const o = 1 - ticks(t, inC ? inC.t : -99, 3); dRise = o; bx = o; tx = o; vis = o > 0 ? 1 : 0; }
      sR("opacity", vis);
      sArcW("transform", `scaleY(${dRise.toFixed(3)})`);
      sArcW("transformOrigin", "0 0");
      sBar("transform", `scaleX(${Math.max(bx, .001).toFixed(4)})`);
      sNum("opacity", tx.toFixed(3));
      sTag("opacity", tx.toFixed(3));
      // clock
      const ck = clockAt(t, show);
      const el_ = ck.el;
      const segs = Math.floor(el_ + 1e-6);              // whole seconds elapsed = lit segments
      const fr = el_ - segs;
      const lit = [];
      const sirenK = ck.siren >= 0 && ck.siren < .9 ? ck.siren : -1;
      const sc = last(show.cues, "score", t);
      const madeAge = sc && sc.pts === 2 ? t - sc.t : 99;
      for (let i = 0; i < 12; i++) {
        let v = i < segs ? 1 : i === segs ? easeOut(fr / .25) * 0 : 0;
        if (i === segs) v = 0;
        if (i < segs && segs >= 9) v = (Math.floor(el_ * 4) % 2 === 0) ? 1 : .55;       // last three seconds: the lit arc blinks
        lit.push(v);
      }
      // the siren: the whole arc flashes and empties (or, when the game is over, stays full)
      if (sirenK >= 0) for (let i = 0; i < 12; i++) lit[i] = Math.floor(sirenK * 8) % 2 === 0 ? 1 : 0;
      if (ck.stopped && ck.siren >= .9) for (let i = 0; i < 12; i++) lit[i] = 1;
      // a made two: the arc sweeps volt left to right in 12 ticks, then the new clock starts empty
      if (madeAge < 12 * STEP + .25) {
        const k = madeAge / STEP;
        for (let i = 0; i < 12; i++) lit[i] = clamp(k - i + 1) * (madeAge < 12 * STEP ? 1 : 1 - (madeAge - 12 * STEP) / .25);
      }
      arc.set(lit.map(v => v * dRise));
      tNum(ck.stopped ? "00" : ck.running ? String(Math.ceil(ck.rem - 1e-6)).padStart(2, "0") : "12");
      const hot = (ck.running && ck.rem <= 3 + 1e-6) || ck.stopped;
      sNum("color", sirenK >= 0 ? C.volt : hot ? C.volt : C.chalk);
      if (gameClock) { const g = Math.max(0, gameClock.from - (t - gameClock.t0)); tGame(`${String(Math.floor(g / 60)).padStart(2, "0")}:${String(Math.floor(g % 60)).padStart(2, "0")}`); }
      sGame("opacity", gameClock ? tx.toFixed(3) : 0);
      // scores
      const { s } = scoreAt(t, show, teams);
      const poss = last(show.cues, "poss", t);
      const won = Object.values(s).some(v => v >= 21);
      const winC = won ? show.cues.filter(c => c.type === "score" && c.t <= t).pop() : null;
      sFin("opacity", (won && winC ? ticks(t, winC.t + 3 * STEP, 2) * tx : 0).toFixed(3));
      for (const tm of T) {
        const sc2 = (() => { let r = null; for (const c of show.cues) { if (c.t > t) break; if (c.type === "score" && c.team === tm.code) r = c; } return r; })();
        const age = sc2 ? t - sc2.t : 99;
        const now = s[tm.code];
        if (age < STEP * 2) {
          // old number slides up, new one comes in from below, on one tick
          const k = easeOut(age / (STEP * 1.2));
          tm.t0(String(now - sc2.pts)); tm.t1(String(now));
          tm.set0("transform", `translateY(${(-k * 74).toFixed(1)}px)`); tm.set0("opacity", (1 - k).toFixed(3));
          tm.set1("transform", `translateY(${((1 - k) * 74).toFixed(1)}px)`); tm.set1("opacity", k.toFixed(3));
        } else {
          tm.t0(String(now)); tm.set0("transform", "none"); tm.set0("opacity", tx.toFixed(3)); tm.set1("opacity", 0);
        }
        // the +1 / +2 chip
        const chipOn = win(age, 0, 2.2, STEP, STEP * 2);
        tm.tChip("+" + (sc2 ? sc2.pts : 1));
        tm.setChip("opacity", chipOn.toFixed(3));
        tm.setChip("transform", `translateY(${((1 - chipOn) * 30).toFixed(1)}px)`);
        tm.setPos("transform", `scaleY(${(poss && poss.team === tm.code ? tx : 0).toFixed(3)})`);
        tm.setBlk("opacity", tx.toFixed(3));
      }
    };
  }

  // ---------- LOWER THIRD: a volt half disc with the number, a chalk card with name and line
  {
    const B = L.lt;
    const root = el("div", { class: "hc-lt", style: { position: "absolute", opacity: 0 } }, stage);
    const H = 116, dome = 64;
    const card = el("div", { style: { position: "absolute", left: 0, top: 0, height: H + "px", background: C.chalk, transformOrigin: "0 0" } }, root);
    const badgeW = el("div", { style: { position: "absolute", left: "0", top: "0", transformOrigin: `${dome}px 0px` } }, root);
    const bsvg = el("svg:svg", { width: 2 * dome, height: dome, viewBox: `0 ${-dome} ${2 * dome} ${dome}`, style: { position: "absolute", left: "0", top: -dome + "px", overflow: "visible" } }, badgeW);
    el("svg:path", { d: `M0 0A${dome} ${dome} 0 0 1 ${2 * dome} 0Z`, fill: C.volt }, bsvg);
    const num = el("div", { class: "hc-ltnum", style: { position: "absolute", left: "0", width: 2 * dome + "px", top: -dome + 14 + "px", textAlign: "center", color: C.ink } }, badgeW, "8");
    const clipN = el("div", { style: { position: "absolute", left: "26px", top: "14px", height: "56px", overflow: "hidden" } }, root);
    const name = el("div", { class: "hc-ltname", style: { color: C.ink, whiteSpace: "nowrap" } }, clipN, "");
    const clipS = el("div", { style: { position: "absolute", left: "28px", top: "72px", height: "30px", overflow: "hidden" } }, root);
    const stat = el("div", { class: "hc-ltstat", style: { color: C.ink, whiteSpace: "nowrap" } }, clipS, "");
    const sR = setter(root), sCard = setter(card), sB = setter(badgeW), sN = setter(name), sS = setter(stat);
    const tName = txt(name), tStat = txt(stat), tNum = txt(num);
    let curKey = null, cardW = 600;
    P.lt = (t, show) => {
      const c = last(show.cues, "player", t);
      if (!c) { sR("opacity", 0); return; }
      const dur = c.dur || 4;
      const a = t - c.t;
      if (a > dur + 1) { sR("opacity", 0); return; }
      const key = c.name + c.num;
      if (key !== curKey) {
        curKey = key;
        tName(c.name); tStat(c.line); tNum(String(c.num));
        _cv.font = `700 40px ${FONT_H}`;
        const wN = _cv.measureText(c.name.toUpperCase()).width * 1.0 + 40 * .02 * c.name.length;
        _cv.font = `700 21px ${FONT_T}`;
        const wS = _cv.measureText(c.line.toUpperCase()).width + 21 * .08 * c.line.length;
        cardW = Math.ceil(Math.max(wN, wS) + 60);
        card.style.width = cardW + "px";
        clipN.style.width = (cardW - 30) + "px"; clipS.style.width = (cardW - 30) + "px";
        if (B.right != null) { root.style.left = (B.right - cardW) + "px"; }
        else root.style.left = B.left + "px";
        root.style.top = (B.bottom - H) + "px";
        badgeW.style.left = "20px";
      }
      sR("opacity", 1);
      const out = a > dur ? ticks(t, c.t + dur, 3) : 0;
      const b = ticks(t, c.t, 2) * (1 - out);
      const k = ticks(t, c.t + STEP, 4) * (1 - out);
      const n = ticks(t, c.t + 3 * STEP, 2) * (1 - out);
      const s = ticks(t, c.t + 4 * STEP, 2) * (1 - out);
      sB("transform", `scaleY(${b.toFixed(3)})`);
      sB("transformOrigin", `${dome}px 0px`);
      sCard("transform", `scaleX(${Math.max(k, .001).toFixed(4)})`);
      sN("transform", `translateY(${((1 - n) * 58).toFixed(1)}px)`);
      sS("transform", `translateY(${((1 - s) * 30).toFixed(1)}px)`);
      if (a > dur + .6) sR("opacity", 0);
    };
  }

  // ---------- CITY BUMPER: STOP number, the city, the date, and the season arc (2 segments per stop)
  {
    const root = el("div", { class: "hc-city", style: { position: "absolute", inset: "0", opacity: 0, overflow: "hidden" } }, stage);
    const wide = fmt === "16x9";
    const panel = el("div", { style: { position: "absolute", background: C.ink } }, root);
    let pw, ph, px, py;
    if (wide) { pw = 640; ph = L.H; px = L.W - pw; py = 0; }
    else { pw = L.W; ph = 560; px = 0; py = 0; }
    Object.assign(panel.style, { left: px + "px", top: py + "px", width: pw + "px", height: ph + "px" });
    const foot = wide ? null : el("div", { style: { position: "absolute", left: 0, bottom: 0, width: L.W + "px", height: "250px", background: C.ink } }, root);
    const inner = el("div", { style: { position: "absolute", left: px + "px", top: py + "px", width: pw + "px", height: ph + "px" } }, root);
    const R = wide ? 150 : 104;
    const arcY = wide ? 330 : 236;
    const arcX = wide ? pw / 2 : 70 + 104 + 9;
    const arc = new Arc(inner, { R, x: arcX, y: arcY, offCol: "rgba(242,241,236,.13)" });
    const stopEl = el("div", { class: "hc-stop", style: { position: "absolute", left: wide ? "0" : "330px", right: wide ? "0" : "auto", top: wide ? `${arcY - 100}px` : "190px", textAlign: wide ? "center" : "left" } }, inner, "Stop 03");
    const cityEl = el("div", { class: "hc-cityname", style: { position: "absolute", left: wide ? "0" : "66px", right: wide ? "0" : "auto", top: wide ? `${arcY + 70}px` : "300px", textAlign: wide ? "center" : "left", whiteSpace: "nowrap" } }, inner, "Manila");
    const dateEl = el("div", { class: "hc-date", style: { position: "absolute", left: wide ? "0" : "70px", right: wide ? "0" : "auto", top: wide ? `${arcY + 200}px` : "450px", textAlign: wide ? "center" : "left" } }, inner, "");
    const tourEl = el("div", { class: "hc-tour", style: { position: "absolute", left: wide ? "0" : "70px", right: wide ? "0" : "auto", textAlign: wide ? "center" : "left" } }, wide ? inner : foot, "Halfcourt World Tour 2027");
    if (wide) tourEl.style.top = (L.H - 150) + "px"; else tourEl.style.top = "60px";
    const wmH = wide ? 30 : 34;
    const wm = wordmark(wide ? inner : foot, wmH, C.chalk, wide ? { left: `${(pw - wordW * wmH / wordH) / 2}px`, top: `${L.H - 108}px` } : { left: "70px", top: "120px" });
    const sR = setter(root), sP = setter(panel), sI = setter(inner), sStop = setter(stopEl), sCity = setter(cityEl), sDate = setter(dateEl), sF = foot ? setter(foot) : null;
    const tStop = txt(stopEl), tCity = txt(cityEl), tDate = txt(dateEl);
    let cur = -1;
    P.city = (t, show) => {
      const c = last(show.cues, "city", t);
      if (!c) { sR("opacity", 0); return; }
      const dur = c.dur || 3;
      const a = t - c.t;
      if (a > dur + .6 || a < 0) { sR("opacity", 0); return; }
      const si = c.stop ?? stop;
      if (si !== cur) {
        cur = si;
        const S = STOPS[si];
        tStop("Stop " + S.n); tCity(S.city); tDate(S.date + " 2027");
        cityEl.style.fontSize = fitSize(S.city.toUpperCase(), FONT_H, 700, wide ? pw - 110 : 940, wide ? 92 : 120, .01).toFixed(1) + "px";
      }
      sR("opacity", 1);
      const out = a > dur ? ticks(t, c.t + dur, 3) : 0;
      const pin = ticks(t, c.t, 3) * (1 - out);
      if (wide) { sP("transform", `translateX(${((1 - pin) * pw).toFixed(1)}px)`); sI("transform", `translateX(${((1 - pin) * pw).toFixed(1)}px)`); }
      else { sP("transform", `translateY(${(-(1 - pin) * ph).toFixed(1)}px)`); sI("transform", `translateY(${(-(1 - pin) * ph).toFixed(1)}px)`); sF("transform", `translateY(${((1 - pin) * 250).toFixed(1)}px)`); }
      // the season arc: each stop owns two segments; past stops chalk, this stop volt, ticking in
      const k = (a - 2 * STEP) / STEP;
      const lit = [], off = [];
      for (let i = 0; i < 12; i++) {
        const stp = Math.floor(i / 2);
        const on = clamp(k - i);
        lit.push(stp === si ? on : 0);
        off.push(1);
      }
      arc.set(lit, off);
      // past stops: chalk segments (drawn by the off layer at a brighter opacity)
      for (let i = 0; i < 12; i++) arc.setOff[i]("fill", Math.floor(i / 2) < si ? "rgba(242,241,236,.62)" : "");
      const tx = ticks(t, c.t + 3 * STEP, 2) * (1 - out);
      sStop("opacity", tx.toFixed(3));
      sCity("opacity", tx.toFixed(3)); sCity("transform", `translateY(${((1 - tx) * 30).toFixed(1)}px)`);
      const td = ticks(t, c.t + 5 * STEP, 2) * (1 - out);
      sDate("opacity", td.toFixed(3));
    };
  }

  // ---------- REPLAY tag (during the replay shot)
  {
    const wide = fmt === "16x9";
    const root = el("div", { class: "hc-rtag", style: { position: "absolute", left: (wide ? 96 : 70) + "px", top: (wide ? 72 : 150) + "px", height: "60px", opacity: 0, display: "flex" } }, stage);
    const a = el("div", { style: { background: C.volt, color: C.ink, padding: "0 20px", lineHeight: "60px" }, class: "hc-rtagA" }, root, "Replay");
    const b = el("div", { style: { background: C.ink, color: C.chalk, padding: "0 20px", lineHeight: "60px" }, class: "hc-rtagB" }, root, "0.5×");
    const sR = setter(root);
    P.rtag = (t, show) => {
      const c = last(show.cues, "replay", t);
      if (!c) { sR("opacity", 0); return; }
      const v = win(t, c.t + (c.tagIn ?? .6), c.t + (c.dur || 3), 2 * STEP, 2 * STEP);
      sR("opacity", v.toFixed(3));
      sR("transform", `translateX(${((1 - v) * -40).toFixed(1)}px)`);
    };
  }

  // ---------- WIPE: the half circle rises from the middle of the bottom edge (the baseline) until it covers the
  // frame (ink, a volt rim of 12 segments on its edge); the cut happens under it; then it sinks back into the
  // baseline and the next shot opens around it. Only transform (scale) and opacity animate.
  {
    const cx = L.W / 2, cy = L.H;
    const Rmax = Math.ceil(Math.hypot(L.W / 2, L.H) + 40);
    const rimW = fmt === "16x9" ? 46 : 40;
    const svg = el("svg:svg", { width: 2 * Rmax, height: Rmax, viewBox: `${-Rmax} ${-Rmax} ${2 * Rmax} ${Rmax}`, class: "hc-wipe",
      style: { position: "absolute", left: (cx - Rmax) + "px", top: (cy - Rmax) + "px", opacity: 0, transformOrigin: "50% 100%", transform: "scale(0)", overflow: "visible" } }, stage);
    el("svg:path", { d: `M${-Rmax} 0A${Rmax} ${Rmax} 0 0 1 ${Rmax} 0Z`, fill: C.ink }, svg);
    let rd = "";
    for (let i = 0; i < 12; i++) rd += segPath(0, 0, Rmax - rimW / 2, rimW, i, rimW * .3);
    el("svg:path", { d: rd, fill: C.volt }, svg);
    const word = el("div", { class: "hc-wipeword", style: { position: "absolute", left: 0, right: 0, textAlign: "center", opacity: 0, top: (fmt === "16x9" ? L.H / 2 - 70 : L.H / 2 - 60) + "px" } }, stage, "Replay");
    const sS = setter(svg), sW = setter(word), tW = txt(word);
    P.wipe = (t, show) => {
      // cues: { type: "wipe", t: cut, pre, hold, post, word?, keep? }: rise over `pre`, hold, sink over `post`
      let act = null;
      for (const c of show.cues) { if (c.type !== "wipe") continue; const pre = c.pre ?? 4 * STEP, post = c.post ?? 4 * STEP; if (t >= c.t - pre - .01 && t <= c.t + (c.hold || 0) + post + .01) act = c; }
      if (!act || (act.keep && t >= act.t)) { sS("opacity", 0); sW("opacity", 0); return; }
      const pre = act.pre ?? 4 * STEP, post = act.post ?? 4 * STEP, hold = act.hold || 0;
      let k;
      if (t < act.t) k = pre > 0 ? easeInOut((t - (act.t - pre)) / pre) : 1;
      else if (t < act.t + hold) k = 1;
      else k = 1 - easeInOut((t - act.t - hold) / post);
      sS("opacity", k > .002 ? 1 : 0);
      sS("transform", `scale(${Math.max(k, .001).toFixed(4)})`);
      if (act.word) {
        tW(act.word);
        const wv = t < act.t - .02 ? 0 : t < act.t + hold ? clamp((t - act.t + .02) / (STEP * .6)) : 1 - clamp((t - act.t - hold) / (STEP * .8));
        sW("opacity", wv.toFixed(3));
      } else sW("opacity", 0);
    };
  }

  // ---------- STAT: a gauge in the arc (share of 12 segments)
  {
    const wide = fmt === "16x9";
    const root = el("div", { class: "hc-stat", style: { position: "absolute", opacity: 0 } }, stage);
    const W = 420, H = 270;
    Object.assign(root.style, wide ? { right: "96px", top: "84px", width: W + "px", height: H + "px" } : { left: "70px", top: "1000px", width: W + "px", height: H + "px" });
    el("div", { style: { position: "absolute", inset: "0", background: C.ink } }, root);
    const arc = new Arc(root, { R: 110, x: W / 2, y: 168, offCol: "rgba(242,241,236,.13)" });
    const val = el("div", { class: "hc-statval", style: { position: "absolute", left: 0, right: 0, top: "110px", textAlign: "center" } }, root, "");
    const lab = el("div", { class: "hc-statlab", style: { position: "absolute", left: 0, right: 0, top: "206px", textAlign: "center" } }, root, "");
    const sR = setter(root), tV = txt(val), tL = txt(lab);
    P.stat = (t, show) => {
      const c = last(show.cues, "stat", t);
      if (!c) { sR("opacity", 0); return; }
      const dur = c.dur || 4, a = t - c.t;
      const v = win(t, c.t, c.t + dur, 2 * STEP, 2 * STEP);
      sR("opacity", v.toFixed(3));
      if (v <= 0) return;
      const share = c.value / c.of;
      const n = share * 12;
      const k = clamp(a / (12 * STEP)) * n;                 // fills tick by tick up to the share
      arc.set(Array.from({ length: 12 }, (_, i) => clamp(k - i)));
      tV(`${c.made}/${c.of}`);
      tL(c.label);
    };
  }

  // ---------- END CARD: the season as the arc (six stops, two segments each), the wordmark, the line
  {
    const wide = fmt === "16x9";
    const root = el("div", { class: "hc-end", style: { position: "absolute", inset: "0", opacity: 0 } }, stage);
    const bg = el("div", { style: { position: "absolute", inset: "0", background: C.ink } }, root);
    const R = wide ? 300 : 250;
    const cx = L.W / 2, cy = wide ? 530 : 840;
    const arc = new Arc(root, { R, x: cx, y: cy, offCol: "rgba(242,241,236,.12)" });
    const labs = [];
    for (let i = 0; i < 6; i++) {
      const th = Math.PI - (i * 2 + 1) * Math.PI / 12;
      const rr = R + (wide ? 84 : 56);
      const x = cx + rr * Math.cos(th), y = cy - rr * Math.sin(th);
      const anchorX = Math.cos(th) < -.2 ? "right" : Math.cos(th) > .2 ? "left" : "center";
      const box = el("div", { class: "hc-endstop", style: { position: "absolute", top: (y - 24).toFixed(1) + "px", width: "360px", textAlign: anchorX, opacity: 0 } }, root);
      if (anchorX === "right") box.style.left = (x - 360).toFixed(1) + "px";
      else if (anchorX === "left") box.style.left = x.toFixed(1) + "px";
      else box.style.left = (x - 180).toFixed(1) + "px";
      el("span", { class: "hc-endn" }, box, STOPS[i].n + " ");
      el("span", { class: "hc-endc" }, box, STOPS[i].city);
      el("div", { class: "hc-endd" }, box, STOPS[i].date);
      labs.push(setter(box));
    }
    const wmH = wide ? 76 : 52;
    const wmW = wordW * wmH / wordH;
    const wm = wordmark(root, wmH, C.chalk, { left: `${(L.W - wmW) / 2}px`, top: `${cy + (wide ? 74 : 70)}px` });
    const line = el("div", { class: "hc-endline", style: { position: "absolute", left: 0, right: 0, top: `${cy + (wide ? 206 : 180)}px`, textAlign: "center" } }, root, LINE);
    const by = el("div", { class: "hc-endby", style: { position: "absolute", left: 0, right: 0, top: `${wide ? 978 : 1720}px`, textAlign: "center" } }, root, "A broadcast identity by Boško Kosić");
    const sR = setter(root), sBg = setter(bg), sWm = setter(wm), sL = setter(line), sBy = setter(by);
    if (!wide) { line.style.lineHeight = "1.25"; line.innerHTML = "One hoop. Twelve seconds.<br>Twenty-one points."; }
    P.end = (t, show) => {
      const c = last(show.cues, "end", t);
      if (!c) { sR("opacity", 0); return; }
      const a = t - c.t;
      sR("opacity", 1);
      sBg("opacity", c.bg === false ? 0 : 1);
      const k = (a - .5) / STEP;                            // stops land two segments at a time, one stop per two ticks
      const lit = [], off = [];
      const fin = c.siren != null ? t - (c.t + c.siren) : -1;
      for (let i = 0; i < 12; i++) lit.push(clamp(k - i));
      if (fin >= 0) for (let i = 0; i < 12; i++) lit[i] = fin < .8 ? (Math.floor(fin * 8) % 2 === 0 ? 1 : .25) : 1;
      arc.set(lit);
      for (let i = 0; i < 6; i++) { const v = clamp(k - (2 * i + 1)); labs[i]("opacity", v.toFixed(3)); labs[i]("transform", `translateY(${((1 - v) * 12).toFixed(1)}px)`); }
      const w = ticks(t, c.t + .5 + 13 * STEP, 2);
      sWm("opacity", w.toFixed(3)); sWm("transform", `translateY(${((1 - w) * 20).toFixed(1)}px)`);
      const l = ticks(t, c.t + .5 + 16 * STEP, 2);
      sL("opacity", l.toFixed(3)); sL("transform", `translateY(${((1 - l) * 16).toFixed(1)}px)`);
      const b = ticks(t, c.t + .5 + 19 * STEP, 2);
      sBy("opacity", b.toFixed(3));
    };
  }

  const order = ["open", "city", "bug", "lt", "stat", "rtag", "end", "wipe"];
  return {
    L, parts: P,
    render(t, show) { for (const k of order) P[k](t, show); },
  };
}

// the package's type styles (one place for every format)
export const CSS = `
.hc-stage{position:relative;overflow:hidden;color:${C.chalk};font-family:${FONT_T},sans-serif;font-weight:700;-webkit-font-smoothing:antialiased;font-kerning:normal}
.hc-stage *{box-sizing:border-box}
.hc-sub{font-family:${FONT_T};font-weight:700;font-size:26px;letter-spacing:.2em;text-transform:uppercase;color:${C.chalk}}
.hc-9x16 .hc-sub{font-size:28px}
.hc-clocknum{font-family:${FONT_T};font-weight:700;font-size:50px;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.hc-gameclock{font-family:${FONT_T};font-weight:700;font-size:27px;font-variant-numeric:tabular-nums;color:rgba(242,241,236,.72);letter-spacing:.02em}
.hc-code{font-family:${FONT_H};font-weight:700;font-size:25px;letter-spacing:.02em;color:${C.chalk}}
.hc-score{font-family:${FONT_T};font-weight:700;font-size:50px;font-variant-numeric:tabular-nums;color:${C.chalk};letter-spacing:-.01em}
.hc-chip{font-family:${FONT_H};font-weight:700;font-size:28px;letter-spacing:.02em}
.hc-tagn{font-family:${FONT_H};font-weight:700;font-size:25px;color:${C.volt}}
.hc-final{font-family:${FONT_H};font-weight:700;font-size:26px;letter-spacing:.04em;text-transform:uppercase}
.hc-tagc{font-family:${FONT_T};font-weight:700;font-size:21px;letter-spacing:.14em;text-transform:uppercase;color:${C.chalk}}
.hc-ltname{font-family:${FONT_H};font-weight:700;font-size:40px;line-height:56px;text-transform:uppercase;letter-spacing:.02em}
.hc-ltstat{font-family:${FONT_T};font-weight:700;font-size:21px;line-height:30px;letter-spacing:.08em;text-transform:uppercase;opacity:.78}
.hc-ltnum{font-family:${FONT_H};font-weight:700;font-size:38px;line-height:1}
.hc-stop{font-family:${FONT_T};font-weight:700;font-size:28px;letter-spacing:.24em;text-transform:uppercase;color:${C.volt}}
.hc-cityname{font-family:${FONT_H};font-weight:700;line-height:1.1;text-transform:uppercase;color:${C.chalk};letter-spacing:.01em}
.hc-date{font-family:${FONT_T};font-weight:700;font-size:30px;letter-spacing:.12em;text-transform:uppercase;color:${C.chalk}}
.hc-tour{font-family:${FONT_T};font-weight:700;font-size:19px;letter-spacing:.24em;text-transform:uppercase;color:rgba(242,241,236,.62)}
.hc-rtagA,.hc-rtagB{font-family:${FONT_H};font-weight:700;font-size:24px;text-transform:uppercase;letter-spacing:.04em}
.hc-rtagB{font-family:${FONT_T};font-size:24px;letter-spacing:.06em}
.hc-wipeword{font-family:${FONT_H};font-weight:700;font-size:118px;line-height:1;text-transform:uppercase;color:${C.chalk};letter-spacing:.02em}
.hc-9x16 .hc-wipeword{font-size:96px}
.hc-statval{font-family:${FONT_T};font-weight:700;font-size:56px;font-variant-numeric:tabular-nums}
.hc-statlab{font-family:${FONT_T};font-weight:700;font-size:20px;letter-spacing:.2em;text-transform:uppercase;color:rgba(242,241,236,.7)}
.hc-endstop{font-family:${FONT_T};font-weight:700;font-size:28px;letter-spacing:.12em;text-transform:uppercase;line-height:1.25}
.hc-endn{color:${C.volt};font-family:${FONT_H};font-size:26px;letter-spacing:.02em}
.hc-endc{color:${C.chalk}}
.hc-endd{color:rgba(242,241,236,.55);font-size:20px;letter-spacing:.14em}
.hc-endline{font-family:${FONT_T};font-weight:600;font-size:40px;letter-spacing:.01em;color:${C.chalk}}
.hc-9x16 .hc-endline{font-size:44px}
.hc-9x16 .hc-endstop{font-size:24px}
.hc-9x16 .hc-endn{font-size:22px}
.hc-9x16 .hc-endd{font-size:17px}
.hc-endby{font-family:${FONT_T};font-weight:600;font-size:23px;letter-spacing:.2em;text-transform:uppercase;color:rgba(242,241,236,.6)}
`;
