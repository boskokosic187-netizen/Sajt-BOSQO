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

    // Scroll UP while lightbox is open → close lightbox first
    if (window._lbOpen && dir === -1) {
      if (window._closeLightbox) window._closeLightbox();
      return;
    }

    // Scroll UP while a project page is open
    if (window._pageOpen && dir === -1) {
      var isFCA = window._activePage === 'fca';
      var isITS = window._activePage === 'its';
      if (isFCA) {
        if (window._galleryTransitioning) return; // don't interrupt transitions
        if (window._galleryPage > 0) {
          // On gallery 2 or 3 → go back one step
          if (window._fcaPrevGallery) window._fcaPrevGallery();
        } else {
          // On gallery 1 → close FCA and return to roadmap
          if (window._closeFCA) window._closeFCA();
        }
      } else if (isITS) {
        if (window._itsGalleryTransitioning) return;
        if (window._itsGalleryPage > 0) {
          if (window._itsPrevGallery) window._itsPrevGallery();
        } else {
          if (window._closeITS) window._closeITS();
        }
      } else if (window._activePage === 'ballies') {
        if (window._balliesPage > 0) {
          if (window._balliesPrevPage) window._balliesPrevPage();
        } else {
          if (window._closeBallies) window._closeBallies();
        }
      } else if (window._activePage === 'wsg') {
        if (window._closeWSG) window._closeWSG();
      } else {
        // Any other project page — just close it
        if (window._closeActivePage) window._closeActivePage();
      }
      return;
    }

    // Scroll DOWN while FCA is open and more galleries remain → advance
    if (window._pageOpen && window._activePage === 'fca' && dir === 1 && window._galleryPage < (window._galleryTotal || 1) - 1) {
      if (!window._galleryTransitioning && window._fcaNextGallery) window._fcaNextGallery();
      return;
    }

    // Scroll DOWN while ITS is open and more galleries remain → advance
    if (window._pageOpen && window._activePage === 'its' && dir === 1 && window._itsGalleryPage < (window._itsGalleryTotal || 1) - 1) {
      if (!window._itsGalleryTransitioning && window._itsNextGallery) window._itsNextGallery();
      return;
    }

    // Scroll DOWN while Ballies is open and more pages remain → advance
    if (window._pageOpen && window._activePage === 'ballies' && dir === 1 && window._balliesPage < (window._balliesTotal || 1) - 1) {
      if (window._balliesNextPage) window._balliesNextPage();
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

  if (window._pageOpen && window._activePage) sessionStorage.setItem('lastPage', window._activePage);
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
  let itemTimers     = [];

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
        // Enable pointer-events per item as soon as each one finishes appearing
        itemTimers.forEach(clearTimeout);
        itemTimers = [];
        var rmItems = roadmap ? roadmap.querySelectorAll('.roadmap-item') : [];
        var appearDelays = [0.3, 1.1, 1.9, 2.7, 3.5];
        for (var i = 0; i < rmItems.length; i++) {
          (function (el, delay) {
            itemTimers.push(setTimeout(function () {
              el.style.pointerEvents = 'auto';
            }, (delay + 0.4) * 1000));
          })(rmItems[i], appearDelays[i] !== undefined ? appearDelays[i] : 3.5);
        }
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
      itemTimers.forEach(clearTimeout);
      itemTimers = [];
      if (roadmap) {
        roadmap.classList.remove('roadmap-ready');
        roadmap.querySelectorAll('.roadmap-item').forEach(function (el) {
          el.style.pointerEvents = '';
        });
      }
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
   PROJECT PAGE TITLE HOVER (all pages)
   ============================================ */
(function () {
  var wraps = document.querySelectorAll('.pp-title-wrap');
  wraps.forEach(function (wrap) {
    wrap.addEventListener('mouseenter', function () {
      wrap.classList.add('pp-title-hovered');
      window._stardropBoost = 7;
    });
    wrap.addEventListener('mouseleave', function () {
      wrap.classList.remove('pp-title-hovered');
      window._stardropBoost = 1;
    });
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

    // Freeze current float position so removing journey-floating doesn't snap to origin
    var currentTransform = getComputedStyle(wrap).transform;
    if (currentTransform && currentTransform !== 'none') {
      wrap.style.transform = currentTransform;
    }

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
    if (window._activateProjectsDirect) window._activateProjectsDirect(100);

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
    window._activePage = 'fca';
    window._closeActivePage = closeFCA;
    fcaPage.classList.add('pp-active');
    if (projects) projects.style.opacity = '0';
    startTypewriter();
  }

  function closeFCA() {
    window._pageOpen = false;
    window._activePage = null;
    window._closeActivePage = null;
    fcaPage.classList.remove('pp-active');
    if (projects) projects.style.opacity = '1';
    resetTypewriter();
    if (window._closeLightbox) window._closeLightbox();
    if (window._resetGalleryPage) window._resetGalleryPage();
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
    if (e.key === 'Escape' && window._pageOpen && fcaPage.classList.contains('pp-active')) closeFCA();
  });

  // Expose for scroll navigation
  window._openFCA  = openFCA;
  window._closeFCA = closeFCA;
})();

/* ============================================
   INFORMATION TECHNOLOGY SCHOOL PAGE
   ============================================ */
(function () {
  var item2    = document.getElementById('rmItem2');
  var itsPage  = document.getElementById('itsPage');
  var itsBack  = document.getElementById('itsBack');
  var projects = document.getElementById('projectsSection');
  if (!item2 || !itsPage) return;

  var twWrap  = document.getElementById('itsTypewriter');
  var twLine1 = document.getElementById('itsTwLine1');
  var twLine2 = document.getElementById('itsTwLine2');

  var TW_TEXT1 = "For the Information Technology School, I\u2019ve been developing visual content including billboard campaigns, animations, and digital banners \u2014 while also contributing as a Teaching Assistant,";
  var TW_TEXT2 = "combining practical design work with academic involvement. Many of these visuals have been featured across Belgrade on both traditional and digital billboards.";
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

  function openITS() {
    window._pageOpen = true;
    window._activePage = 'its';
    window._closeActivePage = closeITS;
    itsPage.classList.add('pp-active');
    if (projects) projects.style.opacity = '0';
    startTypewriter();
  }

  function closeITS() {
    window._pageOpen = false;
    window._activePage = null;
    window._closeActivePage = null;
    itsPage.classList.remove('pp-active');
    if (projects) projects.style.opacity = '1';
    resetTypewriter();
    if (window._resetItsGalleryPage) window._resetItsGalleryPage();
  }

  item2.addEventListener('click', function () {
    if (!projects || !projects.classList.contains('projects-active')) return;
    openITS();
  });

  if (itsBack) {
    itsBack.addEventListener('click', closeITS);
  }

  // ESC key also closes
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && window._pageOpen && itsPage.classList.contains('pp-active')) closeITS();
  });

  // Expose for potential scroll navigation
  window._openITS  = openITS;
  window._closeITS = closeITS;
})();

