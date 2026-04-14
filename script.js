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

  const STROKE_DURATION = 900; // matches ipDraw 0.9s

  function showPanels() {
    if (panelsVisible) return;
    panelsVisible = true;
    allPanels.forEach((panel, i) => {
      const t = setTimeout(() => {
        panel.classList.add('ip-visible');
      }, PANEL_DELAY + i * PANEL_STEP);
      panelTimers.push(t);
    });
    // All panels interactive only after the LAST panel's stroke completes
    const lastDelay = PANEL_DELAY + (allPanels.length - 1) * PANEL_STEP + STROKE_DURATION;
    const tAll = setTimeout(() => {
      document.querySelectorAll('.info-panel-wrap').forEach(w => w.classList.add('ip-interactive'));
    }, lastDelay);
    panelTimers.push(tAll);
  }

  function hidePanels() {
    panelTimers.forEach(clearTimeout);
    panelTimers   = [];
    panelsVisible = false;
    allPanels.forEach(panel => {
      panel.classList.remove('ip-visible');
      panel.parentElement.classList.remove('ip-interactive');
    });
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

  function updateWrapHover(x, y) {
    let found = null;
    for (const wrap of allWraps) {
      if (!wrap.classList.contains('ip-interactive')) continue;
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

  let timer       = null;
  let activeDelay = 2500; // default; overridden per-context
  const DEFAULT_DELAY = 2500;

  function show() { hint.classList.add('visible'); }
  function hide() { hint.classList.remove('visible'); }

  function resetTimer() {
    hide();
    clearTimeout(timer);
    timer = setTimeout(show, activeDelay);
  }

  window.addEventListener('wheel',     resetTimer, { passive: true });
  window.addEventListener('touchmove', resetTimer, { passive: true });
  window.addEventListener('keydown',   resetTimer);

  // Called externally once the page is ready to accept scroll (hero)
  window._startScrollHint = function () {
    activeDelay = DEFAULT_DELAY;
    timer = setTimeout(show, activeDelay);
  };

  // Called externally to cancel current timer and restart with a new delay
  window._resetScrollHint = function (delayMs) {
    hide();
    clearTimeout(timer);
    activeDelay = (delayMs !== undefined) ? delayMs : DEFAULT_DELAY;
    timer = setTimeout(show, activeDelay);
  };

  // Called externally to update the delay used by subsequent scroll resets
  window._setScrollHintDelay = function (delayMs) {
    activeDelay = delayMs;
  };
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
  const MAX_STAGE       = 9;
  const MIN_STEP        = 160;  // minimum ms between any two stage changes (prevents wheel spam)
  const RAPID_THRESHOLD = 700;  // if next scroll within this ms → fast mode
  const RAPID_RESTORE   = 800;  // ms after last fast scroll to restore normal speed

  let stage        = 0;
  let lastStepTime = 0;
  let rapidTimer   = null;
  let scrollCount  = 0;  // accumulates toward SCROLLS_NEEDED
  let lastDir      = 0;  // direction of accumulated scrolls
  const SCROLLS_NEEDED = 1;

  let scrollEnabled = false;
  window._enableScroll = function () { scrollEnabled = true; };

  const journeyWrap = document.querySelector('.journey-title-wrap');

  function applyStage(n) {
    const prev = stage;
    stage = Math.max(0, Math.min(MAX_STAGE, n));

    if (journeyWrap) {
      if (stage >= 6 && stage <= 8) {
        // Stages 6-8: float running, hover available
        if (!journeyWrap.classList.contains('journey-floating')) {
          void journeyWrap.offsetWidth;
          journeyWrap.classList.add('journey-floating');
        }
        journeyWrap.style.animationPlayState = 'running';
      } else if (prev <= 8 && stage >= 9) {
        // Entering stage 9: letters start dissolving — kill hover immediately
        journeyWrap.style.animationPlayState = 'paused';
        journeyWrap.classList.remove('journey-hovered');
        window._stardropBoost = 1;
      } else if (prev >= 9 && stage <= 8) {
        // Scrolling back from stage 9 → restore float
        journeyWrap.style.animationPlayState = 'running';
      }
    }

    document.body.dataset.stage = stage;
    if (window._setLetterStage) window._setLetterStage(stage);
    if (window._setProjectsStage) window._setProjectsStage(stage);
  }

  function step(dir) {
    if (!scrollEnabled) return;   // block scroll until page animations complete

    // Scroll UP while a project page is open → close it and return to roadmap
    if (window._pageOpen && dir === -1) {
      if (window._closeFCA) window._closeFCA();
      return;
    }
    if (window._pageOpen) return; // block all other scroll when a project page is open

    // Scroll DOWN on projects roadmap after all items have appeared → open FCA
    if (stage === 9 && dir === 1 && document.querySelector('.roadmap.roadmap-ready')) {
      if (window._openFCA) window._openFCA();
      return;
    }
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

  // Expose for external use (e.g. nav click)
  window._applyStage = applyStage;

  // Init
  applyStage(0);
})();

// Save current stage and open page before refresh/close
window.addEventListener('beforeunload', function () {
  var s = +document.body.dataset.stage;
  if (s > 0) sessionStorage.setItem('lastStage', s);
  else sessionStorage.removeItem('lastStage');

  if (window._pageOpen) sessionStorage.setItem('lastPage', 'fca');
  else sessionStorage.removeItem('lastPage');
});


/* ============================================
   PROJECTS ROADMAP
   ============================================ */
(function () {
  const section    = document.getElementById('projectsSection');
  const twWrap     = document.getElementById('roadmapTypewriter');
  const twLine1    = document.getElementById('twLine1');
  const twLine2    = document.getElementById('twLine2');
  if (!section) return;

  let activated      = false;
  let activateTimer  = null;
  let twTimer        = null;
  let twCharTimer    = null;
  let readyTimer     = null;

  const roadmap = section.querySelector('.roadmap');

  var TEXT1 = 'Welcome to a curated journey through my selected work across multiple collaborations.';
  var TEXT2 = "Here, you'll experience a full spectrum of visual solutions, formats, and creative disciplines.";
  var SPEED = 18; // ms per character

  function resetTypewriter() {
    clearTimeout(twTimer);
    clearTimeout(twCharTimer);
    if (!twWrap) return;
    twWrap.classList.remove('tw-visible');
    if (twLine1) twLine1.textContent = '';
    if (twLine2) twLine2.textContent = '';
    // Remove cursor if it exists
    var cur = twWrap.querySelector('.tw-cursor');
    if (cur) cur.remove();
  }

  function startTypewriter() {
    if (!twWrap || !twLine1 || !twLine2) return;

    // Create blinking cursor element
    var cursor = document.createElement('span');
    cursor.className = 'tw-cursor';

    twWrap.classList.add('tw-visible');
    twLine1.appendChild(cursor);

    var i = 0;

    function typeChar() {
      var allText = TEXT1 + '\n' + TEXT2;
      if (i < TEXT1.length) {
        twLine1.insertBefore(document.createTextNode(TEXT1[i]), cursor);
      } else if (i === TEXT1.length) {
        // Switch cursor to line 2
        twLine2.appendChild(cursor);
      } else {
        var idx = i - TEXT1.length - 1;
        twLine2.insertBefore(document.createTextNode(TEXT2[idx]), cursor);
      }
      i++;
      if (i < TEXT1.length + 1 + TEXT2.length) {
        twCharTimer = setTimeout(typeChar, SPEED);
      }
      // cursor stays blinking at the end
    }

    typeChar();
  }

  function activate(delay, onActive) {
    clearTimeout(activateTimer);
    activated = true;
    activateTimer = setTimeout(function () {
      document.fonts.ready.then(function () {
        section.classList.add('projects-active');
        if (onActive) onActive();
        // Last item stroke ends at ~4.3s (delay 3.70s + 0.6s duration); start at 4.5s
        twTimer = setTimeout(startTypewriter, 4500);
        // Scroll hint: cancel pending timer, schedule for content-ready + 3s
        // Last roadmap item fully drawn at ~4.3s from projects-active
        if (window._resetScrollHint) {
          window._resetScrollHint(4300 + 3000); // initial: 7.3s from now
          setTimeout(function () {
            // Content is now fully on screen — switch to 3s for scroll resets
            if (window._setScrollHintDelay) window._setScrollHintDelay(3000);
          }, 4300);
        }
        // Enable hover on roadmap items only after all animations finish (~4.3s)
        clearTimeout(readyTimer);
        readyTimer = setTimeout(function () {
          if (roadmap) roadmap.classList.add('roadmap-ready');
        }, 4300);
      });
    }, delay);
  }

  window._setProjectsStage = function (stage) {
    if (stage >= 9 && !activated) {
      activate(1500);
    } else if (stage < 9) {
      activated = false;
      clearTimeout(activateTimer);
      clearTimeout(readyTimer);
      if (roadmap) roadmap.classList.remove('roadmap-ready');
      section.classList.remove('projects-active');
      resetTypewriter();
      // Clean up click-exit class and nav-hide when scrolling back
      var jWrap = document.querySelector('.journey-title-wrap');
      if (jWrap) {
        jWrap.classList.remove('journey-click-exit');
        jWrap.style.visibility = '';
      }
    }
  };

  // Direct activation — called by click-to-skip, bypasses scroll delay
  window._activateProjectsDirect = function (delay, onActive) {
    activate(delay, onActive);
  };
})();

/* ============================================
   JOURNEY TITLE HOVER
   ============================================ */
(function () {
  const wrap = document.querySelector('.journey-title-wrap');
  if (!wrap) return;

  wrap.addEventListener('mouseenter', () => {
    if (wrap.classList.contains('journey-click-exit')) return;
    wrap.classList.add('journey-hovered');
    wrap.style.animationPlayState = 'paused';
    window._stardropBoost = 7;
  });

  wrap.addEventListener('mouseleave', () => {
    if (wrap.classList.contains('journey-click-exit')) return;
    wrap.classList.remove('journey-hovered');
    const s = +document.body.dataset.stage;
    if (s >= 6 && s <= 8) {
      wrap.style.animationPlayState = 'running';
    }
    window._stardropBoost = 1;
  });
})();

/* ============================================
   PROJECTS ROADMAP TITLE HOVER
   ============================================ */
(function () {
  const wrap = document.querySelector('.projects-title-wrap');
  if (!wrap) return;

  wrap.addEventListener('mouseenter', () => {
    wrap.classList.add('projects-title-hovered');
    window._stardropBoost = 7;
  });

  wrap.addEventListener('mouseleave', () => {
    wrap.classList.remove('projects-title-hovered');
    window._stardropBoost = 1;
  });
})();

/* ============================================
   FCA TITLE HOVER
   ============================================ */
(function () {
  const wrap = document.querySelector('.pp-title-wrap');
  if (!wrap) return;

  wrap.addEventListener('mouseenter', () => {
    wrap.classList.add('pp-title-hovered');
    window._stardropBoost = 7;
  });

  wrap.addEventListener('mouseleave', () => {
    wrap.classList.remove('pp-title-hovered');
    window._stardropBoost = 1;
  });
})();

/* ============================================
   JOURNEY TITLE — CLICK TO SKIP TO PROJECTS
   ============================================ */
(function () {
  const wrap = document.querySelector('.journey-title-wrap');
  if (!wrap) return;

  wrap.addEventListener('click', function () {
    var stage = +document.body.dataset.stage;
    // Only active when title is fully visible (stages 6-8)
    if (stage < 6 || stage > 8) return;
    // Prevent double-trigger
    if (wrap.classList.contains('journey-click-exit')) return;

    // Stop hover/float states
    wrap.classList.remove('journey-hovered');
    wrap.classList.remove('journey-floating');
    wrap.style.animationPlayState = 'paused';
    window._stardropBoost = 1;

    // Trigger futuristic exit flash animation
    wrap.classList.add('journey-click-exit');

    // Update body stage to 9 (hero/navbar already gone at 6+, this keeps CSS consistent)
    document.body.dataset.stage = '9';

    // Projects appear after 700ms — duration of the exit animation
    if (window._activateProjectsDirect) {
      window._activateProjectsDirect(700);
    }
  });
})();

/* ============================================
   NAV WORK LINK — JUMP TO PROJECTS ROADMAP
   ============================================ */
(function () {
  var workLink = document.querySelector('.nav-work');
  if (!workLink) return;

  workLink.addEventListener('click', function (e) {
    e.preventDefault();

    // Already showing projects — nothing to do
    var section = document.getElementById('projectsSection');
    if (section && section.classList.contains('projects-active')) return;

    // Instantly hide the journey title — no fade, no flash at all
    var jWrap = document.querySelector('.journey-title-wrap');
    if (jWrap) {
      jWrap.style.visibility = 'hidden';
      jWrap.classList.remove('journey-hovered');
      jWrap.classList.remove('journey-floating');
      jWrap.style.animationPlayState = 'paused';
      window._stardropBoost = 1;
    }

    // Fast-forward all stage CSS transitions
    document.body.classList.add('scroll-fast');

    // Jump stage machinery to 9 (hero + navbar gone)
    if (window._applyStage) window._applyStage(9);

    // Projects appear after a brief pause
    if (window._activateProjectsDirect) window._activateProjectsDirect(600);

    // Remove fast mode after transitions settle
    setTimeout(function () {
      document.body.classList.remove('scroll-fast');
    }, 400);
  });
})();

/* ============================================
   CUSTOM CURSOR
   ============================================ */
(function () {
  const cursor = document.getElementById('custom-cursor');
  const cursorImg = document.getElementById('cursor-img');
  if (!cursor || !cursorImg) return;

  const SRC_DEFAULT = 'assets/Cursor.svg';
  const SRC_HOVER   = 'assets/Hover cursor.svg';
  let currentHover = false;

  function isHoverable(el) {
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      if (!node.tagName) { node = node.parentElement; continue; }
      const tag = node.tagName.toLowerCase();
      if (tag === 'a' || tag === 'button') return true;
      if (node.getAttribute && node.getAttribute('role') === 'button') return true;
      const cl = node.classList;
      if (cl) {
        if (
          cl.contains('nav-logo') ||
          cl.contains('nav-logo-wrap') ||
          cl.contains('nav-link') ||
          cl.contains('avatar-wrapper') ||
          cl.contains('journey-title-wrap') ||
          cl.contains('roadmap-item-link') ||
          cl.contains('pp-back')
        ) return true;
        // Info panels only hoverable after stroke animation completes
        if (cl.contains('info-panel-wrap')) {
          return cl.contains('ip-interactive');
        }
      }
      node = node.parentElement;
    }
    return false;
  }

  document.addEventListener('mousemove', (e) => {
    const x = e.clientX;
    const y = e.clientY;
    cursor.style.transform = `translate(${x - 36}px, ${y - 33}px)`;

    // Use elementFromPoint for reliable hit detection (ignores pointer-events:none elements)
    const el = document.elementFromPoint(x, y);
    const hover = isHoverable(el);
    if (hover !== currentHover) {
      currentHover = hover;
      cursorImg.src = hover ? SRC_HOVER : SRC_DEFAULT;
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    cursor.style.transform = 'translate(-200px, -200px)';
  });
})();

/* ============================================
   JOURNEY TITLE — LETTER BY LETTER DISSOLVE
   ============================================ */
(function () {
  const titleEl = document.querySelector('.journey-title');
  if (!titleEl) return;

  // Split into individual letter spans
  const text = titleEl.textContent.trim();
  titleEl.innerHTML = text.split('').map((ch, i) =>
    `<span class="jt-letter" data-i="${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`
  ).join('');

  const letters = Array.from(titleEl.querySelectorAll('.jt-letter'));
  const N = letters.length;

  // Randomised batches — generated fresh each time stage 9 is first entered
  let batches = null; // [ [indices...], [indices...], [indices...] ]

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildBatches() {
    const order = shuffle(Array.from({ length: N }, (_, i) => i));
    const third = Math.ceil(N / 3);
    batches = [
      order.slice(0, third),
      order.slice(third, third * 2),
      order.slice(third * 2)
    ];
  }

  function applyBatch(batchIdx, gone) {
    const batch = batches[batchIdx];
    batch.forEach((letterIdx, pos) => {
      const letter = letters[letterIdx];
      if (gone) {
        letter.style.transitionDelay = (pos * 55) + 'ms';
        letter.classList.add('jt-gone');
      } else {
        letter.style.transitionDelay = '0ms';
        letter.classList.remove('jt-gone');
      }
    });
  }

  window._setLetterStage = function (stage) {
    // Build randomised order on first entry to stage 9
    if (stage >= 9 && !batches) buildBatches();
    // Reset if scrolled back
    if (stage < 9 && batches) batches = null;

    if (!batches) {
      // Stages 6-8: all letters visible
      letters.forEach(l => { l.style.transitionDelay = '0ms'; l.classList.remove('jt-gone'); });
      return;
    }

    // Stage 9: all letters dissolve in one go, staggered in random order
    const allOrdered = [...batches[0], ...batches[1], ...batches[2]];
    allOrdered.forEach((letterIdx, pos) => {
      const letter = letters[letterIdx];
      if (!letter.classList.contains('jt-gone')) {
        letter.style.transitionDelay = (pos * 55) + 'ms';
        letter.classList.add('jt-gone');
      }
    });
  };
})();

/* ============================================
   FACULTY OF CONTEMPORARY ARTS PAGE
   ============================================ */
(function () {
  var item1    = document.getElementById('rmItem1');
  var fcaPage  = document.getElementById('fcaPage');
  var fcaBack  = document.getElementById('fcaBack');
  var projects = document.getElementById('projectsSection');
  if (!item1 || !fcaPage) return;

  var twWrap  = document.getElementById('fcaTypewriter');
  var twLine1 = document.getElementById('fcaTwLine1');
  var twLine2 = document.getElementById('fcaTwLine2');

  var TW_TEXT1 = "For the past year and a half, I\u2019ve been creating visual solutions for campaigns, social media, billboard displays, and exhibition posters for the Faculty of Contemporary Arts \u2014";
  var TW_TEXT2 = "shaping each piece to reflect its artistic identity through design, motion, and visual storytelling.";
  var TW_SPEED = 11;

  var twTimer     = null;
  var twCharTimer = null;

  function resetTypewriter() {
    clearTimeout(twTimer);
    clearTimeout(twCharTimer);
    if (!twWrap) return;
    twWrap.classList.remove('tw-visible');
    if (twLine1) twLine1.textContent = '';
    if (twLine2) twLine2.textContent = '';
    var cur = twWrap.querySelector('.tw-cursor');
    if (cur) cur.remove();
  }

  function startTypewriter() {
    if (!twWrap || !twLine1 || !twLine2) return;
    var cursor = document.createElement('span');
    cursor.className = 'tw-cursor';
    twWrap.classList.add('tw-visible');
    twLine1.appendChild(cursor);
    var i = 0;
    function typeChar() {
      if (i < TW_TEXT1.length) {
        twLine1.insertBefore(document.createTextNode(TW_TEXT1[i]), cursor);
      } else if (i === TW_TEXT1.length) {
        twLine2.appendChild(cursor);
      } else {
        var idx = i - TW_TEXT1.length - 1;
        twLine2.insertBefore(document.createTextNode(TW_TEXT2[idx]), cursor);
      }
      i++;
      if (i < TW_TEXT1.length + 1 + TW_TEXT2.length) {
        twCharTimer = setTimeout(typeChar, TW_SPEED);
      }
    }
    typeChar();
  }

  function openFCA() {
    window._pageOpen = true;
    fcaPage.classList.add('pp-active');
    if (projects) projects.style.opacity = '0';
    startTypewriter();
  }

  function closeFCA() {
    window._pageOpen = false;
    fcaPage.classList.remove('pp-active');
    if (projects) projects.style.opacity = '1';
    resetTypewriter();
  }

  item1.addEventListener('click', function () {
    // Only clickable after roadmap has appeared (item 1 is visible)
    if (!projects || !projects.classList.contains('projects-active')) return;
    openFCA();
  });

  if (fcaBack) {
    fcaBack.addEventListener('click', closeFCA);
  }

  // ESC key also closes
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && window._pageOpen) closeFCA();
  });

  // Expose for scroll navigation
  window._openFCA  = openFCA;
  window._closeFCA = closeFCA;
})();


