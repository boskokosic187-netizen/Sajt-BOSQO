/* Shared by every prototype: the design canvas (#fit, data-w x data-h) is scaled to the
   window (never past data-max, so no picture is shown above its file), and the page plays
   by itself ("attract") until somebody touches it. Inside the portfolio's device frame the
   page is an iframe that takes no input until the visitor clicks it. */
const UI = (() => {
  const fit = document.getElementById('fit'), W = +fit.dataset.w, H = +fit.dataset.h, MAX = +fit.dataset.max || 1.6;
  const embed = self !== top, rootEl = document.documentElement;
  rootEl.classList.toggle('is-embed', embed);
  fit.style.setProperty('--w', W + 'px'); fit.style.setProperty('--h', H + 'px');
  let scale = 1;
  const size = () => {
    // on its own page on a phone held upright, a landscape canvas lies on its side, like a film
    const vw = rootEl.clientWidth, vh = rootEl.clientHeight;   // not innerWidth: a phone widens that to fit what overflows
    const turn = !embed && W > H && vh > vw * 1.2;
    scale = turn ? Math.min(vh / W, vw / H, MAX) : Math.min(vw / W, vh / H, MAX);
    fit.style.setProperty('--s', scale.toFixed(5)); fit.style.setProperty('--r', turn ? '90deg' : '0deg');
    rootEl.classList.toggle('is-tight', turn || vh - H * scale < 70);
  };
  size(); addEventListener('resize', size);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = embed ? -1e9 : performance.now() - 2500;   // on its own page the show starts after a moment
  const touch = () => { last = performance.now(); };
  ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, touch, { passive: true, capture: true }));
  const api = {
    W, H, embed, reduce,
    get scale() { return scale; },
    /* true while nobody has touched the page for a while: the page may play itself */
    get idle() { return !reduce && performance.now() - last > 6000; },
    /* fn(t, dt) every frame while the tab is visible; t and dt in seconds */
    loop(fn) {
      let p = performance.now();
      const step = (now) => { const dt = Math.min(0.05, (now - p) / 1000); p = now; if (!document.hidden) fn(now / 1000, dt); requestAnimationFrame(step); };
      requestAnimationFrame(step);
    },
    /* run steps [seconds, fn] in a circle while idle; a touch pauses, the circle resumes where it stopped */
    attract(steps) {
      if (reduce) return;
      let i = 0, wait = steps[0][0];
      api.loop((t, dt) => { if (!api.idle) return; wait -= dt; if (wait > 0) return; steps[i][1](); i = (i + 1) % steps.length; wait = steps[i][0]; });
    },
    /* pointer position inside the canvas, in design pixels */
    pt(e) { const r = fit.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; },
  };
  return api;
})();