/* ============================================
   BALLIES NFT PAGE
   ============================================ */
(function () {
  var item3       = document.getElementById('rmItem3');
  var balliesPage = document.getElementById('balliesPage');
  var balliesBack = document.getElementById('balliesBack');
  var projects    = document.getElementById('projectsSection');
  if (!item3 || !balliesPage) return;

  var twWrap  = document.getElementById('balliesTypewriter');
  var twLine1 = document.getElementById('balliesTwLine1');
  var twLine2 = document.getElementById('balliesTwLine2');

  var TW_TEXT1 = "From January 2023 to January 2026, I collaborated with Ballies, working across a wide range of Web3-focused projects \u2014 including NFT collections, airdrop campaigns, token design, and full-scale visual campaigns.";
  var TW_TEXT2 = "I was also responsible for creating animated video ads, investor decks, and delivering a complete branding package. Throughout this experience, I developed a strong understanding of crypto, NFTs, and Web3 gaming ecosystems.";
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
        twLine2.insertBefore(document.createTextNode(TW_TEXT2[i - TW_TEXT1.length - 1]), cursor);
      }
      i++;
      if (i < TW_TEXT1.length + 1 + TW_TEXT2.length) {
        twCharTimer = setTimeout(typeChar, TW_SPEED);
      }
    }
    typeChar();
  }

  /* ---- Slideshow ---- */
  var slideshow  = document.getElementById('balliesSlideshow');
  var statsBar   = document.getElementById('balliesStatsBar');
  var track1     = document.getElementById('balliesTrack1');
  var track2     = document.getElementById('balliesTrack2');

  (function buildSlideshow() {
    if (!track1 || !track2) return;
    var html = '';
    for (var rep = 0; rep < 2; rep++) {
      for (var i = 1; i <= 20; i++) {
        var num = String(i).padStart(3, '0');
        html += '<div class="ballies-nft-card">'
              +   '<div class="ballies-nft-inner">'
              +     '<img src="assets/ballies/1/' + i + '.png" alt="Ballies #' + num + '" draggable="false">'
              +   '</div>'
              +   '<div class="ballies-nft-num">#' + num + '</div>'
              + '</div>';
      }
    }
    track1.innerHTML = html;
    track2.innerHTML = html;
  })();

  /* Hover: scale up hovered card, slow others 60% */
  if (slideshow) {
    slideshow.addEventListener('mouseover', function (e) {
      var card = e.target.closest('.ballies-nft-card');
      if (!card) return;
      card.classList.add('ballies-card-hovered');
      [track1, track2].forEach(function (t) {
        if (!t) return;
        t.getAnimations().forEach(function (a) { a.playbackRate = 0.4; });
      });
    });
    slideshow.addEventListener('mouseout', function (e) {
      var card = e.target.closest('.ballies-nft-card');
      if (!card) return;
      if (card.contains(e.relatedTarget)) return;
      card.classList.remove('ballies-card-hovered');
      if (!slideshow.querySelector('.ballies-card-hovered')) {
        [track1, track2].forEach(function (t) {
          if (!t) return;
          t.getAnimations().forEach(function (a) { a.playbackRate = 1; });
        });
      }
    });

    /* Click: open lightbox */
    slideshow.addEventListener('click', function (e) {
      var card = e.target.closest('.ballies-nft-card');
      if (!card) return;
      var img = card.querySelector('img');
      var num = card.querySelector('.ballies-nft-num');
      if (!img || !window._openLightboxWithSrc) return;
      window._openLightboxWithSrc(img.src, img.alt, num ? num.textContent : '');
    });
  }

  /* ---- Mosaic (page 2) ---- */
  var mosaic      = document.getElementById('balliesMosaic');
  var mosaicOuter = document.getElementById('balliesMosaicOuter');
  var mosaicWrap  = document.getElementById('balliesMosaicWrap');
  var sbThumb     = document.getElementById('balliesSbThumb');
  var dots        = document.querySelectorAll('.ballies-dot');
  var balliesPage2 = 1; // current page (1-indexed)

  (function buildMosaic() {
    if (!mosaic) return;
    var files = [
      '1.png','1_1.png','1_1%20(1).png','2-Jun.png','4-Aug.png','4-Aug-(1).png',
      '5-Sept-(1).png','11-July.png','16-July.png','16-May.png','18-2.png','19-2.png',
      '19-11.png','20-2-(2).png','21-2.png','22-July.png','23-June.png',
      '26-June.png','26-sept.png','29-July.png','31-July-(2).png','ALPHABOT.png','Airdrop.jpg',
      'Ai-ambassadors-assemble.png','Ai-ballies-promo-2.png','Ai-game-predictor.png','BALL-ETH.png',
      'Ballies-Is-Not-a-Bookmaker.png','Ballies-santa.png','Big-announcement.png',
      'CLX.png','CLX-Launch.png','Christmas-post%20(1).png','Friday%20(1).png',
      'Fusion.png','Halloween-badge.png','How-ballies-works.png','Hustler-League-post.png',
      'Join-AI-testing.png','Join-or-Win.png','King-of-the-metacourt.png',
      'Knockout-stage-begins.png','Monday.png','November-winner-recap.png',
      'Rewards-discord.png','Roadmap.png','Season-10-pass.png','Season-11.png',
      'Season-12.png','Soon.png','Thursday.png','brown-vs-gravity.png',
      'defi-rewarded.png','h2h.png'
    ];
    var html = '';
    files.forEach(function (f) {
      var alt = decodeURIComponent(f).replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      html += '<div class="ballies-m-item">'
            +   '<img src="assets/BALLIES/2/' + f + '" alt="' + alt + '" draggable="false">'
            + '</div>';
    });
    mosaic.innerHTML = html;
  })();

  /* Mosaic lightbox click */
  if (mosaic) {
    mosaic.addEventListener('click', function (e) {
      var item = e.target.closest('.ballies-m-item');
      if (!item || !window._openLightboxWithSrc) return;
      var img = item.querySelector('img');
      if (img) window._openLightboxWithSrc(img.src, img.alt, '');
    });
  }

  /* Scrollbar update */
  function updateScrollbar() {
    if (!mosaicWrap || !sbThumb) return;
    var total   = mosaicWrap.scrollHeight;
    var visible = mosaicWrap.clientHeight;
    var scrollTop = mosaicWrap.scrollTop;
    var thumbH  = Math.max(32, (visible / total) * visible);
    var maxScroll = total - visible;
    var thumbTop  = maxScroll > 0 ? (scrollTop / maxScroll) * (visible - thumbH) : 0;
    sbThumb.style.height = thumbH + 'px';
    sbThumb.style.top    = thumbTop + 'px';
  }

  /* Wheel scroll on mosaic — intercept so global handler doesn't fire */
  if (mosaicWrap) {
    mosaicWrap.addEventListener('wheel', function (e) {
      e.preventDefault();
      e.stopPropagation();
      mosaicWrap.scrollTop += e.deltaY;
      updateScrollbar();
    }, { passive: false });

    mosaicWrap.addEventListener('scroll', updateScrollbar);
  }

  /* Scrollbar thumb drag */
  if (sbThumb && mosaicWrap) {
    var sbDragging = false, sbDragY = 0, sbDragScroll = 0;
    sbThumb.addEventListener('mousedown', function (e) {
      sbDragging = true;
      sbDragY = e.clientY;
      sbDragScroll = mosaicWrap.scrollTop;
      sbThumb.classList.add('dragging');
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!sbDragging) return;
      var total   = mosaicWrap.scrollHeight;
      var visible = mosaicWrap.clientHeight;
      var thumbH  = parseFloat(sbThumb.style.height) || 32;
      var ratio   = (total - visible) / (visible - thumbH);
      mosaicWrap.scrollTop = sbDragScroll + (e.clientY - sbDragY) * ratio;
      updateScrollbar();
    });
    document.addEventListener('mouseup', function () {
      if (sbDragging) { sbDragging = false; sbThumb.classList.remove('dragging'); }
    });
  }

  // ----- Page 3: videos -----
  var videosOuter = document.getElementById('balliesVideosOuter');
  var videos      = document.getElementById('balliesVideos');
  var videoIds = [
    'CE-44C_QXns',
    '2AqRYyx5Uh0',
    'jraUoHMntgs',
    'oVEncTo2-Ss',
    '44eBTPPPt3w',
    'jYv-1Z7NDwA',
    'hw0DGKc1ly8',
    'IC6DA1O0cOw',
    'eO21hYul13E'
  ];

  function hoverPlayParams(id) {
    return 'https://www.youtube.com/embed/' + id +
      '?autoplay=1&mute=1&loop=1&playlist=' + id +
      '&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3' +
      '&playsinline=1&disablekb=1&fs=0&cc_load_policy=0';
  }

  function featuredPlayParams(id) {
    // No loop so the video ends naturally; enablejsapi so we get postMessage state events
    return 'https://www.youtube.com/embed/' + id +
      '?autoplay=1&mute=1&enablejsapi=1' +
      '&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3' +
      '&playsinline=1&disablekb=1&fs=0&cc_load_policy=0';
  }

  function lightboxParams(id) {
    return 'https://www.youtube.com/embed/' + id +
      '?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1';
  }

  // ----- Idle auto-feature -----
  var FEATURED_DUR = 18000; // ms each video stays featured (2 s shrink + next)

  var videoIdleTimer         = null;
  var videoHoverCount        = 0;
  var videoFeaturedEl        = null;
  var videoFeaturedPlayTimer = null;
  var videoFeaturedShrinkTimer = null; // fires 2 s before end → shrink
  var videoFeaturedNextTimer   = null; // fires at end → next video immediately

  function clearFeatured() {
    clearTimeout(videoFeaturedPlayTimer);
    clearTimeout(videoFeaturedShrinkTimer);
    clearTimeout(videoFeaturedNextTimer);
    if (videoFeaturedEl) {
      var f = videoFeaturedEl.querySelector('.ballies-v-frame');
      if (f) f.innerHTML = '';
      videoFeaturedEl.classList.remove('playing', 'ballies-v-featured');
      videoFeaturedEl = null;
    }
    if (videos) videos.classList.remove('has-featured');
  }

  function triggerFeatured(excludeIdx) {
    if (!videos) return;
    clearFeatured();
    var items = videos.querySelectorAll('.ballies-v-item');
    var indices = [];
    items.forEach(function (_, i) { if (i !== excludeIdx) indices.push(i); });
    var idx = indices[Math.floor(Math.random() * indices.length)];
    videoFeaturedEl = items[idx];
    var featId = videoFeaturedEl.getAttribute('data-vid');
    videos.classList.add('has-featured');
    videoFeaturedEl.classList.add('ballies-v-featured');
    var frame = videoFeaturedEl.querySelector('.ballies-v-frame');
    if (frame) {
      frame.innerHTML = '';
      var iframe = document.createElement('iframe');
      iframe.src = featuredPlayParams(featId);
      iframe.setAttribute('allow', 'autoplay; encrypted-media');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('frameborder', '0');
      frame.appendChild(iframe);
      videoFeaturedPlayTimer = setTimeout(function () {
        if (videoFeaturedEl) videoFeaturedEl.classList.add('playing');
      }, 900);
    }
    var capturedEl = videoFeaturedEl;
    // 0.5 s before end: shrink back to normal (CSS transition handles it)
    videoFeaturedShrinkTimer = setTimeout(function () {
      if (videoFeaturedEl !== capturedEl) return;
      capturedEl.classList.remove('ballies-v-featured');
      videos.classList.remove('has-featured');
    }, FEATURED_DUR - 500);
    // At end: immediately start next video
    videoFeaturedNextTimer = setTimeout(function () {
      if (!capturedEl) return;
      var pi = parseInt(capturedEl.getAttribute('data-index'), 10);
      clearFeatured();
      if (videoHoverCount === 0) triggerFeatured(pi);
    }, FEATURED_DUR);
  }

  function resetIdleTimer() {
    clearTimeout(videoIdleTimer);
    videoIdleTimer = setTimeout(triggerFeatured, 3000);
  }

  function startIdleTimer() {
    clearFeatured();
    resetIdleTimer();
  }

  function stopIdleTimer() {
    clearTimeout(videoIdleTimer);
    videoHoverCount = 0;
    clearFeatured();
  }

  (function buildVideos() {
    if (!videos) return;
    videos.innerHTML = '';
    videoIds.forEach(function (id, idx) {
      var item = document.createElement('div');
      item.className = 'ballies-v-item';
      item.setAttribute('data-vid', id);
      item.setAttribute('data-index', idx);

      var thumb = document.createElement('img');
      thumb.className = 'ballies-v-thumb';
      thumb.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
      thumb.alt = 'Video ' + (idx + 1);
      thumb.loading = 'lazy';

      var veil = document.createElement('div');
      veil.className = 'ballies-v-veil';

      var frame = document.createElement('div');
      frame.className = 'ballies-v-frame';

      var play = document.createElement('div');
      play.className = 'ballies-v-play';

      item.appendChild(thumb);
      item.appendChild(frame);
      item.appendChild(veil);
      item.appendChild(play);
      videos.appendChild(item);

      var hoverTimer = null;

      item.addEventListener('mouseenter', function () {
        videoHoverCount++;
        clearFeatured();
        clearTimeout(videoIdleTimer); // pause timer while any item is hovered
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(function () {
          if (frame.querySelector('iframe')) return;
          var iframe = document.createElement('iframe');
          iframe.src = hoverPlayParams(id);
          iframe.setAttribute('allow', 'autoplay; encrypted-media');
          iframe.setAttribute('allowfullscreen', '');
          iframe.setAttribute('frameborder', '0');
          frame.appendChild(iframe);
          hoverTimer = setTimeout(function () {
            if (frame.querySelector('iframe')) item.classList.add('playing');
          }, 900);
        }, 160);
      });

      item.addEventListener('mouseleave', function () {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
        frame.innerHTML = '';
        item.classList.remove('playing');
        videoHoverCount = Math.max(0, videoHoverCount - 1);
        if (videoHoverCount === 0) resetIdleTimer(); // restart only when all items unhovered
      });

      item.addEventListener('click', function () {
        clearTimeout(videoIdleTimer);
        clearFeatured();
        openVideoLb(id);
      });
    });
  })();

  function stopAllVideos() {
    if (!videos) return;
    stopIdleTimer();
    videos.querySelectorAll('.ballies-v-item').forEach(function (it) {
      var f = it.querySelector('.ballies-v-frame');
      if (f) f.innerHTML = '';
      it.classList.remove('playing', 'ballies-v-featured');
    });
    if (videos) videos.classList.remove('has-featured');
  }

  // ----- Page 4: editorial gallery -----
  var galleryOuter = document.getElementById('balliesGalleryOuter');
  var galleryWrap  = document.getElementById('balliesGalleryWrap');
  var galleryEl    = document.getElementById('balliesGallery');
  var gSbThumb     = document.getElementById('balliesGSbThumb');

  // Layout: rows sized to content via aspect-ratio; ultra-wide banners span 3 cols
  var galleryItems = [
    { file: 'all-stars-banner-1920-1080.jpg', span: 2, ar: '1920/1080' }, // row1: landscape
    { file: 'kobe.png',                        span: 1, ar: '1082/1325' }, // row1: portrait
    { file: 'badge-pack.png',                   span: 1, ar: '1392/2024' }, // row2: portrait × 3
    { file: 'Drop-card.png',                    span: 1, ar: '967/1386'  },
    { file: '5-Nov-DRJ.png',                    span: 1, ar: '1080/1308', deco: true },
    { file: 'NFL-Games.png',                    span: 1, ar: '1/1'       }, // row3: squares × 3
    { file: 'Ball-post-4.png',                  span: 1, ar: '1/1'       },
    { file: 'You-vs-Ai.png',                    span: 1, ar: '1/1'       },
    { file: 'starter-pack-banner.png',          span: 3, ar: '2018/451'  }, // row4: full-width ultra-wide
    { file: 'drop-page.png',                    span: 2, ar: '1440/810'  }, // row5: landscape + portrait
    { file: '2000_vince_carter.png',            span: 1, ar: '1080/1252' },
    { file: '1360x680.png',                     span: 2, ar: '1360/680'  }, // row6: 2:1 + square
    { file: '4.png',                            span: 1, ar: '1/1'       },
    { file: 'Banner 2.png',                     span: 3, ar: '1500/500'  }, // row7: full-width wide
    { file: '1000$.png',                        span: 1, ar: '1/1'       }, // row8: 3 squares
    { file: '1 (1).png',                        span: 1, ar: '1/1'       },
    { file: 'edelman-vs-gravity.png',           span: 1, ar: '1088/1080' },
  ];

  (function buildGallery() {
    if (!galleryEl) return;
    galleryEl.innerHTML = '';
    galleryItems.forEach(function (item, idx) {
      var el = document.createElement('div');
      el.className = 'ballies-g-item';
      if (item.span > 1) el.setAttribute('data-span', String(item.span));
      if (item.ar) el.style.aspectRatio = item.ar;
      el.setAttribute('data-index', idx);

      var img = document.createElement('img');
      img.className = 'ballies-g-img';
      img.src = 'assets/BALLIES/4/' + item.file;
      img.alt = item.file.replace(/\.[^.]+$/, '');
      img.loading = 'lazy';
      img.draggable = false;

      el.appendChild(img);
      galleryEl.appendChild(el);

      el.addEventListener('click', function () {
        if (window._openLightboxWithSrc) {
          window._openLightboxWithSrc(img.src, img.alt, '');
        }
      });
    });
  })();

  function updateGalleryScrollbar() {
    if (!galleryWrap || !gSbThumb) return;
    var total    = galleryWrap.scrollHeight;
    var visible  = galleryWrap.clientHeight;
    var scrollTop = galleryWrap.scrollTop;
    if (total <= visible) { gSbThumb.style.height = '100%'; gSbThumb.style.top = '0px'; return; }
    var thumbH   = Math.max(32, Math.round((visible / total) * visible));
    var thumbTop = Math.round((scrollTop / (total - visible)) * (visible - thumbH));
    gSbThumb.style.height = thumbH + 'px';
    gSbThumb.style.top    = thumbTop + 'px';
  }

  if (galleryWrap) {
    galleryWrap.addEventListener('wheel', function (e) {
      e.preventDefault();
      e.stopPropagation();
      galleryWrap.scrollTop += e.deltaY;
    }, { passive: false });
    galleryWrap.addEventListener('scroll', updateGalleryScrollbar);
  }

  var gDragging = false;
  var gDragY = 0;
  var gDragScroll = 0;
  if (gSbThumb && galleryWrap) {
    gSbThumb.addEventListener('mousedown', function (e) {
      gDragging = true;
      gDragY = e.clientY;
      gDragScroll = galleryWrap.scrollTop;
      gSbThumb.classList.add('dragging');
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!gDragging) return;
      var total   = galleryWrap.scrollHeight;
      var visible = galleryWrap.clientHeight;
      var thumbH  = parseFloat(gSbThumb.style.height) || 32;
      var ratio   = (total - visible) / (visible - thumbH);
      galleryWrap.scrollTop = gDragScroll + (e.clientY - gDragY) * ratio;
    });
    document.addEventListener('mouseup', function () {
      if (gDragging) { gDragging = false; gSbThumb.classList.remove('dragging'); }
    });
  }

  function goToPage(p) {
    if (balliesPage2 === p) return;
    var prev = balliesPage2;
    balliesPage2 = p;
    window._balliesPage = p - 1;
    dots.forEach(function (d, i) { d.classList.toggle('ballies-dot--active', i + 1 === p); });

    function hideSlideshow() {
      if (slideshow) slideshow.style.display = 'none';
      setSlideshowState(false);
    }
    function showSlideshow() {
      if (slideshow) {
        slideshow.style.display = '';
        slideshow.classList.remove('ballies-entering');
        requestAnimationFrame(function () {
          slideshow.classList.add('ballies-entering');
          setTimeout(function () { slideshow.classList.remove('ballies-entering'); }, 1100);
        });
      }
      setSlideshowState(true);
    }
    function hideMosaicInstant() {
      if (mosaicOuter) mosaicOuter.classList.remove('ballies-mosaic-active', 'ballies-mosaic-exiting');
      if (mosaicWrap) mosaicWrap.scrollTop = 0;
    }
    function hideMosaicAnimated(cb) {
      if (!mosaicOuter || !mosaicOuter.classList.contains('ballies-mosaic-active')) { if (cb) cb(); return; }
      mosaicOuter.classList.add('ballies-mosaic-exiting');
      setTimeout(function () {
        mosaicOuter.classList.remove('ballies-mosaic-active', 'ballies-mosaic-exiting');
        if (mosaicWrap) mosaicWrap.scrollTop = 0;
        if (cb) cb();
      }, 520);
    }
    function showMosaic() {
      if (mosaicWrap) mosaicWrap.scrollTop = 0;
      if (mosaicOuter) mosaicOuter.classList.add('ballies-mosaic-active');
      setTimeout(updateScrollbar, 50);
    }
    function hideVideosInstant() {
      stopAllVideos();
      if (videosOuter) videosOuter.classList.remove('ballies-videos-active', 'ballies-videos-exiting');
    }
    function hideVideosAnimated(cb) {
      if (!videosOuter || !videosOuter.classList.contains('ballies-videos-active')) { if (cb) cb(); return; }
      videosOuter.classList.add('ballies-videos-exiting');
      setTimeout(function () {
        stopAllVideos();
        videosOuter.classList.remove('ballies-videos-active', 'ballies-videos-exiting');
        if (cb) cb();
      }, 520);
    }
    function showVideos() {
      if (videosOuter) {
        videosOuter.classList.remove('ballies-videos-active');
        requestAnimationFrame(function () {
          videosOuter.classList.add('ballies-videos-active');
        });
      }
      startIdleTimer();
    }
    function hideGalleryInstant() {
      if (galleryOuter) galleryOuter.classList.remove('ballies-gallery-active', 'ballies-gallery-exiting');
      if (galleryWrap) galleryWrap.scrollTop = 0;
    }
    function hideGalleryAnimated(cb) {
      if (!galleryOuter || !galleryOuter.classList.contains('ballies-gallery-active')) { if (cb) cb(); return; }
      galleryOuter.classList.add('ballies-gallery-exiting');
      setTimeout(function () {
        galleryOuter.classList.remove('ballies-gallery-active', 'ballies-gallery-exiting');
        if (galleryWrap) galleryWrap.scrollTop = 0;
        if (cb) cb();
      }, 520);
    }
    function showGallery() {
      if (galleryOuter) {
        galleryOuter.classList.remove('ballies-gallery-active');
        requestAnimationFrame(function () {
          galleryOuter.classList.add('ballies-gallery-active');
          // Reset scroll AFTER display:block is applied — setting scrollTop on display:none has no effect
          if (galleryWrap) galleryWrap.scrollTop = 0;
          setTimeout(updateGalleryScrollbar, 50);
        });
      }
    }

    if (p === 1) {
      if (prev === 4) {
        hideVideosInstant();
        hideMosaicInstant();
        hideGalleryAnimated(showSlideshow);
      } else {
        hideGalleryInstant();
        hideVideosAnimated(function () {
          hideMosaicAnimated(showSlideshow);
        });
      }
    } else if (p === 2) {
      hideSlideshow();
      if (prev === 4) {
        hideVideosInstant();
        hideGalleryAnimated(showMosaic);
      } else if (prev === 3) {
        hideGalleryInstant();
        hideVideosAnimated(showMosaic);
      } else {
        hideGalleryInstant();
        hideVideosInstant();
        showMosaic();
      }
    } else if (p === 3) {
      hideSlideshow();
      if (prev === 4) {
        hideMosaicInstant();
        hideGalleryAnimated(showVideos);
      } else if (prev === 2) {
        hideGalleryInstant();
        hideMosaicAnimated(showVideos);
      } else {
        hideGalleryInstant();
        hideMosaicInstant();
        showVideos();
      }
    } else if (p === 4) {
      hideSlideshow();
      hideMosaicInstant();
      if (prev === 3) {
        hideVideosAnimated(showGallery);
      } else {
        hideVideosInstant();
        showGallery();
      }
    }
  }

  dots.forEach(function (d, i) {
    d.addEventListener('click', function () { goToPage(i + 1); });
  });

  window._balliesPage  = 0;
  window._balliesTotal = 4;
  window._balliesNextPage = function () {
    if (window._balliesPage < window._balliesTotal - 1) goToPage(window._balliesPage + 2);
  };
  window._balliesPrevPage = function () {
    if (window._balliesPage > 0) goToPage(window._balliesPage);
  };

  // ----- Video lightbox -----
  var videoLb      = document.getElementById('balliesVideoLb');
  var videoLbWrap  = document.getElementById('balliesVideoLbWrap');
  var videoLbClose = document.getElementById('balliesVideoLbClose');

  function openVideoLb(id) {
    if (!videoLb || !videoLbWrap) return;
    // Pause hover previews while lightbox is open
    stopAllVideos();
    videoLbWrap.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.src = lightboxParams(id);
    iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('frameborder', '0');
    videoLbWrap.appendChild(iframe);
    videoLb.classList.add('ballies-video-lb--active');
  }
  function closeVideoLb() {
    if (!videoLb || !videoLbWrap) return;
    videoLb.classList.remove('ballies-video-lb--active');
    setTimeout(function () { videoLbWrap.innerHTML = ''; }, 350);
  }
  if (videoLbClose) videoLbClose.addEventListener('click', closeVideoLb);
  if (videoLb) {
    videoLb.addEventListener('click', function (e) {
      if (e.target === videoLb) closeVideoLb();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && videoLb && videoLb.classList.contains('ballies-video-lb--active')) {
      closeVideoLb();
    }
  });

  function setSlideshowState(running) {
    [track1, track2].forEach(function (t) {
      if (!t) return;
      t.style.animationPlayState = running ? 'running' : 'paused';
    });
  }

  function openBallies() {
    window._pageOpen = true;
    window._activePage = 'ballies';
    window._closeActivePage = closeBallies;
    balliesPage.classList.add('pp-active');
    if (projects) projects.style.opacity = '0';
    goToPage(1);
    setSlideshowState(true);
    if (slideshow) {
      slideshow.classList.remove('ballies-entering');
      requestAnimationFrame(function () {
        slideshow.classList.add('ballies-entering');
        setTimeout(function () { slideshow.classList.remove('ballies-entering'); }, 1100);
      });
    }
    startTypewriter();
  }

  function closeBallies() {
    window._pageOpen = false;
    window._activePage = null;
    window._closeActivePage = null;
    balliesPage.classList.remove('pp-active');
    if (projects) projects.style.opacity = '1';
    stopAllVideos();
    if (videosOuter) videosOuter.classList.remove('ballies-videos-active', 'ballies-videos-exiting');
    if (galleryOuter) galleryOuter.classList.remove('ballies-gallery-active', 'ballies-gallery-exiting');
    if (galleryWrap) galleryWrap.scrollTop = 0;
    goToPage(1);
    window._balliesPage = 0;
    resetTypewriter();
  }

  item3.addEventListener('click', function () {
    if (!projects || !projects.classList.contains('projects-active')) return;
    openBallies();
  });

  if (balliesBack) {
    balliesBack.addEventListener('click', closeBallies);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && window._pageOpen && balliesPage.classList.contains('pp-active')) closeBallies();
  });

  window._openBallies  = openBallies;
  window._closeBallies = closeBallies;
})();