/* ============================================
   STAGE RESTORE ON REFRESH
   ============================================ */
(function () {
  var saved = parseInt(sessionStorage.getItem('lastStage'), 10);
  if (!saved || saved <= 0) return;

  // Suppress CSS transitions so elements snap to restored state instantly
  document.body.classList.add('stage-restore');

  // Apply the saved stage — triggers all stage handlers (_setLetterStage, _setProjectsStage, etc.)
  if (window._applyStage) window._applyStage(saved);

  // For stage 9 (projects roadmap): bypass the 1500ms activation delay
  if (saved >= 9 && window._activateProjectsDirect) {
    var lastPage = sessionStorage.getItem('lastPage');
    var onActive = (lastPage === 'fca' && window._openFCA)
      ? function () { window._openFCA(); }
      : null;
    window._activateProjectsDirect(100, onActive);
  }

  // Re-enable transitions after two frames (elements have snapped into place)
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.body.classList.remove('stage-restore');
    });
  });

  // Restored page: enable scroll quickly (no hint — user is past the hero)
  setTimeout(function () {
    if (window._enableScroll) window._enableScroll();
  }, 300);
})();

/* ============================================
   PAGE READY — enable scroll after hero animations complete
   ============================================ */
(function () {
  var saved = parseInt(sessionStorage.getItem('lastStage'), 10);
  if (saved > 0) return; // restored pages handled above

  // Hero animations finish at ~1.65s; wait 1800ms to be safe
  setTimeout(function () {
    if (window._enableScroll)    window._enableScroll();
    if (window._startScrollHint) window._startScrollHint();
  }, 1800);
})();
