/* STRUJA timeline — reads the track's event list and features and produces the
   per-frame input for the Director. Used by the live page (audio.currentTime)
   and by the offline film render (frame / fps), so both move identically. */
(function () {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (p) => 1 - Math.pow(1 - clamp(p, 0, 1), 4);

  function Timeline(data, opt) {
    this.d = data;
    this.opt = opt || {};
    this.ev = data.events.slice().sort((a, b) => a.t - b.t);
    this.kicks = data.kicks.map((k) => k[0]);
    this.kickV = data.kicks.map((k) => k[1]);
    this.scale = (data.scale || 1.2) / 255;
  }

  Timeline.prototype.feature = function (name, t) {
    const a = this.d[name], fps = this.d.fps;
    const x = t * fps, i = Math.floor(x), fr = x - i;
    const v0 = a[clamp(i, 0, a.length - 1)], v1 = a[clamp(i + 1, 0, a.length - 1)];
    return (v0 + (v1 - v0) * fr) * this.scale;
  };

  // t: seconds on the track; prev: time of the previous frame (events in (prev, t] fire)
  Timeline.prototype.at = function (t, prev) {
    const s = { intensity: 0.1, tension: 0, text: this.opt.textFromStart ? 1 : 0, textT: this.opt.textFromStart ? -10 : null,
      freeze: false, freezeT: 0, endcard: false, endT: null, dropEvent: false, kick: false, section: 'intro' };
    for (const e of this.ev) {
      if (e.t > t + 1e-6) break;
      if (e.type === 'section') { s.intensity = e.intensity; s.tension = e.tension || 0; s.section = e.name; }
      else if (e.type === 'text') { s.text = e.on; s.textT = e.t; }
      else if (e.type === 'freeze') { s.freeze = !!e.on; s.freezeT = e.t; }
      else if (e.type === 'endcard') { s.endcard = true; s.endT = e.t; }
      else if (e.type === 'drop' && e.t > prev && e.t <= t) s.dropEvent = true;
    }
    for (let i = 0; i < this.kicks.length; i++) {
      const k = this.kicks[i];
      if (k > prev && k <= t) { s.kick = true; s.kickV = this.kickV[i]; }
      if (k > t) break;
    }
    const tf = s.freeze ? s.freezeT : t;
    const f = {
      time: tf,
      bass: this.feature('bass', tf), mid: this.feature('mid', tf), high: this.feature('high', tf), flux: this.feature('flux', tf),
      intensity: s.intensity, tension: s.tension, freeze: s.freeze,
      kick: s.kick && !s.freeze, kickV: s.kickV || 1, dropEvent: s.dropEvent,
      text: s.text, section: s.section, endcard: s.endcard,
    };
    // overrides for choreography
    const o = {};
    if (this.opt.reveal) o.reveal = clamp(t / this.opt.reveal, 0, 1.08);
    if (s.textT != null && s.text) {
      const p = (t - s.textT) / 0.6;
      o.textIntro = easeOut(p);
    }
    if (s.endcard) o.endP = easeOut((t - s.endT) / 2.2);
    const shots = this.opt.shots;
    if (shots && shots.length) {
      let k = 0;
      while (k + 1 < shots.length && shots[k + 1].t <= t + 1e-6) k++;
      const sh = shots[k], end = k + 1 < shots.length ? shots[k + 1].t : (this.d.duration || sh.t + 4);
      const q = clamp((t - sh.t) / Math.max(0.01, end - sh.t), 0, 1);
      const sm = q * q * (3 - 2 * q) * 0.6 + q * 0.4;
      const z0 = sh.z, z1 = sh.z2 == null ? sh.z : sh.z2;
      const x0 = sh.x || 0, x1 = sh.x2 == null ? x0 : sh.x2, y0 = sh.y || 0, y1 = sh.y2 == null ? y0 : sh.y2;
      o.cam = [x0 + (x1 - x0) * sm, y0 + (y1 - y0) * sm, z0 + (z1 - z0) * sm];
      o.camKey = k;
    }
    f.o = o;
    return f;
  };

  window.STRUJA = window.STRUJA || {};
  window.STRUJA.Timeline = Timeline;
})();