/* ============================================
   WALL STREET GAMES PAGE
   ============================================ */
(function () {
  var item4   = document.getElementById('rmItem4');
  var wsgPage = document.getElementById('wsgPage');
  var wsgBack = document.getElementById('wsgBack');
  var projects = document.getElementById('projectsSection');
  if (!item4 || !wsgPage) return;

  var twWrap  = document.getElementById('wsgTypewriter');
  var twLine1 = document.getElementById('wsgTwLine1');

  var TW_TEXT  = "Across multiple collaborations with Wall Street Games, I created animated marketing videos and a range of visual solutions aligned with their bold and dynamic brand identity.";
  var TW_SPEED = 18;

  var twTimer     = null;
  var twCharTimer = null;

  function resetTypewriter() {
    clearTimeout(twTimer);
    clearTimeout(twCharTimer);
    if (!twWrap) return;
    twWrap.classList.remove('tw-visible');
    if (twLine1) twLine1.textContent = '';
    var cur = twWrap.querySelector('.tw-cursor');
    if (cur) cur.remove();
  }

  function startTypewriter() {
    if (!twWrap || !twLine1) return;
    var cursor = document.createElement('span');
    cursor.className = 'tw-cursor';
    twWrap.classList.add('tw-visible');
    twLine1.appendChild(cursor);
    var i = 0;
    function typeChar() {
      twLine1.insertBefore(document.createTextNode(TW_TEXT[i]), cursor);
      i++;
      if (i < TW_TEXT.length) {
        twCharTimer = setTimeout(typeChar, TW_SPEED);
      }
    }
    twTimer = setTimeout(typeChar, 600);
  }

  function openWSG() {
    window._pageOpen = true;
    window._activePage = 'wsg';
    window._closeActivePage = closeWSG;
    wsgPage.classList.add('pp-active');
    if (projects) projects.style.opacity = '0';
    sessionStorage.setItem('lastPage', 'wsg');
    startTypewriter();
  }

  function closeWSG() {
    window._pageOpen = false;
    window._activePage = null;
    window._closeActivePage = null;
    wsgPage.classList.remove('pp-active');
    if (projects) projects.style.opacity = '1';
    sessionStorage.removeItem('lastPage');
    resetTypewriter();
  }

  item4.addEventListener('click', function () {
    if (!projects || !projects.classList.contains('projects-active')) return;
    openWSG();
  });

  if (wsgBack) {
    wsgBack.addEventListener('click', closeWSG);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && window._pageOpen && wsgPage.classList.contains('pp-active')) closeWSG();
  });

  window._openWSG  = openWSG;
  window._closeWSG = closeWSG;
})();

