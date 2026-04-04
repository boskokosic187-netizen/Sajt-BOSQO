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
