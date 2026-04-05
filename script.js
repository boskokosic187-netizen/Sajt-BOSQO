/* ============================================
   NAVBAR INTERACTION
   ============================================ */

(function () {
  const nav = document.querySelector('.nav-inner');
  const logoWrap = document.querySelector('.nav-logo-wrap');
  if (!nav || !logoWrap) return;

  let closeTimeout = null;
  let cleanupTimeout = null;
  let mouseReady = false;
  const rect  = nav.querySelector('.nf-rect');
  const frame = nav.querySelector('.nav-frame');

  // mousemove ne puca na page load — okida se samo kad korisnik zaista pomjeri mis
  document.addEventListener('mousemove', () => { mouseReady = true; }, { once: true, passive: true });

  function open() {
    if (!mouseReady) return;
    clearTimeout(closeTimeout);
    clearTimeout(cleanupTimeout);
    if (rect)  rect.style.strokeDashoffset = '';
    if (frame) { frame.style.left = ''; frame.style.right = ''; frame.style.width = ''; }
    nav.classList.remove('nav-closing');
    nav.classList.add('nav-opening');
  }

  function startClose() {
    // Freeze the fully-open visual state as inline styles BEFORE switching classes
    // so the animation doesn't snap to CSS base values on class removal
    if (rect)  rect.style.strokeDashoffset = '0';
    if (frame) {
      frame.style.left  = '-180px';
      frame.style.right = '-180px';
      frame.style.width = 'calc(100% + 360px)';
    }

    // Force reflow so inline styles are painted before class change
    nav.getBoundingClientRect();

    nav.classList.remove('nav-opening');
    nav.classList.add('nav-closing');

    // Clean up inline styles after close animation finishes (~1.6s)
    cleanupTimeout = setTimeout(() => {
      if (rect)  rect.style.strokeDashoffset = '';
      if (frame) { frame.style.left = ''; frame.style.right = ''; frame.style.width = ''; }
    }, 1800);
  }

  function scheduleClose() {
    clearTimeout(closeTimeout);
    closeTimeout = setTimeout(startClose, 2000);
  }

  logoWrap.addEventListener('mouseenter', open);
  nav.addEventListener('mouseenter', () => clearTimeout(closeTimeout));
  nav.addEventListener('mouseleave', scheduleClose);
})();

/* ============================================
   STAR FIELD
   ============================================ */