/* ============================================
   ITS BILLBOARD VIDEO — HOVER TO PLAY & LIGHTBOX
   ============================================ */
(function () {
  var gallery = document.getElementById('itsGallery');
  if (!gallery) return;

  var items = gallery.querySelectorAll('.its-bb-item');

  // origin param helps YouTube authorise the embed
  var originParam = (location.origin && location.origin !== 'null')
    ? '&origin=' + encodeURIComponent(location.origin) : '';

  /* ---- Global postMessage listener ----
     Iframe stays opacity:0 until we get playerState=1 (PLAYING).
     Any error fires BEFORE YouTube renders its error UI, so we
     silently remove the iframe — the thumbnail is never obscured. */
  window.addEventListener('message', function (e) {
    try {
      var raw  = e.data;
      var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!data || !data.event) return;

      items.forEach(function (item) {
        if (!item._ytIframe || item._ytIframe.contentWindow !== e.source) return;

        var ev   = data.event;
        var info = data.info;

        // Error (101 / 150 / 153 / …) → remove silently
        if (ev === 'onError' || ev === 'error') {
          clearTimeout(item._showTimer);
          item._ytIframe.remove();
          item._ytIframe = null;
          item._ytFailed = true;
          item.classList.add('its-bb-failed');
          item.classList.remove('its-bb-playing');
          return;
        }

        // Player state PLAYING (1) → now safe to reveal
        var playing = (ev === 'onStateChange' && info === 1) ||
                      (ev === 'infoDelivery'  && info && info.playerState === 1);
        if (playing) {
          clearTimeout(item._showTimer);
          item._ytIframe.classList.add('its-bb-visible');
          item.classList.add('its-bb-playing');
        }
      });
    } catch (ignore) {}
  });

  /* ---- "Hover to play" hint ---- */
  var hintEl    = document.getElementById('itsHoverHint');
  var hintTimer = null;

  function scheduleHint() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      if (hintEl) hintEl.classList.add('its-hint-visible');
    }, 3000);
  }

  function hideHint() {
    clearTimeout(hintTimer);
    if (hintEl) hintEl.classList.remove('its-hint-visible');
  }

  // Start the 3-second timer as soon as the ITS page opens
  document.getElementById('itsPage') && (function () {
    var itsPage = document.getElementById('itsPage');
    var observer = new MutationObserver(function () {
      if (itsPage.classList.contains('pp-active')) {
        scheduleHint();
      } else {
        hideHint();
      }
    });
    observer.observe(itsPage, { attributes: true, attributeFilter: ['class'] });
  })();

  items.forEach(function (item) {
    var ytId   = item.dataset.yt;
    var screen = item.querySelector('.its-bb-screen');
    if (!ytId || !screen) return;

    item.addEventListener('mouseenter', function () {
      hideHint();
      if (item._ytFailed) return;

      if (!item._ytIframe) {
        var iframe = document.createElement('iframe');
        iframe.className = 'its-bb-player';
        // Match the official YouTube embed allow attribute exactly
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        iframe.setAttribute('allowfullscreen', '');
        iframe.src = 'https://www.youtube.com/embed/' + ytId +
          '?autoplay=1&mute=1&controls=0&rel=0&enablejsapi=1&playsinline=1' + originParam;
        screen.appendChild(iframe);
        item._ytIframe = iframe;

        // Iframe stays hidden (opacity:0) while YouTube loads.
        // The thumbnail covers it so the user never sees black/loading UI.
        // postMessage playerState=1 triggers the reveal; thumbnail fades out simultaneously.
        // Fallback: reveal after 1.2 s if postMessage never arrives (slow connection).
        item._showTimer = setTimeout(function () {
          if (!item._ytFailed && item._ytIframe && item.matches(':hover')) {
            item._ytIframe.classList.add('its-bb-visible');
            item.classList.add('its-bb-playing');
          }
        }, 1200);

      } else {
        // Re-hover — resume
        item._ytIframe.classList.add('its-bb-visible');
        item.classList.add('its-bb-playing');
        try {
          item._ytIframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*'
          );
        } catch (ignore) {}
      }
    });

    item.addEventListener('mouseleave', function () {
      // Destroy iframe completely so next hover always restarts from the beginning
      clearTimeout(item._showTimer);
      if (item._ytIframe) {
        item._ytIframe.remove();
        item._ytIframe = null;
      }
      item.classList.remove('its-bb-playing');
      scheduleHint();
    });
  });

})();

