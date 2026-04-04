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
    const angle = (Math.random() * 40 + 50) * (Math.PI / 180);
    const speed = Math.random() * 3 + 2;
    return {
      x: Math.random() * w,
      y: -10,
      dx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
      dy: Math.sin(angle) * speed,
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
    if (timestamp - spawnTimer > SPAWN_INTERVAL) {
      drops.push(createDrop());
      spawnTimer = timestamp;
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.x += d.dx;
      d.y += d.dy;
      d.life -= d.decay;

      if (d.life <= 0 || d.y > h + 50) {
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
  pulseCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;';
  wrapper.appendChild(pulseCanvas);
  const pCtx = pulseCanvas.getContext('2d');

  // Create icon elements
  const iconEls = iconNames.map(name => {
    const div = document.createElement('div');
    div.className = 'floating-icon';
    const img = document.createElement('img');
    img.src = `assets/svg/${name}.svg`;
    img.alt = name;
    img.draggable = false;
    div.appendChild(img);
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

  // Init physics state
  const state = iconEls.map((el, i) => {
    const angle = (i / iconEls.length) * Math.PI * 2;
    const r = circleR * (0.12 + Math.random() * 0.42);
    const speed = 0.45 + Math.random() * 0.4;
    const dir = Math.random() * Math.PI * 2;
    const above = Math.random() > 0.5;
    el.style.zIndex = above ? '2' : '0';
    return {
      el,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      above
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

        if (Math.random() > 0.45) {
          s.above = !s.above;
          s.el.style.zIndex = s.above ? '2' : '0';
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