(function () {
  const canvas = document.getElementById('stars');
  const ctx = canvas.getContext('2d');
  let stars = [];
  let w, h;

  const STAR_COUNT = 350;
  const MOUSE_RADIUS = 70;
  let mouse = { x: -9999, y: -9999 };

  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function createStar() {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 0.9 + 0.2,
      dx: (Math.random() - 0.5) * 0.1,
      dy: (Math.random() - 0.5) * 0.1,
      opacity: Math.random() * 0.3 + 0.15,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.01 + 0.004,
    };
  }

  function init() {
    resize();

    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push(createStar());
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    for (const s of stars) {
      s.x += s.dx;
      s.y += s.dy;
      s.pulse += s.pulseSpeed;

      if (s.x < -5) s.x = w + 5;
      if (s.x > w + 5) s.x = -5;
      if (s.y < -5) s.y = h + 5;
      if (s.y > h + 5) s.y = -5;

      const ddx = s.x - mouse.x;
      const ddy = s.y - mouse.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      const proximity = Math.max(0, 1 - dist / MOUSE_RADIUS);

      const baseFlicker = s.opacity * (0.6 + 0.4 * Math.sin(s.pulse));
      const boostedOpacity = Math.min(1, baseFlicker + proximity * 1.0);
      const boostedRadius = s.r + proximity * 3.5;

      if (proximity > 0) {
        const haloR = boostedRadius * 7;
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, haloR);
        glow.addColorStop(0, `rgba(29, 233, 182, ${proximity * 0.22})`);
        glow.addColorStop(0.4, `rgba(29, 233, 182, ${proximity * 0.06})`);
        glow.addColorStop(1, 'rgba(29, 233, 182, 0)');
        ctx.beginPath();
        ctx.arc(s.x, s.y, haloR, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, boostedRadius, 0, Math.PI * 2);
      ctx.fillStyle = proximity > 0
        ? `rgba(200, 255, 235, ${boostedOpacity})`
        : `rgba(220, 230, 255, ${baseFlicker})`;
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
})();

/* ============================================
   STARDROPS — shooting stars
   ============================================ */

(function () {
  const canvas = document.getElementById('stardrops');
  const ctx = canvas.getContext('2d');
  let drops = [];
  let w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function createDrop() {
    // Spawn on a random screen edge
    let x, y;
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { x = Math.random() * w; y = -10; }
    else if (edge === 1) { x = Math.random() * w; y = h + 10; }
    else if (edge === 2) { x = -10; y = Math.random() * h; }
    else                 { x = w + 10; y = Math.random() * h; }

    // Direction toward screen center (where avatar is)
    const toCx = w / 2 - x;
    const toCy = h / 2 - y;
    const dist  = Math.sqrt(toCx * toCx + toCy * toCy);
    const speed = Math.random() * 3 + 2;

    return {
      x, y,
      dx: (toCx / dist) * speed,
      dy: (toCy / dist) * speed,
      length: Math.random() * 100 + 60,
      opacity: Math.random() * 0.6 + 0.3,
      life: 1,
      decay: Math.random() * 0.004 + 0.003,
      width: Math.random() * 1.2 + 0.4,
    };
  }

  let spawnTimer = 0;
  const SPAWN_INTERVAL = 1000;

  function draw(timestamp) {
    ctx.clearRect(0, 0, w, h);

    if (!spawnTimer) spawnTimer = timestamp;
    const boost    = window._stardropBoost || 1;
    const interval = SPAWN_INTERVAL / boost;
    if (timestamp - spawnTimer > interval) {
      const count = Math.ceil(boost);
      for (let i = 0; i < count; i++) drops.push(createDrop());
      spawnTimer = timestamp;
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.x += d.dx;
      d.y += d.dy;
      d.life -= d.decay;

      if (d.life <= 0 || d.x < -50 || d.x > w + 50 || d.y < -50 || d.y > h + 50) {
        drops.splice(i, 1);
        continue;
      }

      const speed = Math.sqrt(d.dx * d.dx + d.dy * d.dy);
      const tailX = d.x - d.dx * (d.length / speed);
      const tailY = d.y - d.dy * (d.length / speed);

      const gradient = ctx.createLinearGradient(tailX, tailY, d.x, d.y);
      gradient.addColorStop(0, `rgba(29, 233, 182, 0)`);
      gradient.addColorStop(1, `rgba(29, 233, 182, ${d.opacity * d.life})`);

      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(d.x, d.y);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = d.width;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(d.x, d.y, d.width + 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 255, 240, ${d.opacity * d.life * 0.8})`;
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();

/* ============================================
   AVATAR CIRCLE HOVER + RING ROTATION
   ============================================ */

(function () {
  const wrapper    = document.querySelector('.avatar-wrapper');
  const ring       = document.querySelector('.avatar-ring');
  const dot        = document.querySelector('.ring-dot');
  if (!wrapper || !ring || !dot) return;

  // --- Info panels ---
  const allPanels   = Array.from(document.querySelectorAll('.info-panel'));
  const PANEL_DELAY = 1000;                    // initial delay after hover
  const PANEL_STEP  = 333;                     // ms between each panel
  let panelTimers   = [];
  let panelsVisible = false;

  function showPanels() {
    if (panelsVisible) return;
    panelsVisible = true;
    allPanels.forEach((panel, i) => {
      const t = setTimeout(() => {
        panel.classList.add('ip-visible');
      }, PANEL_DELAY + i * PANEL_STEP);
      panelTimers.push(t);
    });
  }

  function hidePanels() {
    panelTimers.forEach(clearTimeout);
    panelTimers   = [];
    panelsVisible = false;
    allPanels.forEach(panel => panel.classList.remove('ip-visible'));
  }

  // --- Hover detection ---
  let hovered      = false;
  let hoverStart   = null;
  let dotBurst     = false;
  let reappearTimer = null;

  function onHoverEnter() {
    hovered    = true;
    hoverStart = performance.now();
    document.body.classList.add('avatar-hovered');
    showPanels();
  }

  function onHoverLeave() {
    hovered    = false;
    hoverStart = null;
    document.body.classList.remove('avatar-hovered');
    hidePanels();

    if (dotBurst) {
      // Reappear at a random orbital position after a short random delay
      clearTimeout(reappearTimer);
      reappearTimer = setTimeout(() => {
        angle = Math.random() * 360;          // random position on the orbit
        dot.classList.remove('hidden');
        dot.classList.remove('bursting');
        dot.classList.add('appearing');
        dot.addEventListener('animationend', () => {
          dot.classList.remove('appearing');
        }, { once: true });
        dotBurst = false;
      }, 400 + Math.random() * 800);
    }
  }

  const leftPanelsEl  = document.querySelector('.info-panels-left');
  const rightPanelsEl = document.querySelector('.info-panels-right');
  const allWraps      = Array.from(document.querySelectorAll('.info-panel-wrap'));
  let hoveredWrap     = null;

  function inRect(el, x, y) {
    if (!el) return false;
    const rr = el.getBoundingClientRect();
    return x >= rr.left && x <= rr.right && y >= rr.top && y <= rr.bottom;
  }

  function updateWrapHover(x, y) {
    let found = null;
    for (const wrap of allWraps) {
      const rr = wrap.getBoundingClientRect();
      if (x >= rr.left && x <= rr.right && y >= rr.top && y <= rr.bottom) {
        found = wrap;
        break;
      }
    }
    if (found !== hoveredWrap) {
      if (hoveredWrap) hoveredWrap.classList.remove('ip-hovered');
      hoveredWrap = found;
      if (hoveredWrap) hoveredWrap.classList.add('ip-hovered');
    }
  }

  function isInsideCircle(x, y) {
    const r  = wrapper.getBoundingClientRect();
    const cx = r.left + r.width  / 2;
    const cy = r.top  + r.height / 2;
    return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= r.width / 2;
  }

  function isOverExtended(x, y) {
    // Panels (exact bounds, includes expanded dropdown as wrap grows)
    if (leftPanelsEl) {
      const lpr = leftPanelsEl.getBoundingClientRect();
      if (x >= lpr.left && x <= lpr.right && y >= lpr.top && y <= lpr.bottom) return true;
    }
    if (rightPanelsEl) {
      const rpr = rightPanelsEl.getBoundingClientRect();
      if (x >= rpr.left && x <= rpr.right && y >= rpr.top && y <= rpr.bottom) return true;
    }

    // Gap between left panels and circle
    const r = wrapper.getBoundingClientRect();
    if (leftPanelsEl) {
      const lpr = leftPanelsEl.getBoundingClientRect();
      if (x >= lpr.right && x <= r.left && y >= r.top && y <= r.bottom) return true;
    }

    // Gap between circle and right panels
    if (rightPanelsEl) {
      const rpr = rightPanelsEl.getBoundingClientRect();
      if (x >= r.right && x <= rpr.left && y >= r.top && y <= r.bottom) return true;
    }

    return false;
  }

  let leaveTimer    = null;
  let wrapLeaveTimer = null;
  const LEAVE_DELAY = 1000;

  function check(e) {
    const x = e.clientX, y = e.clientY;
    const inCircle  = isInsideCircle(x, y);
    // Extended zone only keeps hover alive — never triggers it
    const inExtended = hovered && isOverExtended(x, y);
    const active = inCircle || inExtended;

    if (active) {
      // Cancel any pending leave
      if (leaveTimer)    { clearTimeout(leaveTimer);    leaveTimer    = null; }
      if (wrapLeaveTimer){ clearTimeout(wrapLeaveTimer); wrapLeaveTimer = null; }
      // Only enter hover if cursor is on the circle
      if (inCircle && !hovered) onHoverEnter();
      updateWrapHover(x, y);
    } else {
      // Schedule leave after 1s if not already scheduled
      if (hovered && !leaveTimer) {
        leaveTimer = setTimeout(() => {
          onHoverLeave();
          leaveTimer = null;
        }, LEAVE_DELAY);
      }
      if (hoveredWrap && !wrapLeaveTimer) {
        wrapLeaveTimer = setTimeout(() => {
          if (hoveredWrap) { hoveredWrap.classList.remove('ip-hovered'); hoveredWrap = null; }
          wrapLeaveTimer = null;
        }, LEAVE_DELAY);
      }
    }
  }

  window.addEventListener('mousemove', check, { passive: true });

  // --- Smooth ring rotation with burst check ---
  const SPEED_NORMAL = 360 / (25 * 60);
  const SPEED_FAST   = SPEED_NORMAL * 2;
  const LERP         = 0.025;

  let angle = 0;
  let speed = SPEED_NORMAL;

  function rotateTick() {
    // Burst after 3s of continuous hover
    if (hovered && !dotBurst && hoverStart !== null) {
      if (performance.now() - hoverStart >= 3000) {
        dotBurst = true;
        dot.classList.add('bursting');
        dot.addEventListener('animationend', () => {
          dot.classList.add('hidden');
          dot.classList.remove('bursting');
        }, { once: true });
      }
    }

    const target = hovered ? SPEED_FAST : SPEED_NORMAL;
    speed += (target - speed) * LERP;
    angle  = (angle + speed) % 360;
    ring.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;

    requestAnimationFrame(rotateTick);
  }

  requestAnimationFrame(rotateTick);
})();

/* ============================================
   SCROLL HINT
   ============================================ */

(function () {
  const hint = document.getElementById('scrollHint');
  if (!hint) return;

  let timer = null;
  const DELAY = 2500;

  function show() { hint.classList.add('visible'); }
  function hide() { hint.classList.remove('visible'); }

  function resetTimer() {
    hide();
    clearTimeout(timer);
    timer = setTimeout(show, DELAY);
  }

  window.addEventListener('wheel',     resetTimer, { passive: true });
  window.addEventListener('touchmove', resetTimer, { passive: true });
  window.addEventListener('keydown',   resetTimer);

  // Start the initial countdown
  timer = setTimeout(show, DELAY);
})();

/* ============================================
   FLOATING ICONS
   ============================================ */

(function () {
  const wrapper = document.querySelector('.avatar-wrapper');
  if (!wrapper) return;

  const iconNames = ['after', 'animate', 'illustrator', 'lightroom', 'photoshop', 'premiere', 'indesign'];
  const ICON_SIZE = 46;
  const ICON_HALF = ICON_SIZE / 2;

  // Canvas overlay for arc pulses on the stroke
  const pulseCanvas = document.createElement('canvas');
  pulseCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;';
  wrapper.appendChild(pulseCanvas);
  const pCtx = pulseCanvas.getContext('2d');

  // Create icon elements
  const iconEls = iconNames.map(name => {
    const div = document.createElement('div');
    div.className = 'floating-icon';
    const inner = document.createElement('div');
    inner.className = 'floating-icon-inner';
    const img = document.createElement('img');
    img.src = `assets/svg/${name}.svg`;
    img.alt = name;
    img.draggable = false;
    inner.appendChild(img);
    div.appendChild(inner);
    wrapper.appendChild(div);
    return div;
  });

  let circleR = 0;

  function measure() {
    circleR = wrapper.offsetWidth / 2;
    pulseCanvas.width  = wrapper.offsetWidth;
    pulseCanvas.height = wrapper.offsetHeight;
  }

  measure();
  window.addEventListener('resize', measure);

  // Init physics state — random front/back layer
  const state = iconEls.map((el, i) => {
    const angle = (i / iconEls.length) * Math.PI * 2;
    const r = circleR * (0.12 + Math.random() * 0.42);
    const speed = 0.45 + Math.random() * 0.4;
    const dir = Math.random() * Math.PI * 2;
    const front = Math.random() > 0.5;
    el.style.zIndex = front ? '4' : '2';
    return {
      el,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      front
    };
  });

  // Active arc pulses
  const arcPulses = [];

  function spawnArcPulse(nx, ny) {
    arcPulses.push({ angle: Math.atan2(ny, nx), life: 1.0 });
  }

  function drawArcPulses() {
    const size = pulseCanvas.width;
    pCtx.clearRect(0, 0, size, size);

    if (arcPulses.length === 0) return;

    const cx = circleR;
    const cy = circleR;
    const r  = circleR - 1; // sit right on the stroke
    const span = 0.2;       // ±~11° arc half-span
    const steps = 20;

    for (let i = arcPulses.length - 1; i >= 0; i--) {
      const p = arcPulses[i];
      p.life -= 0.032;
      if (p.life <= 0) { arcPulses.splice(i, 1); continue; }

      for (let j = 0; j < steps; j++) {
        const t     = j / (steps - 1);
        const tNext = (j + 1) / (steps - 1);
        const a     = p.angle - span + span * 2 * t;
        const aNext = p.angle - span + span * 2 * tNext;

        const bell  = Math.sin(t * Math.PI);
        const alpha = bell * p.life;

        pCtx.beginPath();
        pCtx.arc(cx, cy, r, a, aNext);
        pCtx.strokeStyle = `rgba(29, 233, 182, ${alpha * 0.85})`;
        pCtx.lineWidth   = 1 + bell * 5;
        pCtx.shadowBlur  = 10 * bell * p.life;
        pCtx.shadowColor = 'rgba(29, 233, 182, 1)';
        pCtx.stroke();
      }
    }

    pCtx.shadowBlur = 0;
  }

  function tick() {
    if (circleR === 0) { requestAnimationFrame(tick); return; }

    const boundary = circleR - ICON_HALF - 5;

    state.forEach(s => {
      s.x += s.vx;
      s.y += s.vy;

      const dist = Math.sqrt(s.x * s.x + s.y * s.y);

      if (dist >= boundary) {
        const nx = s.x / dist;
        const ny = s.y / dist;

        const dot = s.vx * nx + s.vy * ny;
        s.vx -= 2 * dot * nx;
        s.vy -= 2 * dot * ny;

        s.x = nx * (boundary - 1);
        s.y = ny * (boundary - 1);

        spawnArcPulse(nx, ny);

        // Randomly flip layer on bounce — never during hover
        if (!document.body.classList.contains('avatar-hovered') && Math.random() > 0.5) {
          s.front = !s.front;
          s.el.style.zIndex = s.front ? '4' : '2';
        }
      }

      s.el.style.left = (circleR + s.x - ICON_HALF) + 'px';
      s.el.style.top  = (circleR + s.y - ICON_HALF) + 'px';
    });

    drawArcPulses();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();


/* ============================================
   SCROLL STAGE ENGINE
   ============================================ */
(function () {
  const MAX_STAGE       = 6;
  const MIN_STEP        = 160;  // minimum ms between any two stage changes (prevents wheel spam)
  const RAPID_THRESHOLD = 700;  // if next scroll within this ms → fast mode
  const RAPID_RESTORE   = 800;  // ms after last fast scroll to restore normal speed

  let stage        = 0;
  let lastStepTime = 0;
  let rapidTimer   = null;
  let scrollCount  = 0;  // accumulates toward SCROLLS_NEEDED
  let lastDir      = 0;  // direction of accumulated scrolls
  const SCROLLS_NEEDED = 1;

  const journeyWrap = document.querySelector('.journey-title-wrap');

  function applyStage(n) {
    const prev = stage;
    stage = Math.max(0, Math.min(MAX_STAGE, n));

    if (journeyWrap) {
      if (stage === 6) {
        if (!journeyWrap.classList.contains('journey-floating')) {
          // First arrival — start animation from beginning (center)
          void journeyWrap.offsetWidth;
          journeyWrap.classList.add('journey-floating');
        }
        journeyWrap.style.animationPlayState = 'running';
      } else if (prev === 6) {
        // Pause exactly where it is — no snapping, no inline style
        journeyWrap.style.animationPlayState = 'paused';
      }
    }

    document.body.dataset.stage = stage;
  }

  function step(dir) {
    const now  = Date.now();
    const prev = lastStepTime;
    if (now - prev < MIN_STEP) return; // debounce wheel spam
    lastStepTime = now;

    // Reset count if direction changed
    if (dir !== lastDir) {
      scrollCount = 0;
      lastDir = dir;
    }

    scrollCount++;
    if (scrollCount < SCROLLS_NEEDED) return; // wait for second scroll
    scrollCount = 0; // reset for next stage

    // Rapid = second scroll arrived before previous animation finished
    const isRapid = prev > 0 && (now - prev) < RAPID_THRESHOLD;

    if (isRapid) {
      document.body.classList.add('scroll-fast');
      clearTimeout(rapidTimer);
      rapidTimer = setTimeout(() => {
        document.body.classList.remove('scroll-fast');
      }, RAPID_RESTORE);
    } else {
      clearTimeout(rapidTimer);
      document.body.classList.remove('scroll-fast');
    }

    applyStage(stage + dir);
  }

  // Mouse wheel
  window.addEventListener('wheel', (e) => {
    step(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') step(1);
    if (e.key === 'ArrowUp'   || e.key === 'PageUp'  ) step(-1);
  });

  // Touch
  let touchY = 0;
  window.addEventListener('touchstart', (e) => {
    touchY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    const dy = touchY - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 50) step(dy > 0 ? 1 : -1);
  }, { passive: true });

  // Init
  applyStage(0);
})();


/* ============================================
   JOURNEY TITLE HOVER
   ============================================ */
(function () {
  const wrap = document.querySelector('.journey-title-wrap');
  if (!wrap) return;

  wrap.addEventListener('mouseenter', () => {
    wrap.classList.add('journey-hovered');
    wrap.style.animationPlayState = 'paused';
    window._stardropBoost = 7;
  });

  wrap.addEventListener('mouseleave', () => {
    wrap.classList.remove('journey-hovered');
    if (document.body.dataset.stage === '6') {
      wrap.style.animationPlayState = 'running';
    }
    window._stardropBoost = 1;
  });
})();