/* ============================================
   ITS GALLERY SWITCHING
   ============================================ */
(function () {
  var itsPage    = document.getElementById('itsPage');
  var billboard  = document.getElementById('itsGallery');
  var gallery2   = document.getElementById('itsGallery2');
  var gallery3   = document.getElementById('itsGallery3');
  var hintEl     = document.getElementById('itsHoverHint');
  var dots       = document.querySelectorAll('.its-dot');

  if (!billboard || !gallery2 || !gallery3) return;

  var galleries  = [billboard, gallery2, gallery3];
  var TOTAL      = galleries.length;
  var page       = 0;
  var transitioning = false;

  function updateDots(p) {
    dots.forEach(function (d, i) { d.classList.toggle('its-dot--active', i === p); });
  }

  function resetImageGallery(g) {
    g.classList.remove('gallery-active', 'gallery-exiting');
    g.querySelectorAll('.fca-work-item').forEach(function (el) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    });
  }

  window._itsGalleryPage       = 0;
  window._itsGalleryTotal      = TOTAL;
  window._itsGalleryTransitioning = false;

  window._resetItsGalleryPage = function () {
    page = 0;
    window._itsGalleryPage = 0;
    transitioning = false;
    window._itsGalleryTransitioning = false;
    // Restore billboard
    billboard.style.height   = '';
    billboard.style.overflow = '';
    billboard.style.margin   = '';
    billboard.style.padding  = '';
    billboard.style.opacity      = '';
    billboard.style.pointerEvents = '';
    billboard.style.transition   = '';
    if (itsPage) {
      itsPage.classList.remove('its-gallery-2-active', 'its-gallery-3-active');
    }
    // Reset image galleries
    resetImageGallery(gallery2);
    resetImageGallery(gallery3);
    updateDots(0);
  };

  window._itsNextGallery = function () {
    if (page >= TOTAL - 1 || transitioning) return;
    transitioning = true;
    window._itsGalleryTransitioning = true;

    var oldPage = page;
    var newPage = page + 1;

    if (oldPage === 0) {
      // Fade out billboard + hint
      billboard.style.transition   = 'opacity 0.4s ease';
      billboard.style.opacity      = '0';
      billboard.style.pointerEvents = 'none';
      if (hintEl) { hintEl.style.opacity = '0'; hintEl.style.transition = 'none'; }

      setTimeout(function () {
        // Collapse billboard so it no longer pushes gallery 2/3 down
        billboard.style.height   = '0';
        billboard.style.overflow = 'hidden';
        billboard.style.margin   = '0';
        billboard.style.padding  = '0';

        galleries[newPage].classList.add('gallery-active');
        page = newPage;
        window._itsGalleryPage = newPage;
        if (itsPage) itsPage.classList.add('its-gallery-' + newPage + '-active');
        updateDots(newPage);
        transitioning = false;
        window._itsGalleryTransitioning = false;
      }, 420);
    } else {
      // Exit old image gallery
      galleries[oldPage].classList.add('gallery-exiting');
      setTimeout(function () {
        resetImageGallery(galleries[oldPage]);
        galleries[newPage].classList.add('gallery-active');
        page = newPage;
        window._itsGalleryPage = newPage;
        if (itsPage) {
          itsPage.classList.remove('its-gallery-' + oldPage + '-active');
          itsPage.classList.add('its-gallery-' + newPage + '-active');
        }
        updateDots(newPage);
        transitioning = false;
        window._itsGalleryTransitioning = false;
      }, 560);
    }
  };

  window._itsPrevGallery = function () {
    if (page <= 0 || transitioning) return;
    transitioning = true;
    window._itsGalleryTransitioning = true;

    var oldPage = page;
    var newPage = page - 1;

    galleries[oldPage].classList.add('gallery-exiting');

    setTimeout(function () {
      resetImageGallery(galleries[oldPage]);
      if (itsPage) itsPage.classList.remove('its-gallery-' + oldPage + '-active');

      if (newPage === 0) {
        // Restore billboard height first, then fade it in
        billboard.style.height   = '';
        billboard.style.overflow = '';
        billboard.style.margin   = '';
        billboard.style.padding  = '';
        billboard.style.transition   = 'opacity 0.5s ease';
        billboard.style.opacity      = '';
        billboard.style.pointerEvents = '';
        if (hintEl) { hintEl.style.opacity = ''; hintEl.style.transition = ''; }
      } else {
        galleries[newPage].classList.add('gallery-active');
        if (itsPage) itsPage.classList.add('its-gallery-' + newPage + '-active');
      }

      page = newPage;
      window._itsGalleryPage = newPage;
      updateDots(newPage);
      transitioning = false;
      window._itsGalleryTransitioning = false;
    }, 560);
  };

  // Dot click navigation
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () {
      if (transitioning) return;
      if (i === page) return;
      if (i > page) {
        // Only advance one step at a time
        window._itsNextGallery();
      } else {
        window._itsPrevGallery();
      }
    });
  });

})();

