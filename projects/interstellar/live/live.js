/* INTERSTELLAR · Bend the light. Drag the black hole across the GARGANTUA poster.
   One fragment shader: the point-lens equation, beta = theta - thetaE^2 / theta, evaluated in angles
   around the hole (thetaE^2 calibrated per radius against the offline ray tracer that made the poster),
   samples the unbent sky plate (stars + title). The hole itself is a sprite rendered by that ray tracer.
   Earth time runs at 1 / sqrt(1 - rs/r) of ship time, r = distance from the hole to the astronaut. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const body = document.body, cv = $('#c');
  const elShip = $('#ship'), elEarth = $('#earth'), elR = $('#r'), elF = $('#f');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const weak = (navigator.deviceMemory && navigator.deviceMemory < 3) || (navigator.connection && navigator.connection.saveData);
  let S = null, gl = null, prog = null, U = {}, tex = {}, ok = false;
  let visible = true, paused = false, raf = 0, last = 0, scale = 1, slow = 0;
  const hole = { x: 0, y: 0, tx: 0, ty: 0 };
  let drag = null, view = { x: 0, y: 0, s: 1 }, seed = 0, dirty = true;
  let ship = 0, earth = 0, factor = 1, rNow = 0;

  // ------------------------------------------------------------------ shader
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `precision highp float;
uniform sampler2D uPlate,uSpr,uAst,uOver;
uniform vec2 uRes;uniform vec3 uView;uniform vec2 uHole;uniform float uF,uSh,uSeed;
uniform vec4 uPlateR,uSprR,uAstR,uOverR,uFit;uniform float uFitK;
float E2(float x){return uFit.x+uFit.y/x+uFit.z/(x*x)+uFit.w*exp(-(x-1.)*uFitK);}
vec2 mir(vec2 u){vec2 t=mod(u,2.);return 1.-abs(t-1.);}
vec4 tap(sampler2D s,vec4 R,vec2 P){vec2 u=(P-R.xy)/R.zw;
 if(u.x<0.||u.y<0.||u.x>1.||u.y>1.)return vec4(0.);return texture2D(s,u);}
void main(){
 vec2 fr=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
 vec2 P=uView.xy+fr*uView.z;
 vec2 d=P-uHole;float r=length(d);
 float th=atan(r/uF),ts=atan(uSh/uF);
 vec3 c=vec3(0.);
 if(th>ts){
  float x=th/ts;float b=th-E2(x)*ts*ts/th;
  float rs=uF*tan(clamp(b,-1.45,1.45));
  vec2 Sx=uHole+d/max(r,1e-3)*rs;
  c=texture2D(uPlate,mir((Sx-uPlateR.xy)/uPlateR.zw)).rgb;
 }
 vec4 s=tap(uSpr,uSprR,d);c=c*(1.-s.a)+s.rgb;
 vec4 a=tap(uAst,uAstR,P);c=c*(1.-a.a)+a.rgb;
 vec4 o=tap(uOver,uOverR,P);c=c*(1.-o.a)+o.rgb;
 vec2 q=fr/uRes-.5;c*=1.-.35*dot(q,q);
 float n=fract(sin(dot(fr+uSeed,vec2(12.9898,78.233)))*43758.5453)-.5;
 float l=dot(c,vec3(.3,.59,.11));c+=n*.045*(.25+2.*l*(1.-l));
 gl_FragColor=vec4(c,1.);
}`;

  function compile(type, src) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  function initGL() {
    gl = cv.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl');
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uPlate', 'uSpr', 'uAst', 'uOver', 'uRes', 'uView', 'uHole', 'uF', 'uSh', 'uSeed', 'uPlateR', 'uSprR', 'uAstR', 'uOverR', 'uFit', 'uFitK'])
      U[n] = gl.getUniformLocation(prog, n);
  }
  function upload(unit, img, name) {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U[name], unit); tex[name] = t;
  }

  // ------------------------------------------------------------------ layout
  function portrait() { return innerWidth / innerHeight < S.poster.w / S.poster.h; }
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5) * scale;
    const w = Math.max(1, Math.round(innerWidth * dpr)), h = Math.max(1, Math.round(innerHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    // the poster column fills the height with the readout beside it, or (narrow screens) sits
    // under the readout; the sky goes on all round it
    const P = S.poster, vw = innerWidth, vh = innerHeight;
    const side = vw - P.w * vh / P.h >= 2 * 250;
    const sc = side ? P.h / vh : Math.max(P.w / vw, P.h / Math.max(160, vh - 2 * 124));  // poster px per css px
    const s = sc * innerWidth / w;
    view = { x: P.w / 2 - (w / 2) * s, y: P.h / 2 - (h / 2) * s, s };
    body.classList.toggle('side', side); body.classList.toggle('stack', !side);
    if (gl) gl.viewport(0, 0, w, h);
    dirty = true;
  }
  function toPoster(e) {
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    return { x: view.x + (e.clientX - r.left) * k * view.s, y: view.y + (e.clientY - r.top) * k * view.s };
  }

  // ------------------------------------------------------------------ time
  function pad(n, l = 2) { return String(Math.floor(n)).padStart(l, '0'); }
  function hms(t) { return pad(t / 3600) + ':' + pad((t / 60) % 60) + ':' + pad(t % 60); }
  function longTime(t) {
    const y = Math.floor(t / 31557600), d = Math.floor((t % 31557600) / 86400), r = t % 86400;
    if (y) return y + ' y ' + pad(d, 3) + ' d ' + hms(r);
    if (d) return d + ' d ' + hms(r);
    return hms(r);
  }
  function physics() {
    const rs = S.sh / S.bcrit;                       // r_s in poster px (shadow radius = 2.598 r_s)
    const dx = hole.x - S.astro.cx, dy = hole.y - S.astro.cy;
    rNow = Math.max(1 + 1e-6, Math.hypot(dx, dy) / rs);
    factor = 1 / Math.sqrt(1 - 1 / rNow);
  }
  function readout() {
    elShip.textContent = hms(ship);
    elEarth.textContent = longTime(earth);
    elR.textContent = rNow < 1.0001 ? '1.0000' : rNow < 10 ? rNow.toFixed(3) : rNow.toFixed(1);
    elF.textContent = (factor < 10 ? factor.toFixed(3) : factor < 1000 ? factor.toFixed(1) : Math.round(factor).toLocaleString('en')) + ' s';
    body.classList.toggle('near', factor > 1.5); body.classList.toggle('far', factor <= 1.5);
  }

  // ------------------------------------------------------------------ frame
  function draw() {
    gl.uniform2f(U.uRes, cv.width, cv.height);
    gl.uniform3f(U.uView, view.x, view.y, view.s);
    gl.uniform2f(U.uHole, hole.x, hole.y);
    gl.uniform1f(U.uF, S.F); gl.uniform1f(U.uSh, S.sh); gl.uniform1f(U.uSeed, seed);
    gl.uniform4fv(U.uPlateR, S.plate.rect); gl.uniform4fv(U.uSprR, S.sprite.rect);
    gl.uniform4fv(U.uAstR, S.astro.rect); gl.uniform4fv(U.uOverR, S.over.rect);
    gl.uniform4fv(U.uFit, S.fit.c); gl.uniform1f(U.uFitK, S.fit.k);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(t) {
    raf = 0;
    if (paused || !visible) { last = 0; return; }
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
    const k = 1 - Math.exp(-dt * (reduce ? 40 : 11));
    const mx = hole.tx - hole.x, my = hole.ty - hole.y;
    const moving = Math.abs(mx) + Math.abs(my) > 0.3;
    if (moving) { hole.x += mx * k; hole.y += my * k; dirty = true; }
    physics();
    ship += dt; earth += dt * factor;
    if (!reduce && (moving || drag)) { seed = (seed + 1) % 97; }
    if (dirty) {
      const t0 = performance.now(); draw(); dirty = false;
      // the frame is too slow: draw fewer pixels
      if (performance.now() - t0 > 24 && scale > 0.55) { if (++slow > 3) { scale *= 0.8; slow = 0; size(); } } else slow = 0;
    }
    readout();
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && ok && !paused && visible) { last = 0; raf = requestAnimationFrame(frame); } }

  // ------------------------------------------------------------------ input
  cv.addEventListener('pointerdown', (e) => {
    const p = toPoster(e), near = Math.hypot(p.x - hole.x, p.y - hole.y) < S.sh * 2.2;
    drag = { ox: near ? hole.x - p.x : 0, oy: near ? hole.y - p.y : 0 };
    hole.tx = p.x + drag.ox; hole.ty = p.y + drag.oy;
    cv.setPointerCapture(e.pointerId); body.classList.add('drag'); kick();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return; const p = toPoster(e);
    hole.tx = p.x + drag.ox; hole.ty = p.y + drag.oy; kick();
  });
  const end = () => { drag = null; body.classList.remove('drag'); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('dblclick', () => { hole.tx = S.hole0[0]; hole.ty = S.hole0[1]; kick(); });
  cv.addEventListener('keydown', (e) => {
    const st = S.sh * (e.shiftKey ? 1 : 0.25);
    const m = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
    if (m) { hole.tx += m[0]; hole.ty += m[1]; e.preventDefault(); kick(); }
    if (e.key === 'Escape') { hole.tx = S.hole0[0]; hole.ty = S.hole0[1]; kick(); }
  });
  addEventListener('resize', () => { if (ok) { size(); kick(); } });
  addEventListener('message', (e) => {
    if (e.data === 'interstellar:pause') { paused = true; }
    else if (e.data === 'interstellar:play') { paused = false; kick(); }
  });
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; kick(); });
  if ('IntersectionObserver' in window) new IntersectionObserver((en) => { visible = en[0].isIntersecting && !document.hidden; kick(); }).observe(cv);

  // ------------------------------------------------------------------ boot
  function img(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  function lite() { body.classList.add('lite'); }
  function start() {
    body.classList.remove('lite');
    fetch('data/scene.json').then((r) => r.json()).then((s) => {
      S = s;
      const port = portrait();
      return Promise.all([img(port ? S.plate.srcV : S.plate.src), img(S.sprite.src), img(S.astro.src), img(S.over.src)]).then((im) => {
        if (port && S.plate.rectV) S.plate.rect = S.plate.rectV;
        initGL();
        upload(0, im[0], 'uPlate'); upload(1, im[1], 'uSpr'); upload(2, im[2], 'uAst'); upload(3, im[3], 'uOver');
        hole.x = hole.tx = S.hole0[0]; hole.y = hole.ty = S.hole0[1];
        ok = true; size(); physics(); readout();
        body.classList.add('ready'); kick();
      });
    }).catch(() => { ok = false; lite(); });
  }
  $('#run').addEventListener('click', start);
  if (reduce || weak) lite(); else start();
})();
