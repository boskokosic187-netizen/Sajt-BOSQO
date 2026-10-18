/* STRUJA — living identity engine. WebGL2, no dependencies.
   One line of sodium light; at rest it is the course of the Sava through Belgrade
   (OpenStreetMap, ODbL). Music bends it, kicks send pulses down the current, the drop
   splits it into filaments. The wordmark is cut by the line and carried by it. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ glyphs */
  const AX = { wdth: [50, 100, 200], CTRS: [0, 85], slnt: [-10, 0] };

  function seg(v, stops) {
    if (v <= stops[0]) return [0, 0, 0];
    for (let i = 0; i < stops.length - 1; i++)
      if (v <= stops[i + 1]) return [i, i + 1, (v - stops[i]) / (stops[i + 1] - stops[i])];
    const n = stops.length - 1;
    return [n, n, 0];
  }

  function makeFont(meta, data) {
    const nW = 3, nC = 2;
    const idx = (s, c, w) => s * nC * nW + c * nW + w;
    function corners(wdth, ctrs, slnt) {
      const [w0, w1, tw] = seg(wdth, AX.wdth), [c0, c1, tc] = seg(ctrs, AX.CTRS), [s0, s1, ts] = seg(slnt, AX.slnt);
      const out = [];
      for (const [s, ws] of [[s0, 1 - ts], [s1, ts]])
        for (const [c, wc] of [[c0, 1 - tc], [c1, tc]])
          for (const [w, ww] of [[w0, 1 - tw], [w1, tw]]) {
            const k = ws * wc * ww;
            if (k > 1e-6) out.push([idx(s, c, w), k]);
          }
      return out;
    }
    function glyph(ch, wdth, ctrs, slnt, out) {
      const g = meta.glyphs[ch];
      const n = g.contours.reduce((a, b) => a + b, 0);
      const pts = out && out.length === n * 2 ? out : new Float32Array(n * 2);
      pts.fill(0);
      let adv = 0;
      for (const [j, k] of corners(wdth, ctrs, slnt)) {
        const base = (g.offset + j * n) * 2;
        for (let i = 0; i < n * 2; i++) pts[i] += data[base + i] * k;
        adv += g.adv[j] * k;
      }
      return { pts, adv, contours: g.contours };
    }
    function advance(word, wdth, ctrs, slnt, track) {
      let a = 0;
      for (const ch of word) a += glyph(ch, wdth, ctrs, slnt).adv;
      return a + track * (word.length - 1);
    }
    return { meta, glyph, advance, capHeight: meta.capHeight };
  }

  /* ------------------------------------------------------------------ GL utils */
  function sh(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => i + 1 + ': ' + l).join('\n'));
    return s;
  }
  function prog(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  function tex(gl, w, h, ifmt, fmt, type, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function target(gl, w, h, hdr) {
    const t = hdr ? tex(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT) : tex(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f, w, h };
  }

  /* ------------------------------------------------------------------ shaders */
  const CURVE = `
uniform sampler2D uRest;      // 512 x 1, Sava profile in R (-1..1)
uniform vec2  uRes;
uniform float uTime, uY0, uRestAmp, uFlow;
uniform vec2  uRestRange;     // where the Sava sits along x (0..1)
uniform vec4  uWave;          // amplitudes in px: low, mid, high, edge
uniform vec4  uPulse[8];      // x = launch time, y = amplitude px, z = speed (frac/s), w = width (frac)
uniform vec3  uPointer;       // x frac, y px, strength
uniform vec3  uCam;           // camera centre (world px) and zoom
vec2 toScreen(vec2 w){ return (w - uCam.xy) * uCam.z + uRes * 0.5; }
vec2 toWorld(vec2 s){ return (s - uRes * 0.5) / uCam.z + uCam.xy; }
float h11(float n){ return fract(sin(n*127.1)*43758.5453); }
float vnoise(float x){ float i=floor(x), f=fract(x); float u=f*f*(3.0-2.0*f); return mix(h11(i),h11(i+1.0),u)*2.0-1.0; }
float fbm(float x){ return 0.6*vnoise(x)+0.3*vnoise(x*2.13+7.1)+0.1*vnoise(x*4.37+3.3); }
float restY(float x){ float u = (x - uRestRange.x) / (uRestRange.y - uRestRange.x); return texture(uRest, vec2(clamp(u,0.0,1.0)*0.998+0.001, 0.5)).r; }
float curveY(float x, float k){
  float t = uTime;
  float ph = k * 0.37;
  float y = uY0 - uRestAmp * restY(x);
  float env = 0.55 + 0.45 * sin(3.14159 * clamp(x, 0.0, 1.0));
  y += uWave.x * env * sin(6.2832 * (1.15 * x - uFlow * 0.55 * t) + 0.6 + ph * 0.5);
  y += uWave.y * env * sin(6.2832 * (4.3 * x - uFlow * 1.3 * t) + 1.9 + ph);
  y += uWave.z * env * fbm(x * 26.0 - uFlow * 6.0 * t + k * 3.1);
  for (int i = 0; i < 8; i++) {
    vec4 p = uPulse[i];
    if (p.y == 0.0) continue;
    float age = t - p.x;
    if (age < 0.0) continue;
    float cx = -0.08 + age * p.z;
    float d = (x - cx) / p.w;
    y -= p.y * exp(-d * d) * exp(-age * 1.1) * cos(d * 2.2);
  }
  float pd = (x - uPointer.x) / 0.07;
  y += (uPointer.y - y) * 0.35 * uPointer.z * exp(-pd * pd);
  return y;
}`;

  const VS_LINE = `#version 300 es
precision highp float;
in vec2 aP;                 // x along (0..1), side (-1..1)
uniform float uHalf, uSpread, uStrands, uCore, uTwist, uSpin, uReach;
out float vSide; out float vW; out float vK; out float vDepth; out float vX; out float vRad;
${CURVE}
// the cable: strands wound around the core; spread = radius of the unwinding
float unwind(float x){
  // the cable opens from the middle outward: reach 0 = closed, 1.2 = open end to end
  float d = abs(x - 0.5) * 2.0;
  float open = 1.0 - smoothstep(uReach - 0.25, uReach, d);
  float breathe = 0.75 + 0.25 * sin(6.2832 * (0.9 * x - 0.22 * uTime));
  return uSpread * open * breathe;
}
float strandOff(float x, float k, out float depth, out float rad){
  depth = 1.0; rad = 0.0;
  if (k < 0.5) return 0.0;
  float n = max(uStrands - 1.0, 1.0);
  rad = unwind(x) * (0.92 + 0.16 * h11(k + 11.0));
  float lay = mix(uTwist, uTwist * 0.3, smoothstep(0.0, max(uSpread, 1.0), rad));
  float ph = 6.2832 * (x * lay - uTime * uSpin) + 6.2832 * (k - 1.0) / n;
  depth = cos(ph);
  return rad * sin(ph) + 0.6 * sin(ph) * (uCore * 0.9);
}
void main(){
  float k = float(gl_InstanceID);
  float x = mix(-0.04, 1.04, aP.x);
  float e = 1.5 / uRes.x;
  float dep, dep1, rad, rad1;
  float y  = curveY(x, 0.0) + strandOff(x, k, dep, rad);
  float y1 = curveY(x + e, 0.0) + strandOff(x + e, k, dep1, rad1);
  vDepth = dep; vRad = rad;
  vec2 dir = normalize(vec2(e * uRes.x, y1 - y));
  vec2 n = vec2(-dir.y, dir.x);
  vec2 p = toScreen(vec2(x * uRes.x, y)) + n * aP.y * uHalf * uCam.z;
  vSide = aP.y; vK = k; vX = x;
  vW = k < 0.5 ? 1.0 : 0.62 * (0.8 + 0.2 * dep);
  gl_Position = vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}`;

  const FS_LINE = `#version 300 es
precision highp float;
in float vSide; in float vW; in float vK; in float vDepth; in float vX; in float vRad;
uniform float uHalf, uCore, uGain, uStrandGain, uFront, uReveal;
uniform vec3 uClip;   // x0, x1, amount: hide the line outside the river (end card)
out vec4 o;
void main(){
  float d = abs(vSide) * uHalf;
  float core = uCore * vW;   // both in world px, so the profile scales with the camera
  float i = exp(-(d * d) / (core * core)) + 0.12 * exp(-d / (core * 2.5));
  float vis = 1.0 - smoothstep(uReveal - 0.035, uReveal, vX);
  float head = uReveal < 1.04 ? exp(-pow((vX - uReveal + 0.006) / 0.006, 2.0)) * 5.0 : 0.0;
  i *= vis + head;
  float inside = smoothstep(uClip.x - 0.004, uClip.x + 0.004, vX) * (1.0 - smoothstep(uClip.y - 0.004, uClip.y + 0.004, vX));
  i *= mix(1.0, inside, uClip.z);
  if (vK < 0.5) { o = vec4(i * uGain, 0.0, 0.0, 1.0); return; }
  float g = uStrandGain * (0.35 + 0.65 * (0.5 + 0.5 * vDepth)) * smoothstep(1.5, 9.0, vRad);
  float front = smoothstep(0.1, 0.6, vDepth) * uFront;
  o = vec4(i * g * (1.0 - front), i * g * front, 0.0, 1.0);
}`;

  const VS_QUAD = `#version 300 es
in vec2 aP; out vec2 vUv;
void main(){ vUv = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;

  const FS_TRAIL = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uPrev, uCur; uniform float uDecay; uniform vec2 uDrift;
out vec4 o;
void main(){
  vec2 p = texture(uPrev, vUv - uDrift).rg * uDecay;
  vec2 c = texture(uCur, vUv).rg;
  o = vec4(max(p, c) + c * 0.15, 0.0, 1.0);
}`;

  const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uSrc; uniform vec2 uTexel; out vec4 o;
float S(vec2 uv){ vec4 c = texture(uSrc, uv); return c.r + c.g; }
void main(){
  vec2 t = uTexel;
  float a = S(vUv + t * vec2(-2, -2)), b = S(vUv + t * vec2(0, -2)), c = S(vUv + t * vec2(2, -2));
  float d = S(vUv + t * vec2(-1, -1)), e = S(vUv + t * vec2(1, -1));
  float f = S(vUv + t * vec2(-2, 0)), g = S(vUv), h = S(vUv + t * vec2(2, 0));
  float i = S(vUv + t * vec2(-1, 1)), j = S(vUv + t * vec2(1, 1));
  float k = S(vUv + t * vec2(-2, 2)), l = S(vUv + t * vec2(0, 2)), m = S(vUv + t * vec2(2, 2));
  float r = g * 0.125 + (a + c + k + m) * 0.03125 + (b + f + h + l) * 0.0625 + (d + e + i + j) * 0.125;
  o = vec4(r, 0, 0, 1);
}`;

  const FS_UP = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uSrc, uBase; uniform vec2 uTexel; uniform float uMix; out vec4 o;
void main(){
  vec2 t = uTexel;
  float r = texture(uSrc, vUv + t * vec2(-1, -1)).r + texture(uSrc, vUv + t * vec2(0, -1)).r * 2.0 + texture(uSrc, vUv + t * vec2(1, -1)).r
          + texture(uSrc, vUv + t * vec2(-1, 0)).r * 2.0 + texture(uSrc, vUv).r * 4.0 + texture(uSrc, vUv + t * vec2(1, 0)).r * 2.0
          + texture(uSrc, vUv + t * vec2(-1, 1)).r + texture(uSrc, vUv + t * vec2(0, 1)).r * 2.0 + texture(uSrc, vUv + t * vec2(1, 1)).r;
  o = vec4(texture(uBase, vUv).r + r / 16.0 * uMix, 0, 0, 1);
}`;

  const VS_TEXT = `#version 300 es
precision highp float;
in vec2 aP; uniform vec2 uRes; uniform vec3 uCam;
void main(){ vec2 s = (aP - uCam.xy) * uCam.z + uRes * 0.5; vec2 p = s / uRes * 2.0 - 1.0; gl_Position = vec4(p.x, -p.y, 0.0, 1.0); }`;
  const FS_WHITE = `#version 300 es
precision highp float; out vec4 o; void main(){ o = vec4(1.0); }`;

  const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uBg, uText, uLine, uBloom;
uniform vec2 uBgScale, uBgOff;
uniform float uBgBlur, uHasBg, uBgExpo, uBgSat, uGap, uFollow, uOccl, uExpo, uBloomGain, uRefl, uGrain, uCA, uFrame, uFreeze, uFlash;
uniform vec2 uShiftTop, uShiftBot;
uniform vec3 uPaper, uSodium, uDeep, uInk, uBgTint;
uniform float uInvert, uTextOn;
out vec4 o;
${CURVE}
vec3 tonemap(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float textAt(vec2 w){
  vec2 uv = toScreen(w) / uRes;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture(uText, vec2(uv.x, 1.0 - uv.y)).r;
}
void main(){
  vec2 sp = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 px = toWorld(sp);
  float x = px.x / uRes.x;
  float c = curveY(x, 0.0);
  float dy = px.y - c;

  // ---- wordmark, cut by the current
  float follow = (c - uY0) * uFollow;
  float half_ = uGap * 0.5;
  float top = 1.0 - smoothstep(-half_ - 0.75, -half_ + 0.75, dy);
  float bot = smoothstep(half_ - 0.75, half_ + 0.75, dy);
  vec2 caV = vec2(uCA, 0.0);
  vec2 pTop = px - uShiftTop - vec2(0.0, follow);
  vec2 pBot = px - uShiftBot - vec2(0.0, follow * 0.6);
  vec3 tm;
  tm.r = top * textAt(pTop - caV) + bot * textAt(pBot - caV);
  tm.g = top * textAt(pTop) + bot * textAt(pBot);
  tm.b = top * textAt(pTop + caV) + bot * textAt(pBot + caV);
  tm *= uTextOn;
  float ta = tm.g;

  // ---- light
  vec2 lv = texture(uLine, vUv).rg;
  float li = lv.r, lf = lv.g;
  float bl = texture(uBloom, vUv).r;
  // the line on the river: long sodium columns broken by ripples, like streetlights on the Sava
  float cs = toScreen(vec2(px.x, c)).y;
  float dys = sp.y - cs;
  float k1 = uRes.y / 1080.0;
  float wob = (vnoise(sp.y * 0.045 / k1 - uTime * 1.6) * 16.0 + vnoise(sp.y * 0.14 / k1 + uTime * 2.4) * 6.0) * k1 * smoothstep(0.0, 140.0 * k1, dys);
  vec2 suv = vec2((sp.x + wob) / uRes.x, 1.0 - (cs - max(dys, 0.0) * 0.14 - 1.5 * k1) / uRes.y);
  vec2 sl = texture(uLine, suv).rg;
  float glow = texture(uBloom, suv).r;
  float src = (sl.r + sl.g) * 0.6 + glow * 0.8;
  // glints: short horizontal dashes on ripple facets, sparse and irregular, drifting with the current
  vec2 g = vec2(sp.x / k1 * 0.022 - uTime * 0.35, sp.y / k1 * 0.11 + uTime * 0.9);
  float dash = smoothstep(0.58, 0.86, vn2(g) * 0.7 + vn2(g * 2.3 + 5.1) * 0.3);
  float near = exp(-dys / (uRes.y * 0.055));
  float refl = (src * dash * 0.9 + glow * near * 0.35) * smoothstep(3.0 * k1, 14.0 * k1, dys) * exp(-dys / (uRes.y * 0.2)) * uRefl;

  // ---- water
  vec3 bg = vec3(0.0);
  if (uHasBg > 0.5) {
    float bz = 1.0 + (uCam.z - 1.0) * 0.3;
    vec2 cam = (uCam.xy / uRes - 0.5) * vec2(1.0, -1.0) * 0.3;
    vec2 buv = ((vUv - 0.5) / bz + 0.5 + cam) * uBgScale + uBgOff;
    buv.x += 0.0025 * sin(vUv.y * 60.0 + uTime * 1.7) * smoothstep(0.0, 0.5, 1.0 - vUv.y);
    bg = texture(uBg, buv, uBgBlur).rgb;
    bg = pow(bg, vec3(2.2));
    float l = dot(bg, vec3(0.2126, 0.7152, 0.0722));
    bg = mix(vec3(l), bg, uBgSat) * uBgExpo;
    bg *= uBgTint;
  }
  vec3 ink = uInk;
  vec3 col = mix(ink, ink + bg, 1.0);
  vec3 light = uSodium * li * uExpo + uDeep * bl * uBloomGain + uSodium * refl * 0.55;
  col += light * (1.0 - ta * uOccl);
  vec3 paper = uPaper * (0.94 + 0.06 * hash(floor(px * 0.5)));
  vec3 lit = paper * (0.9 + 0.25 * bl) + uDeep * bl * 0.35;
  vec3 textCol = mix(lit, ink, uInvert);
  col = mix(col, textCol, clamp(vec3(tm.r, tm.g, tm.b), 0.0, 1.0));
  col += uDeep * bl * uBloomGain * 0.22 * ta;
  col += uSodium * lf * uExpo;
  col += uSodium * uFlash;

  // ---- finish
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.9;
  col = tonemap(col);
  col = pow(col, vec3(1.0 / 2.2));
  float n = hash(sp + fract(uFrame * 0.6180339) * 1000.0) - 0.5;
  float lum = dot(col, vec3(0.333));
  col += n * uGrain * (0.35 + lum * (1.0 - lum) * 2.6);
  o = vec4(col, 1.0);
}`;

  /* ------------------------------------------------------------------ engine */
  function Engine(canvas, opt) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: !!opt.preserve, stencil: false });
    if (!gl) throw new Error('webgl2');
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('float targets');
    gl.getExtension('OES_texture_float_linear');
    this.gl = gl; this.canvas = canvas; this.opt = opt;
    this.font = opt.font;
    this.word = opt.word || 'СТРУЈА';

    this.pLine = prog(gl, VS_LINE, FS_LINE);
    this.pTrail = prog(gl, VS_QUAD, FS_TRAIL);
    this.pDown = prog(gl, VS_QUAD, FS_DOWN);
    this.pUp = prog(gl, VS_QUAD, FS_UP);
    this.pText = prog(gl, VS_TEXT, FS_WHITE);
    this.pComp = prog(gl, VS_QUAD, FS_COMP);

    // quad
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    // line template strip
    const N = opt.segments || 700;
    const strip = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      strip.set([x, -1, x, 1], i * 4);
    }
    this.nStrip = N * 2;
    this.strip = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.strip);
    gl.bufferData(gl.ARRAY_BUFFER, strip, gl.STATIC_DRAW);
    this.textBuf = gl.createBuffer();

    // rest profile texture
    const prof = new Float32Array(opt.rest);
    this.rest = tex(gl, prof.length, 1, gl.R32F, gl.RED, gl.FLOAT, gl.LINEAR);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, prof.length, 1, gl.RED, gl.FLOAT, prof);
    this.bgTex = tex(gl, 1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.hasBg = false; this.bgAspect = 16 / 9;

    this.pulses = new Float32Array(32);
    this.pulseI = 0;
    this.frame = 0;
    this.resize(opt.width || canvas.width, opt.height || canvas.height);
  }

  Engine.prototype.resize = function (w, h) {
    const gl = this.gl;
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (this.W === w && this.H === h) return;
    this.W = w; this.H = h;
    this.canvas.width = w; this.canvas.height = h;
    const del = (o) => { if (o) { gl.deleteTexture(o.t); gl.deleteFramebuffer(o.f); } };
    [this.lineCur, this.trailA, this.trailB, this.textT].forEach(del);
    (this.mips || []).forEach(del); (this.ups || []).forEach(del);
    this.lineCur = target(gl, w, h, true);
    this.trailA = target(gl, w, h, true);
    this.trailB = target(gl, w, h, true);
    this.mips = []; this.ups = [];
    let mw = w, mh = h;
    for (let i = 0; i < 6; i++) {
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
      this.mips.push(target(gl, mw, mh, true));
      this.ups.push(target(gl, mw, mh, true));
    }
    // text: multisample color + stencil, resolved into a texture
    if (this.msFbo) { gl.deleteFramebuffer(this.msFbo); gl.deleteRenderbuffer(this.msColor); gl.deleteRenderbuffer(this.msStencil); }
    const samples = Math.min(8, gl.getParameter(gl.MAX_SAMPLES));
    this.msFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo);
    this.msColor = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.msColor);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msColor);
    this.msStencil = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.msStencil);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH24_STENCIL8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this.msStencil);
    this.textT = target(gl, w, h, false);
    this.trailFlip = false;
    this.clearTrails = true;
  };

  Engine.prototype.setBackground = function (src) {
    const gl = this.gl;
    if (!src) { this.hasBg = false; return; }
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
    if (w && h) this.bgAspect = w / h;
    this.hasBg = true;
  };

  Engine.prototype.setBackgroundRaw = function (w, h, bytes) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    this.bgAspect = w / h; this.hasBg = true;
  };

  Engine.prototype.pulse = function (t, amp, speed, width) {
    const i = (this.pulseI++ % 8) * 4;
    this.pulses.set([t, amp, speed, width], i);
  };

  // Lay out the word as triangle fans (nonzero winding through the stencil)
  Engine.prototype.buildText = function (s) {
    const f = this.font, word = this.word;
    const scale = s.capPx / f.capHeight;
    const track = s.track || 0;
    let total = 0;
    const gs = [];
    for (const ch of word) {
      const g = f.glyph(ch, s.wdth, s.ctrs, s.slnt);
      gs.push(g); total += g.adv;
    }
    total += track * (word.length - 1);
    let pen = s.cx / scale - total / 2;
    const base = s.cy + s.capPx / 2;
    let nTri = 0;
    for (const g of gs) for (const n of g.contours) nTri += Math.max(0, n - 2);
    const v = this._tv && this._tv.length >= nTri * 6 ? this._tv : (this._tv = new Float32Array(nTri * 6 + 64));
    let k = 0;
    for (const g of gs) {
      let o = 0;
      for (const n of g.contours) {
        const x0 = (pen + g.pts[o * 2]) * scale, y0 = base - g.pts[o * 2 + 1] * scale;
        for (let i = 1; i < n - 1; i++) {
          const a = (o + i) * 2, b = (o + i + 1) * 2;
          v[k++] = x0; v[k++] = y0;
          v[k++] = (pen + g.pts[a]) * scale; v[k++] = base - g.pts[a + 1] * scale;
          v[k++] = (pen + g.pts[b]) * scale; v[k++] = base - g.pts[b + 1] * scale;
        }
        o += n;
      }
      pen += g.adv + track;
    }
    this.textWidth = (total) * scale;
    return k / 2;
  };

  Engine.prototype.drawText = function (s) {
    const gl = this.gl, W = this.W, H = this.H;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    if (s.textOn > 0) {
      const nv = this.buildText(s);
      gl.useProgram(this.pText.p);
      gl.uniform2f(this.pText.u.uRes, W, H);
      gl.uniform3f(this.pText.u.uCam, s.cam[0], s.cam[1], s.cam[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.textBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this._tv.subarray(0, nv * 2), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.STENCIL_TEST);
      gl.colorMask(false, false, false, false);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
      gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
      gl.drawArrays(gl.TRIANGLES, 0, nv);
      gl.colorMask(true, true, true, true);
      gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.drawArrays(gl.TRIANGLES, 0, nv);
      gl.disable(gl.STENCIL_TEST);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.textT.f);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  };

  Engine.prototype.curveUniforms = function (P, s) {
    const gl = this.gl, u = P.u;
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.rest);
    gl.uniform1i(u.uRest, 7);
    gl.uniform2f(u.uRes, this.W, this.H);
    gl.uniform1f(u.uTime, s.time);
    gl.uniform1f(u.uY0, s.y0);
    gl.uniform1f(u.uRestAmp, s.restAmp);
    gl.uniform2f(u.uRestRange, (s.restRange || [0, 1])[0], (s.restRange || [0, 1])[1]);
    gl.uniform1f(u.uFlow, s.flow);
    gl.uniform4f(u.uWave, s.waveLow, s.waveMid, s.waveHigh, 0);
    gl.uniform4fv(u.uPulse, this.pulses);
    gl.uniform3f(u.uPointer, s.pointer[0], s.pointer[1], s.pointer[2]);
    gl.uniform3f(u.uCam, s.cam[0], s.cam[1], s.cam[2]);
  };

  Engine.prototype.quadDraw = function () {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  Engine.prototype.render = function (s) {
    const gl = this.gl, W = this.W, H = this.H;
    const px = s.unit || this.H / 1080;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // 1. line + filaments (additive, HDR)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lineCur.f);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const L = this.pLine;
    gl.useProgram(L.p);
    this.curveUniforms(L, s);
    const core = s.core * px;
    gl.uniform1f(L.u.uCore, core);
    gl.uniform1f(L.u.uHalf, core * 6.0);
    gl.uniform1f(L.u.uSpread, s.spread * px);
    gl.uniform1f(L.u.uGain, s.gain);
    gl.uniform1f(L.u.uStrandGain, s.strandGain);
    gl.uniform1f(L.u.uStrands, Math.max(1, Math.round(s.strands)));
    gl.uniform1f(L.u.uTwist, s.twist);
    gl.uniform1f(L.u.uSpin, s.spin);
    gl.uniform1f(L.u.uFront, s.front);
    gl.uniform1f(L.u.uReveal, s.reveal == null ? 2.0 : s.reveal);
    gl.uniform1f(L.u.uReach, s.reach || 0);
    const cl = s.clip || [0, 1, 0];
    gl.uniform3f(L.u.uClip, cl[0], cl[1], cl[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.strip);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const strands = Math.max(1, Math.round(s.strands));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, this.nStrip, strands);
    gl.disable(gl.BLEND);

    // 2. trails (long exposure)
    if (s.cut) this.clearTrails = true;
    const src = this.trailFlip ? this.trailA : this.trailB;
    const dst = this.trailFlip ? this.trailB : this.trailA;
    this.trailFlip = !this.trailFlip;
    if (this.clearTrails) {
      for (const t of [src, dst]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.f); gl.clear(gl.COLOR_BUFFER_BIT); }
      this.clearTrails = false;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f);
    gl.useProgram(this.pTrail.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lineCur.t);
    gl.uniform1i(this.pTrail.u.uPrev, 0); gl.uniform1i(this.pTrail.u.uCur, 1);
    gl.uniform1f(this.pTrail.u.uDecay, s.freeze ? 1.0 : s.decay);
    gl.uniform2f(this.pTrail.u.uDrift, s.freeze ? 0 : s.drift / W, 0);
    this.quadDraw();
    this.lineOut = dst;

    // 3. bloom
    let prev = dst;
    gl.useProgram(this.pDown.p);
    for (const m of this.mips) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, m.f);
      gl.viewport(0, 0, m.w, m.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, prev.t);
      gl.uniform1i(this.pDown.u.uSrc, 0);
      gl.uniform2f(this.pDown.u.uTexel, 1 / prev.w, 1 / prev.h);
      this.quadDraw();
      prev = m;
    }
    gl.useProgram(this.pUp.p);
    let up = this.mips[this.mips.length - 1];
    for (let i = this.mips.length - 2; i >= 0; i--) {
      const o = this.ups[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, o.f);
      gl.viewport(0, 0, o.w, o.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, up.t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.mips[i].t);
      gl.uniform1i(this.pUp.u.uSrc, 0); gl.uniform1i(this.pUp.u.uBase, 1);
      gl.uniform2f(this.pUp.u.uTexel, 1 / up.w, 1 / up.h);
      gl.uniform1f(this.pUp.u.uMix, i === 0 ? 0.9 : 0.62);
      this.quadDraw();
      up = o;
    }
    this.bloomOut = up;

    // 4. wordmark mask
    this.drawText(s);

    // 5. composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    const C = this.pComp;
    gl.useProgram(C.p);
    this.curveUniforms(C, s);
    const bind = (unit, t, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(C.u[name], unit); };
    bind(0, this.bgTex, 'uBg'); bind(1, this.textT.t, 'uText'); bind(2, dst.t, 'uLine'); bind(3, up.t, 'uBloom');
    // cover-fit background
    const ca = W / H, ba = this.bgAspect * (s.bgZoom || 1);
    let sx = 1, sy = 1;
    if (ca > ba) sy = ba / ca; else sx = ca / ba;
    sx /= (s.bgZoom || 1); sy /= (s.bgZoom || 1);
    gl.uniform2f(C.u.uBgScale, sx, sy);
    gl.uniform2f(C.u.uBgOff, (1 - sx) / 2 + (s.bgPanX || 0), (1 - sy) / 2 + (s.bgPanY || 0));
    gl.uniform1f(C.u.uHasBg, this.hasBg ? 1 : 0);
    gl.uniform1f(C.u.uBgBlur, s.bgBlur == null ? 1.5 : s.bgBlur);
    gl.uniform1f(C.u.uBgExpo, s.bgExpo);
    gl.uniform1f(C.u.uBgSat, s.bgSat);
    gl.uniform1f(C.u.uGap, s.gap * px);
    gl.uniform1f(C.u.uFollow, s.follow);
    gl.uniform1f(C.u.uOccl, s.occl);
    gl.uniform1f(C.u.uExpo, s.expo);
    gl.uniform1f(C.u.uBloomGain, s.bloom);
    gl.uniform1f(C.u.uRefl, s.refl);
    gl.uniform1f(C.u.uGrain, s.grain);
    gl.uniform1f(C.u.uCA, s.ca * px);
    gl.uniform1f(C.u.uFrame, this.frame++);
    gl.uniform1f(C.u.uFlash, s.flash || 0);
    gl.uniform2f(C.u.uShiftTop, s.shiftTop * px, 0);
    gl.uniform2f(C.u.uShiftBot, s.shiftBot * px, 0);
    gl.uniform3fv(C.u.uPaper, s.paper);
    gl.uniform3fv(C.u.uSodium, s.sodium);
    gl.uniform3fv(C.u.uDeep, s.deep);
    gl.uniform3fv(C.u.uInk, s.ink);
    gl.uniform3fv(C.u.uBgTint, s.bgTint || [1, 0.86, 0.7]);
    gl.uniform1f(C.u.uInvert, s.invert || 0);
    gl.uniform1f(C.u.uTextOn, s.textOn);
    this.quadDraw();
  };

  /* ------------------------------------------------------------------ director
     Turns audio features + cues into visual parameters. Shared by the live page
     and the offline film render, so both behave identically. */
  const lin = (c) => c.map((v) => Math.pow(v / 255, 2.2));
  const PAL = {
    sodium: lin([255, 150, 64]),
    deep: lin([255, 92, 14]),
    paper: lin([237, 230, 218]),
    ink: lin([11, 9, 7]),
  };

  function Director(engine, layout) {
    this.e = engine;
    this.layout = layout || {};
    this.env = { bass: 0, mid: 0, high: 0, drop: 0, tension: 0, wd: 0, flowE: 0, ctrs: 0, gap: 0, reach: 0 };
    this.pointer = [0.5, 0, 0];
    this.lastKick = -1;
  }

  Director.prototype.params = function (f, dt) {
    const o = f.o || {}, H = this.e.H, W = this.e.W;
    let p;
    if (f.freeze && this._last) {
      p = this._last;
      if (!p.freeze) {   // the frozen frame is a poster: calm the type down so it reads
        p.follow *= 0.3; p.shiftTop *= 0.6; p.shiftBot *= 0.6; p.flash = 0; p.slnt *= 0.6;
      }
      p.time = f.time; p.freeze = true; p.cut = false;
    } else {
      p = this._params(f, dt);
      if (o.reveal != null) p.reveal = o.reveal;
      if (o.textIntro != null) {
        const q = 1 - o.textIntro;
        p.shiftTop += -q * W * 0.8 / p.unit;
        p.shiftBot += q * W * 0.8 / p.unit;
        p.gap += q * 60;
      }
      if (o.endP != null) {
        // end card: the line lets go of the name and lies down as the river it always was,
        // at its true proportions, ending at Ušće
        const en = Object.assign({ x0: 0.12, x1: 0.8, textY: 0.3, lineY: 0.64, textX: 0.43, textScale: 0.86 }, this.layout.end || {});
        const k = o.endP, mix = (a, b) => a + (b - a) * k;
        p.capPx = mix(p.capPx, p.capPx * en.textScale);   // the name steps back so the Danube can pass it
        const trueAmp = STRUJA.SAVA_RATIO * (en.x1 - en.x0) * W;
        p.restAmp = mix(p.restAmp, trueAmp);
        p.restRange = [mix(0, en.x0), mix(1, en.x1)];
        p.clip = [en.x0, en.x1, k];
        p.y0 = mix(p.y0, en.lineY * H);
        p.cy = mix(p.cy, en.textY * H);
        p.cx = mix(p.cx, en.textX * W);
        p.waveLow *= 1 - k; p.waveMid *= 1 - k; p.waveHigh *= 1 - k;
        p.gap *= 1 - k * 0.6;
      }
    }
    if (o.cam) {
      const c = o.cam;
      p.cam = [W * (0.5 + c[0]), H * (0.5 + c[1]), c[2]];
      if (this._camKey != null && o.camKey !== this._camKey) p.cut = true;
      this._camKey = o.camKey;
    }
    this._last = p;
    return p;
  };
  Director.prototype._params = function (f, dt) {
    // f: {time, bass, mid, high, flux, level, intensity, tension, drop(0/1 event), kick(0/1 event), freeze, text, end}
    const e = this.env, E = this.e, W = E.W, H = E.H, Lo = this.layout;
    const U = Lo.unit === 'w' ? W / 1080 : H / 1080;
    const att = (cur, tgt, a, r) => cur + (tgt - cur) * (1 - Math.exp(-dt / (tgt > cur ? a : r)));
    e.bass = att(e.bass, f.bass, 0.02, 0.18);
    e.mid = att(e.mid, f.mid, 0.03, 0.25);
    e.high = att(e.high, f.high, 0.01, 0.12);
    e.tension = att(e.tension, f.tension || 0, 0.25, 0.08);
    if (f.dropEvent) e.drop = 1;
    e.drop = f.freeze ? e.drop : Math.max(0, e.drop - dt / 1.6);
    const I = f.intensity;
    // the cable opens from the middle at the drop and stays open while the peak lasts
    const reachT = Math.max(e.drop > 0.05 || I > 0.85 ? 1.25 : 0, 0.4 * e.tension);
    e.reach = f.freeze ? e.reach : att(e.reach, reachT, 0.35, 1.2);
    if (f.kick && !f.freeze) {
      const amp = (14 + 46 * I + 30 * e.drop) * U * (f.kickV || 1);
      E.pulse(f.time, amp, 0.9 + 0.5 * I, 0.05 + 0.04 * I);
    }
    const peak = Math.max(e.drop * 0.9, I > 0.85 ? 0.45 + 0.4 * e.bass : 0);
    // typography
    const capPx = (Lo.cap || 0.2) * H;
    const fitW = (frac) => {
      // widest wdth whose word still fits frac of the frame
      let lo = 50, hi = 200;
      for (let i = 0; i < 14; i++) {
        const m = (lo + hi) / 2;
        const w = E.font.advance(E.word, m, 0, 0, Lo.track || 0) * capPx / E.font.capHeight;
        if (w > frac * W) hi = m; else lo = m;
      }
      return lo;
    };
    if (!this._fit || this._fitKey !== W + 'x' + H) {
      this._fitKey = W + 'x' + H;
      this._fit = { rest: fitW(Lo.restFrac || 0.72), peak: fitW(Lo.peakFrac || 0.86), wide: fitW(Lo.wideFrac || 0.98), tight: fitW(Lo.tightFrac || 0.48) };
    }
    const fit = this._fit;
    let wd = fit.rest + (fit.peak - fit.rest) * Math.min(1, 0.2 * e.bass * I + (I > 0.85 ? 0.8 : 0));
    wd = wd + (fit.tight - wd) * e.tension;
    wd = wd + (fit.wide - wd) * Math.min(1, e.drop * e.drop * 1.3);
    e.wd = att(e.wd || wd, wd, 0.03, 0.22);
    e.ctrs = att(e.ctrs, Math.min(85, 85 * (0.15 * e.high * I + 0.95 * peak + 0.6 * e.tension)), 0.02, 0.3);
    e.flowE = att(e.flowE, 0.15 + 0.85 * I, 0.6, 1.2);
    e.gap = att(e.gap, (0.075 + 0.08 * e.bass * I + 0.14 * peak) * capPx, 0.015, 0.2);
    const y0 = (Lo.lineY || 0.5) * H;
    const restAmp = (Lo.restAmp || 0.075) * H * (1 - 0.35 * e.tension);
    const pointer = this.pointer;
    return {
      time: f.time, freeze: !!f.freeze, cam: [W / 2, H / 2, 1], cut: false, unit: U,
      y0, restAmp,
      flow: 0.08 + 0.55 * e.flowE,
      waveLow: (6 + 60 * e.bass * I + 18 * peak) * U * (1 - 0.6 * e.tension),
      waveMid: (3 + 22 * e.mid * I + 8 * peak) * U,
      waveHigh: (1.5 + 14 * e.high * I + 16 * e.tension + 10 * peak) * U,
      pointer: [pointer[0], pointer[1] * H, pointer[2]],
      core: 2.7 + 0.9 * e.bass * I + 1.0 * e.drop,
      spread: (150 * peak + 30 * e.tension),
      reach: e.reach,
      strands: 7,
      twist: 9 + 3 * e.tension,
      spin: 0.12 + 0.12 * e.flowE + 0.1 * peak,
      front: Math.min(1, peak * 1.2),
      gain: 0.95 + 1.2 * e.bass * I + 2.2 * e.drop,
      strandGain: 0.34 + 0.4 * peak,
      decay: 0.66 - 0.1 * peak,
      drift: 0.8 + 5 * peak,
      expo: 1.0,
      bloom: 0.2 + 0.3 * e.drop + 0.16 * e.bass * I,
      refl: Lo.refl == null ? 1.0 : Lo.refl,
      grain: 0.045,
      ca: 0,
      flash: 0.03 * Math.max(0, e.drop - 0.8) * 5,
      bgExpo: (Lo.bgExpo || 0.24) * (0.8 + 0.3 * e.bass * I + 0.3 * e.drop),
      bgSat: 0.7, bgBlur: Lo.bgBlur == null ? 1.6 : Lo.bgBlur,
      bgZoom: 1.04 + 0.03 * e.drop,
      // wordmark
      textOn: f.text == null ? 1 : f.text,
      capPx, cx: W / 2, cy: y0 + (Lo.textDy || 0) * H,
      wdth: e.wd, ctrs: e.ctrs, slnt: -10 * Math.min(1, 0.2 * e.flowE + 0.8 * peak + 0.3 * e.bass * I),
      track: Lo.track || 0,
      gap: e.gap / U,
      follow: 0.08 + 0.3 * peak,
      shiftTop: (16 + 30 * e.bass * I + 40 * peak) * (1 - e.tension),
      shiftBot: -(2 + 8 * e.bass * I + 16 * peak) * (1 - e.tension),
      occl: 1.0,
      paper: PAL.paper, sodium: Lo.sodium ? lin(Lo.sodium) : PAL.sodium, deep: Lo.deep ? lin(Lo.deep) : PAL.deep,
      ink: Lo.ink ? lin(Lo.ink) : PAL.ink, invert: Lo.invert || 0, bgTint: Lo.bgTint || [1, 0.86, 0.7],
    };
  };

  // the Sava's largest meander over the straight line Ostružnica–Ušće (OpenStreetMap): 2.78 km / 20.55 km
  Object.assign(window.STRUJA = window.STRUJA || {}, { Engine, Director, makeFont, PAL, SAVA_RATIO: 0.1352 });
})();