/* ============================================
   FCA GALLERY LIGHTBOX
   ============================================ */
(function () {
  var gallery  = document.getElementById('fcaGallery');
  var gallery2 = document.getElementById('fcaGallery2');
  var gallery3 = document.getElementById('fcaGallery3');
  var itsG2    = document.getElementById('itsGallery2');
  var itsG3    = document.getElementById('itsGallery3');
  var lightbox = document.getElementById('fcaLightbox');
  var lbImg    = document.getElementById('fcaLbImg');
  var lbCap    = document.getElementById('fcaLbCaption');
  var lbClose  = document.getElementById('fcaLbClose');
  if (!gallery || !lightbox || !lbImg) return;

  var galleries = [gallery, gallery2, gallery3, itsG2, itsG3].filter(Boolean);

  function openLightbox(item) {
    var img = item.querySelector('.fca-work-img-wrap img');
    var cap = item.querySelector('.fca-work-caption');
    if (!img) return;
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    if (lbCap && cap) lbCap.textContent = cap.textContent;
    lightbox.classList.add('lb-active');
    galleries.forEach(function (g) { g.classList.add('gallery-lb-open'); });
    window._lbOpen = true;
  }

  function closeLightbox() {
    if (!window._lbOpen) return;
    lightbox.classList.remove('lb-active');
    galleries.forEach(function (g) { g.classList.remove('gallery-lb-open'); });
    window._lbOpen = false;
    setTimeout(function () { lbImg.src = ''; }, 420);
  }

  // Handle clicks on both gallery 1 and gallery 2
  galleries.forEach(function (g) {
    g.addEventListener('click', function (e) {
      var item = e.target.closest('.fca-work-item');
      if (!item) return;
      openLightbox(item);
    });
  });

  lbClose.addEventListener('click', closeLightbox);

  // Click dark backdrop to close
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });

  // ESC closes lightbox first, then FCA
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && window._lbOpen) {
      e.stopImmediatePropagation();
      closeLightbox();
    }
  }, true); // capture phase so it fires before the FCA ESC handler

  function openLightboxWithSrc(src, alt, caption) {
    lbImg.src = src;
    lbImg.alt = alt || '';
    if (lbCap) lbCap.textContent = caption || '';
    lightbox.classList.add('lb-active');
    galleries.forEach(function (g) { g.classList.add('gallery-lb-open'); });
    window._lbOpen = true;
  }

  window._closeLightbox = closeLightbox;
  window._openFcaLightboxForItem = openLightbox;
  window._openLightboxWithSrc = openLightboxWithSrc;
})();


/* ============================================
   FCA GALLERY SWITCHING
   ============================================ */
(function () {
  var galleries = [
    document.getElementById('fcaGallery'),
    document.getElementById('fcaGallery2'),
    document.getElementById('fcaGallery3')
  ];
  var dots = document.querySelectorAll('.fca-dot');
  var TOTAL = galleries.length;

  if (!galleries[0]) return;

  window._galleryPage = 0;
  window._galleryTotal = TOTAL;
  window._galleryTransitioning = false;

  function updateDots(page) {
    dots.forEach(function (dot, i) {
      dot.classList.toggle('fca-dot--active', i === page);
    });
  }

  // Reset a non-first gallery back to hidden state + clear item animations
  function resetGallery(g) {
    g.classList.remove('gallery-active', 'gallery-exiting');
    g.querySelectorAll('.fca-work-item').forEach(function (el) {
      el.style.animation = 'none';
      void el.offsetWidth; // force reflow so animation replays on next activation
      el.style.animation = '';
    });
  }

  window._resetGalleryPage = function () {
    window._galleryPage = 0;
    window._galleryTransitioning = false;
    // Reset all non-first galleries
    for (var i = 1; i < TOTAL; i++) {
      if (galleries[i]) resetGallery(galleries[i]);
    }
    // Restore gallery 1 to normal visible state
    galleries[0].classList.remove('gallery-exiting');
    galleries[0].style.opacity = '';
    galleries[0].style.transition = '';
    galleries[0].style.pointerEvents = '';
    updateDots(0);
  };

  window._fcaNextGallery = function () {
    var page = window._galleryPage;
    if (page >= TOTAL - 1 || window._galleryTransitioning) return;
    window._galleryTransitioning = true;

    var oldG = galleries[page];
    var newPage = page + 1;
    var newG = galleries[newPage];

    // Exit old gallery
    oldG.classList.add('gallery-exiting');

    setTimeout(function () {
      oldG.classList.remove('gallery-exiting');

      if (page === 0) {
        // Gallery 1: hide via inline style (pp-active CSS would show it otherwise)
        oldG.style.opacity = '0';
        oldG.style.pointerEvents = 'none';
      } else {
        // Other galleries: remove gallery-active so CSS hides them
        resetGallery(oldG);
      }

      // Show new gallery
      newG.classList.add('gallery-active');
      window._galleryPage = newPage;
      updateDots(newPage);
      window._galleryTransitioning = false;
    }, 560);
  };

  window._fcaPrevGallery = function () {
    var page = window._galleryPage;
    if (page <= 0 || window._galleryTransitioning) return;
    window._galleryTransitioning = true;

    var oldG = galleries[page];
    var newPage = page - 1;
    var newG = galleries[newPage];

    // Exit current gallery
    oldG.classList.add('gallery-exiting');

    setTimeout(function () {
      resetGallery(oldG);

      if (newPage === 0) {
        // Re-run fcaItemFromDist on gallery 1 items.
        // They still have the animation set via pp-active CSS, but it already
        // completed. To restart it: set animation:none → force reflow → clear
        // inline style. The browser sees the property change from none → the
        // CSS value and starts the animation fresh (with the correct stagger delays).
        var items = newG.querySelectorAll('.fca-work-item');
        items.forEach(function (el) { el.style.animation = 'none'; });
        void newG.offsetWidth; // flush styles so browser registers animation:none
        items.forEach(function (el) { el.style.animation = ''; }); // CSS takes over → restarts
        newG.style.pointerEvents = '';
        newG.style.opacity = ''; // unhide container (fill-mode:backwards keeps items at opacity:0 during delays)
        window._galleryPage = newPage;
        updateDots(newPage);
        window._galleryTransitioning = false;
      } else {
        // Returning to a middle gallery — re-activate it
        newG.classList.add('gallery-active');
        window._galleryPage = newPage;
        updateDots(newPage);
        window._galleryTransitioning = false;
      }
    }, 560);
  };

  // Dot click navigation
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () {
      if (window._galleryTransitioning) return;
      var page = window._galleryPage;
      if (i === page) return;
      if (i > page) {
        // Advance forward one step at a time
        window._fcaNextGallery();
      } else {
        window._fcaPrevGallery();
      }
    });
  });
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
    var onActive = lastPage === 'fca'     && window._openFCA     ? function () { window._openFCA(); }
                 : lastPage === 'its'     && window._openITS     ? function () { window._openITS(); }
                 : lastPage === 'ballies' && window._openBallies ? function () { window._openBallies(); }
                 : lastPage === 'wsg'     && window._openWSG     ? function () { window._openWSG(); }
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
