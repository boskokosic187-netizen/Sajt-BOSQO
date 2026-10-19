/* UMBRA engine. WebGL2, no dependencies. Boško Kosić, 2026.
   One renderer for the live page, the films, the posters and the boards.
   Frame: X = reading direction (the way the shadows point at the key moment), Z = rows (down), Y = up. */
(function (G) {
  'use strict';
  const D2R = Math.PI / 180;

  // ------------------------------------------------------------------ sun (NOAA, same as sun.py)
  function sunUTC(ms, lat, lon) {
    const jd = ms / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
    const L0 = ((280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360 + 360) % 360;
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T), e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    const Mr = M * D2R;
    const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
    const om = 125.04 - 1934.136 * T, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om * D2R);
    const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    const eps = eps0 + 0.00256 * Math.cos(om * D2R);
    const decl = Math.asin(Math.sin(eps * D2R) * Math.sin(lam * D2R));
    const y = Math.tan(eps * D2R / 2) ** 2, L0r = L0 * D2R;
    const eot = 4 / D2R * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
      - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
    const d = new Date(ms), mins = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000;
    const tst = ((mins + eot + 4 * lon) % 1440 + 1440) % 1440, ha = (tst / 4 - 180) * D2R, la = lat * D2R;
    const cz = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha);
    let alt = 90 - Math.acos(Math.max(-1, Math.min(1, cz))) / D2R, ref;
    if (alt > 85) ref = 0;
    else if (alt > 5) { const t = Math.tan(alt * D2R); ref = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5; }
    else if (alt > -0.575) ref = 1735 + alt * (-518.2 + alt * (103.4 + alt * (-12.79 + alt * 0.711)));
    else ref = -20.774 / Math.tan(alt * D2R);
    alt += ref / 3600;
    const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(decl) * Math.cos(la)) / D2R + 180 + 360) % 360;
    return { az, alt };
  }
  function sunLocal(date, minutes, tz, lat, lon) {
    const [y, m, d] = date.split('-').map(Number);
    return sunUTC(Date.UTC(y, m - 1, d) + (minutes - tz * 60) * 60000, lat, lon);
  }

  // ------------------------------------------------------------------ light and air by sun altitude
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const sat = (x) => Math.max(0, Math.min(1, x));
  const ss = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  function air(alt) {
    const day = ss(-1.2, 5, alt), high = ss(3, 45, alt), tw = ss(-12, 0, alt);
    const sunCol = mix([1.0, 0.42, 0.15], mix([1.0, 0.76, 0.46], [1.0, 0.95, 0.88], ss(18, 50, alt)), ss(0, 14, alt));
    const sunI = 3.1 * day * (0.62 + 0.38 * high);
    const zen = mix(mix([0.006, 0.009, 0.022], [0.07, 0.1, 0.23], tw), mix([0.2, 0.31, 0.58], [0.16, 0.34, 0.75], high), day);
    const hor = mix(mix([0.012, 0.016, 0.03], [0.45, 0.27, 0.27], tw), mix([1.0, 0.66, 0.44], [0.66, 0.76, 0.88], ss(4, 30, alt)), day);
    const amb = mix(mix([0.0035, 0.0055, 0.013], [0.018, 0.022, 0.048], tw), mix([0.05, 0.066, 0.125], [0.085, 0.112, 0.18], high), day);
    const E = sunI * Math.max(Math.sin(alt * D2R), 0) + (0.2126 * amb[0] + 0.7152 * amb[1] + 0.0722 * amb[2]);
    const exposure = Math.min(6.8, 1.06 / Math.pow(E, 0.85));
    const glow = 1 - ss(-5, 0.5, alt);
    return { sunCol, sunI, zen, hor, amb, exposure, day, glow };
  }

  // ------------------------------------------------------------------ mat4 (column-major)
  const M4 = {
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy * D2R / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
    ortho(l, r, b, t, n, f) { const o = new Float32Array(16); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o; },
    look(e, c, u) {
      let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; const zl = Math.hypot(...z); z = z.map((v) => v / zl);
      let x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; const xl = Math.hypot(...x) || 1; x = x.map((v) => v / xl);
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]);
    },
    inv(m) {
      const a = m, o = new Float32Array(16);
      const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5];
      const b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6], b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12];
      const b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
      const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
      o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
      o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
      o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
      o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
      return o;
    },
    xf(m, p) { const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]; return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w]; },
  };

  // ------------------------------------------------------------------ shaders
  const HEAD = '#version 300 es\nprecision highp float;precision highp int;precision highp sampler2DShadow;\n';
  const VS_PILLAR = HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aInst;
uniform mat4 uVP; uniform float uClipX; out vec3 vW; out vec3 vN; out vec3 vL; flat out float vH; flat out float vId;
void main(){ vec3 p=vec3(aPos.x*aInst.w+aInst.x, aPos.y*aInst.z, aPos.z*aInst.w+aInst.y);
 if(aInst.x<uClipX){ gl_Position=vec4(2.,2.,2.,1.); return; }
 vW=p; vN=aNrm; vL=vec3(aPos.x*aInst.w, aPos.y*aInst.z, aPos.z*aInst.w); vH=aInst.z; vId=float(gl_InstanceID);
 gl_Position=uVP*vec4(p,1.); }`;
  const FS_DEPTH = HEAD + 'out vec4 o; void main(){ o=vec4(1.); }';
  const VS_GROUND = HEAD + `
layout(location=0) in vec2 aPos; uniform mat4 uVP; uniform float uExtent; out vec3 vW;
void main(){ vW=vec3(aPos.x*uExtent,0.,aPos.y*uExtent); gl_Position=uVP*vec4(vW,1.); }`;
  const VS_FULL = HEAD + `
layout(location=0) in vec2 aPos; out vec2 vUv; void main(){ vUv=aPos*.5+.5; gl_Position=vec4(aPos,0.,1.); }`;

  const LIGHT = `
uniform vec3 uSunDir, uSunCol, uAmb, uZen, uHor, uEye; uniform float uSunI, uDay, uGlow;
uniform mat4 uLVP; uniform sampler2D uDepth; uniform sampler2DShadow uShadow;
uniform vec2 uLSize; uniform float uLRange, uPenK, uSearch, uTexel, uFog; uniform int uTaps; uniform float uMode;
const vec2 PD[24]=vec2[](vec2(-.613,.617),vec2(.170,-.040),vec2(-.299,.792),vec2(.645,.493),vec2(-.651,.718),vec2(.421,.027),
 vec2(-.817,-.271),vec2(-.705,-.668),vec2(.977,-.108),vec2(.063,-.473),vec2(.347,-.970),vec2(-.400,-.130),vec2(.118,.912),
 vec2(-.918,.330),vec2(.770,-.596),vec2(-.193,-.845),vec2(.537,-.414),vec2(-.430,.360),vec2(.882,.383),vec2(-.137,.364),
 vec2(.315,.570),vec2(-.506,-.478),vec2(.210,-.711),vec2(-.032,-.180));
float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715)))); }
float shadowAt(vec3 wp, vec3 n){
 if(uSunI<=0.) return 0.;
 vec3 p=wp+n*uTexel*2.5+uSunDir*uTexel*1.5;
 vec4 lp=uLVP*vec4(p,1.); vec3 c=lp.xyz*.5+.5;
 if(c.x<0.||c.x>1.||c.y<0.||c.y>1.||c.z>1.) return 1.;
 float rot=ign(gl_FragCoord.xy)*6.2831; mat2 R=mat2(cos(rot),sin(rot),-sin(rot),cos(rot));
 float sum=0., cnt=0.;
 for(int i=0;i<16;i++){ vec2 o=R*PD[i]*uSearch; float d=texture(uDepth,c.xy+o/uLSize).r; if(d<c.z){ sum+=d; cnt+=1.; } }
 if(cnt<.5) return 1.;
 float dw=(c.z-sum/cnt)*uLRange; float pw=max(dw*.0093*uPenK, uTexel*1.2);
 float s=0.; for(int i=0;i<24;i++){ if(i>=uTaps) break; vec2 o=R*PD[i]*pw; s+=texture(uShadow,vec3(c.xy+o/uLSize,c.z)); }
 return s/float(uTaps);
}
vec3 skyCol(vec3 d){
 float e=max(d.y,0.); vec3 c=mix(uHor,uZen,pow(e,.55));
 float mu=max(dot(d,uSunDir),0.);
 c+=uSunCol*uDay*(.18*pow(mu,6.)+.5*pow(mu,48.))*(1.-.6*smoothstep(.1,.6,uSunDir.y));
 c=mix(c,uHor*.92,smoothstep(.0,-.08,d.y));
 return c;
}
vec3 fog(vec3 col, vec3 wp){
 vec3 v=wp-uEye; float d=length(v.xz)+abs(v.y)*.04; float f=1.-exp(-d*uFog);
 return mix(col, skyCol(normalize(vec3(v.x,max(v.y,0.),v.z))), f);
}`;

  const FS_GROUND = HEAD + LIGHT + `
in vec3 vW; out vec4 o;
uniform sampler2D uTex, uAO; uniform vec2 uAOmin, uAOmax, uGridOff; uniform float uHasTex, uTexMean;
uniform vec3 uPaper, uInk;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ float a=h21(p); return vec2(a,h21(p+a*17.1)); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
void main(){
 vec2 g=vW.xz;
 vec2 sl=vec2(1.5,.75); vec2 q=(g+uGridOff)/sl; vec2 id=floor(q), f=fract(q);
 vec2 dm=min(f,1.-f)*sl; float j=min(dm.x,dm.y);
 float px=max(length(fwidth(g)),1e-4); float jw=.011;
 float joint=clamp((jw-j)/px+.5,0.,1.)*min(1.,2.5*jw/px);
 vec2 to=h22(id)*9.;
 vec3 alb;
 if(uHasTex>.5){ vec3 t=texture(uTex,(g+to)/2.6).rgb/uTexMean; alb=vec3(.64,.625,.6)*mix(vec3(1.),t,.85); }
 else { float n=vn(g*3.1+to)*.5+vn(g*11.+to)*.3+vn(g*37.)*.2; alb=vec3(.64,.625,.6)*(.9+.2*n); }
 alb*=.95+.08*h21(id+3.7);
 alb*=1.-joint*.55;
 float big=vn(g*.08)*.6+vn(g*.31)*.4; alb*=.96+.06*big;
 vec2 au=(g-uAOmin)/(uAOmax-uAOmin); float ao=1.;
 if(au.x>0.&&au.x<1.&&au.y>0.&&au.y<1.) ao=texture(uAO,au).r;
 float sh=shadowAt(vW,vec3(0,1,0));
 float nl=max(uSunDir.y,0.);
 vec3 col;
 if(uMode>1.5){ o=vec4(0.,0.,0.,1.); return; }
 if(uMode>.5){ // graphic: paper and ink
  col=mix(uInk,uPaper,mix(1.,sh,smoothstep(0.,.02,uSunDir.y)))*mix(.82,1.,ao); col=mix(col,uInk,joint*.06);
  o=vec4(col,1.); return; }
 col=alb*(uSunCol*uSunI*nl*sh + uAmb*ao*(.85+.15*nl));
 col+=vec3(1.,.78,.52)*uGlow*pow(1.-ao,4.)*.45;
 col=fog(col,vW);
 o=vec4(col,1.);
}`;

  const FS_PILLAR = HEAD + LIGHT + `
in vec3 vW; in vec3 vN; in vec3 vL; flat in float vH; flat in float vId; out vec4 o;
uniform vec3 uPaper, uInk; uniform float uHmax, uHi; uniform int uCity;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
void main(){
 vec3 n=normalize(vN);
 vec2 st=abs(n.y)>.5?vL.xz:(abs(n.x)>.5?vL.zy:vL.xy);
 float tx=vn(st*9.+vId*3.1)*.55+vn(st*31.+vId)*.3+vn(st*90.)*.15;
 vec3 alb=vec3(.86,.85,.82)*(.93+.12*tx);
 float top=step(.5,n.y);
 alb*=mix(1.,1.04,top);
 float fao=mix(1.-.42*exp(-vW.y/.32), 1., top);
 float sh=uCity==1?1.:shadowAt(vW,n);
 float nl=max(dot(n,uSunDir),0.);
 if(uCity==1){ alb=vec3(.34,.33,.32)*(.7+.4*fract(vId*.618)); fao=1.; float win=step(.55,fract(vW.y/3.2))*step(.35,fract((vW.x+vW.z)/2.9))*(1.-top); alb*=1.-.12*win; }
 // pick-out of the edges so the white blocks keep their shape on white paper
 vec2 e=abs(vL.xz)/(vec2(.5)*1.);
 if(uMode>1.5){ o=vec4(1.,1.,1.,1.); return; }
 if(uMode>.5){
  vec3 c=top>.5?vec3(1.):mix(uPaper,uInk,.25+.35*(1.-nl));
  if(uHi>0.){ float k=clamp(vH/uHmax,0.,1.); c=mix(vec3(.93,.92,.9),vec3(.2,.27,1.),k); c*=mix(1.,.82,1.-top); }
  o=vec4(c,1.); return; }
 vec3 bounce=vec3(.64,.62,.58)*uSunCol*uSunI*max(uSunDir.y,0.)*.22*(1.-max(n.y,0.));
 vec3 col=alb*(uSunCol*uSunI*nl*sh + uAmb*fao*(.55+.45*max(n.y,0.)) + bounce*fao);
 if(uHi>0.){ float k=clamp(vH/uHmax,0.,1.); col=mix(col, col*vec3(.35,.45,1.6), .8*k); }
 col+=vec3(1.,.84,.62)*uGlow*(top*1.8+(1.-top)*.06*exp(-(vH-vW.y)*3.));
 if(uCity==1){ vec3 v=vW-uEye; float f=1.-exp(-length(v.xz)*max(uFog,.0006)*2.1); col=mix(col, skyCol(normalize(vec3(v.x,max(v.y,0.),v.z))), f); }
 else col=fog(col,vW);
 o=vec4(col,1.);
}`;

  const FS_SKY = HEAD + LIGHT + `
in vec2 vUv; out vec4 o; uniform mat4 uInvVP; uniform float uOrtho;
void main(){
 if(uMode>1.5){ o=vec4(0.,0.,0.,1.); return; }
 vec4 a=uInvVP*vec4(vUv*2.-1.,-1.,1.), b=uInvVP*vec4(vUv*2.-1.,1.,1.);
 vec3 d=normalize(b.xyz/b.w-a.xyz/a.w);
 o=vec4(skyCol(d),1.);
}`;

  const FS_AO = HEAD + `
in vec2 vUv; out vec4 o; uniform sampler2D uP; uniform int uN; uniform vec2 uMin, uMax;
void main(){
 vec2 g=mix(uMin,uMax,vUv); float occ=0.;
 for(int i=0;i<2048;i++){ if(i>=uN) break; vec4 p=texelFetch(uP,ivec2(i,0),0);
  vec2 d2=max(abs(g-p.xy)-vec2(p.w*.5),0.); float d=length(d2);
  if(d>3.) continue;
  float el=atan(p.z,d+.015); float w=2.*atan(p.w*.5,d+p.w*.5);
  occ+=(w/6.2831)*pow(sin(el),1.6)*1.25; }
 o=vec4(vec3(clamp(1.-occ,0.,1.)),1.);
}`;

  const FS_POST = HEAD + `
in vec2 vUv; out vec4 o; uniform sampler2D uHdr; uniform float uExposure, uVig, uGrain, uSeed, uSat, uW, uRaw; uniform vec3 uLift, uGain;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uSeed)*43758.5453); }
void main(){
 vec3 c=texture(uHdr,vUv).rgb*uExposure;
 if(uRaw>.5){ o=vec4((c+(h(gl_FragCoord.xy)-.5)/255.)*uW,uW); return; }
 c=aces(c);
 float l=dot(c,vec3(.2126,.7152,.0722)); c=max(mix(vec3(l),c,uSat),0.);
 c=c*uGain+uLift*(1.-c);
 vec2 q=vUv-.5; c*=1.-uVig*dot(q,q)*1.6;
 c=pow(max(c,0.),vec3(1./2.2));
 c+=(h(gl_FragCoord.xy)-.5)*(1./255.+uGrain)*step(.999,uW);
 o=vec4(c*uW,uW);
}`;

  const FS_COPY = HEAD + `in vec2 vUv; out vec4 o; uniform sampler2D uT; float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){ vec4 c=texture(uT,vUv); o=vec4(c.rgb/max(c.a,1e-4)+(h(gl_FragCoord.xy)-.5)/255.,1.); }`;

  function compile(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) + '\n' + s.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }

  function box() {
    const P = [], N = [], I = [];
    const faces = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
    for (const [n, u, v] of faces) {
      const b = P.length / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const c = [0, 1, 2].map((k) => n[k] * 0.5 + u[k] * 0.5 * su + v[k] * 0.5 * sv);
        P.push(c[0], c[1] + 0.5, c[2]); N.push(...n);
      }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    return { P: new Float32Array(P), N: new Float32Array(N), I: new Uint16Array(I) };
  }

  // ------------------------------------------------------------------ engine
  class Engine {
    constructor(canvas, opt) {
      this.canvas = canvas; this.opt = Object.assign({ shadowSize: 4096, samples: 4, aoW: 4096, taps: 24, penK: 1.0, hdr: true }, opt);
      const gl = this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, preserveDrawingBuffer: !!opt.preserve, powerPreference: 'high-performance' });
      if (!gl) throw new Error('no webgl2');
      this.hdr = this.opt.hdr && !!gl.getExtension('EXT_color_buffer_float');
      const D = this.data = opt.data;
      this.cx = D.size[0] / 2; this.cz = D.size[1] / 2;
      const inst = new Float32Array(D.pillars.length * 4);
      let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
      D.pillars.forEach(([u, v, h], i) => {
        const x = u - this.cx, z = v - this.cz; inst.set([x, z, h, D.side], i * 4);
        mnx = Math.min(mnx, x - D.side); mxx = Math.max(mxx, x + D.side); mnz = Math.min(mnz, z - D.side); mxz = Math.max(mxz, z + D.side);
      });
      this.inst = inst; this.N = D.pillars.length; this.bounds = [mnx, mxx, mnz, mxz];
      // a hazy ring of city blocks far beyond the plaza, so low views have a horizon
      let seed = 1346; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const city = [];
      for (let i = 0; i < 900; i++) {
        const a = rnd() * Math.PI * 2, r = 330 + Math.pow(rnd(), 0.8) * 760;
        const big = rnd() < 0.12, w = big ? 16 + rnd() * 18 : 8 + rnd() * 16, h = big ? 34 + rnd() * 38 : 7 + rnd() * 17;
        city.push(Math.cos(a) * r, Math.sin(a) * r, h, w);
      }
      this.city = new Float32Array(city); this.NC = city.length / 4;
      this.progs = {
        depth: compile(gl, VS_PILLAR, FS_DEPTH), pillar: compile(gl, VS_PILLAR, FS_PILLAR), ground: compile(gl, VS_GROUND, FS_GROUND),
        sky: compile(gl, VS_FULL, FS_SKY), ao: compile(gl, VS_FULL, FS_AO), post: compile(gl, VS_FULL, FS_POST), copy: compile(gl, VS_FULL, FS_COPY),
      };
      // geometry
      const B = box();
      this.boxVAO = gl.createVertexArray(); gl.bindVertexArray(this.boxVAO);
      const buf = (data, loc, size, div) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); if (div) gl.vertexAttribDivisor(loc, 1); return b; };
      const pb = buf(B.P, 0, 3), nb = buf(B.N, 1, 3); this.instBuf = buf(inst, 2, 4, 1);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, B.I, gl.STATIC_DRAW);
      this.cityVAO = gl.createVertexArray(); gl.bindVertexArray(this.cityVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      buf(this.city, 2, 4, 1); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      this.quadVAO = gl.createVertexArray(); gl.bindVertexArray(this.quadVAO);
      buf(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), 0, 2);
      gl.bindVertexArray(null);
      // shadow map
      const S = this.opt.shadowSize;
      this.shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, S, S);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.shFBO = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shTex, 0);
      gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      this.sampRaw = gl.createSampler(); gl.samplerParameteri(this.sampRaw, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.samplerParameteri(this.sampRaw, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.samplerParameteri(this.sampRaw, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.samplerParameteri(this.sampRaw, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.sampCmp = gl.createSampler(); gl.samplerParameteri(this.sampCmp, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.samplerParameteri(this.sampCmp, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.samplerParameteri(this.sampCmp, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.samplerParameteri(this.sampCmp, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      gl.samplerParameteri(this.sampCmp, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.samplerParameteri(this.sampCmp, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // ground texture
      this.gTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.gTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 200, 200, 255]));
      this.hasTex = 0; this.texMean = 1;
      if (opt.groundImage) this.setGround(opt.groundImage, opt.groundMean || 0.78);
      this.buildAO();
      this.resize(opt.width || canvas.width, opt.height || canvas.height);
    }

    setGround(img, mean) {
      const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.gTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      const an = gl.getExtension('EXT_texture_filter_anisotropic'); if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      this.hasTex = 1; this.texMean = mean;
    }

    buildAO() {
      const gl = this.gl, [mnx, mxx, mnz, mxz] = this.bounds, m = 3.2;
      this.aoMin = [mnx - m, mnz - m]; this.aoMax = [mxx + m, mxz + m];
      const W = this.opt.aoW, H = Math.max(64, Math.round(W * (this.aoMax[1] - this.aoMin[1]) / (this.aoMax[0] - this.aoMin[0])));
      const pt = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, pt);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.N, 1, 0, gl.RGBA, gl.FLOAT, this.inst);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.aoTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.aoTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.aoTex, 0);
      gl.viewport(0, 0, W, H);
      const P = this.progs.ao; gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pt); gl.uniform1i(P.u.uP, 0);
      gl.uniform1i(P.u.uN, this.N); gl.uniform2fv(P.u.uMin, this.aoMin); gl.uniform2fv(P.u.uMax, this.aoMax);
      gl.bindVertexArray(this.quadVAO); gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(pt);
    }

    resize(w, h) {
      const gl = this.gl; this.W = w; this.H = h; this.canvas.width = w; this.canvas.height = h;
      for (const k of ['msFBO', 'rsFBO']) if (this[k]) gl.deleteFramebuffer(this[k]);
      for (const k of ['msCol', 'msDep']) if (this[k]) gl.deleteRenderbuffer(this[k]);
      if (this.rsTex) gl.deleteTexture(this.rsTex);
      const fmt = this.hdr ? gl.RGBA16F : gl.RGBA8, samples = Math.min(this.opt.samples, gl.getParameter(gl.MAX_SAMPLES));
      this.msCol = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.msCol);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, w, h);
      this.msDep = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.msDep);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
      this.msFBO = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFBO);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msCol);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.msDep);
      this.rsTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.rsTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.rsFBO = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.rsFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.rsTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    sun(minutes, date) {
      const D = this.data; return sunLocal(date || D.date, minutes, D.tz, D.lat, D.lon);
    }

    // direction toward the sun in the installation frame
    sunDir(az, alt) {
      const b = this.data.bearing, a = (az - b) * D2R, c = Math.cos(alt * D2R);
      return [c * Math.cos(a), Math.sin(alt * D2R), c * Math.sin(a)];
    }

    // st: {minutes | sun:{az,alt}, cam:{pos,target,up,fov|ortho}, mode, hi, exposure, grain, vignette}
    render(st) {
      const gl = this.gl, D = this.data, o = this.opt;
      const s = st.sun || this.sun(st.minutes, st.date);
      const drawP = st.pillars !== false, clipX = st.clipX == null ? -1e9 : st.clipX;
      this.last = s;
      const A = air(s.alt);
      const L = this.sunDir(s.az, s.alt);
      const sunI = A.sunI * (st.sunGain == null ? 1 : st.sunGain);
      // camera
      const cam = st.cam, asp = this.W / this.H;
      const V = M4.look(cam.pos, cam.target, cam.up || [0, 1, 0]);
      const dist = Math.hypot(cam.pos[0] - cam.target[0], cam.pos[1] - cam.target[1], cam.pos[2] - cam.target[2]);
      const P = cam.ortho ? M4.ortho(-cam.ortho * asp, cam.ortho * asp, -cam.ortho, cam.ortho, 0.5, dist * 3 + 200) : M4.persp(cam.fov || 40, asp, 0.2, 2400);
      const VP = M4.mul(P, V);
      // light
      const [mnx, mxx, mnz, mxz] = this.bounds, hm = D.hmax;
      const ctr = [(mnx + mxx) / 2, hm / 2, (mnz + mxz) / 2];
      const up = Math.abs(L[1]) > 0.985 ? [0, 0, -1] : [0, 1, 0];
      const LV = M4.look([ctr[0] + L[0] * 200, ctr[1] + L[1] * 200, ctr[2] + L[2] * 200], ctr, up);
      let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, bz0 = 1e9, bz1 = -1e9;
      for (const x of [mnx, mxx]) for (const y of [0, hm]) for (const z of [mnz, mxz]) {
        const q = M4.xf(LV, [x, y, z]); bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); by0 = Math.min(by0, q[1]); by1 = Math.max(by1, q[1]); bz0 = Math.min(bz0, -q[2]); bz1 = Math.max(bz1, -q[2]);
      }
      const mg = 0.6; bx0 -= mg; bx1 += mg; by0 -= mg; by1 += mg;
      const sinA = Math.max(Math.sin(Math.max(s.alt, 0.5) * D2R), 0.0087);
      const near = bz0 - 2, far = bz1 + Math.min(hm / sinA, 900) + 4;
      const LP = M4.ortho(bx0, bx1, by0, by1, near, far), LVP = M4.mul(LP, LV);
      const lsz = [bx1 - bx0, by1 - by0], texel = Math.max(lsz[0], lsz[1]) / o.shadowSize;
      if (sunI > 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFBO); gl.viewport(0, 0, o.shadowSize, o.shadowSize);
        gl.enable(gl.DEPTH_TEST); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
        gl.colorMask(false, false, false, false);
        const Pd = this.progs.depth; gl.useProgram(Pd.p); gl.uniformMatrix4fv(Pd.u.uVP, false, LVP); gl.uniform1f(Pd.u.uClipX, clipX);
        if (drawP) { gl.bindVertexArray(this.boxVAO); gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, this.N); }
        gl.disable(gl.POLYGON_OFFSET_FILL); gl.colorMask(true, true, true, true);
      }
      // main pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFBO); gl.viewport(0, 0, this.W, this.H);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const paper = st.paper || [0.945, 0.933, 0.906], ink = st.ink || [0.086, 0.078, 0.07];
      const mode = st.mode === 'mask' ? 2 : st.mode === 'graphic' ? 1 : 0;
      const searchW = Math.min(hm / sinA, 120) * 0.0093 * o.penK + texel * 2;
      const common = (Pr) => {
        const u = Pr.u; gl.useProgram(Pr.p);
        gl.uniform3fv(u.uSunDir, L); gl.uniform3fv(u.uSunCol, A.sunCol); gl.uniform1f(u.uSunI, sunI); gl.uniform1f(u.uDay, A.day); gl.uniform1f(u.uGlow, A.glow * (st.glow == null ? 1 : st.glow));
        gl.uniform3fv(u.uAmb, A.amb.map((v) => v * (st.ambGain || 1))); gl.uniform3fv(u.uZen, A.zen); gl.uniform3fv(u.uHor, A.hor); gl.uniform3fv(u.uEye, cam.pos);
        gl.uniformMatrix4fv(u.uLVP, false, LVP); gl.uniform2fv(u.uLSize, lsz); gl.uniform1f(u.uLRange, far - near);
        gl.uniform1f(u.uPenK, o.penK); gl.uniform1f(u.uSearch, searchW); gl.uniform1f(u.uTexel, texel); gl.uniform1i(u.uTaps, o.taps);
        gl.uniform1f(u.uFog, st.fog == null ? 0.0009 : st.fog); gl.uniform1f(u.uMode, mode);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.bindSampler(0, this.sampRaw); gl.uniform1i(u.uDepth, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.bindSampler(1, this.sampCmp); gl.uniform1i(u.uShadow, 1);
        if (u.uPaper) { gl.uniform3fv(u.uPaper, paper); gl.uniform3fv(u.uInk, ink); }
      };
      // sky
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      const Ps = this.progs.sky; common(Ps); gl.uniformMatrix4fv(Ps.u.uInvVP, false, M4.inv(VP));
      gl.bindVertexArray(this.quadVAO); gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
      // ground
      const Pg = this.progs.ground; common(Pg);
      gl.uniformMatrix4fv(Pg.u.uVP, false, VP); gl.uniform1f(Pg.u.uExtent, 1500);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.gTex); gl.bindSampler(2, null); gl.uniform1i(Pg.u.uTex, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.aoTex); gl.bindSampler(3, null); gl.uniform1i(Pg.u.uAO, 3);
      gl.uniform2fv(Pg.u.uAOmin, this.aoMin); gl.uniform2fv(Pg.u.uAOmax, this.aoMax);
      gl.uniform2fv(Pg.u.uGridOff, [this.cx, this.cz]); gl.uniform1f(Pg.u.uHasTex, this.hasTex); gl.uniform1f(Pg.u.uTexMean, this.texMean);
      gl.bindVertexArray(this.quadVAO); gl.drawArrays(gl.TRIANGLES, 0, 6);
      // pillars
      const Pp = this.progs.pillar; common(Pp);
      gl.uniformMatrix4fv(Pp.u.uVP, false, VP); gl.uniform1f(Pp.u.uHmax, hm); gl.uniform1f(Pp.u.uHi, st.hi || 0);
      gl.uniform1f(Pp.u.uClipX, clipX);
      gl.enable(gl.CULL_FACE); gl.bindVertexArray(this.boxVAO); if (drawP) gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, this.N);
      gl.uniform1f(Pp.u.uClipX, -1e9);
      if (st.city !== false && !mode) {
        gl.uniform1f(Pp.u.uHi, 0); gl.uniform1f(Pp.u.uGlow, 0); gl.uniform1i(Pp.u.uCity, 1);
        gl.bindVertexArray(this.cityVAO); gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, this.NC);
        gl.uniform1i(Pp.u.uCity, 0);
      }
      gl.disable(gl.CULL_FACE);
      // resolve + post
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFBO); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.rsFBO);
      gl.blitFramebuffer(0, 0, this.W, this.H, 0, 0, this.W, this.H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, st._acc ? this.accFBO : null); gl.viewport(0, 0, this.W, this.H); gl.disable(gl.DEPTH_TEST);
      if (st._acc) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); }
      const Pp2 = this.progs.post; gl.useProgram(Pp2.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindSampler(0, null); gl.bindTexture(gl.TEXTURE_2D, this.rsTex); gl.uniform1i(Pp2.u.uHdr, 0);
      gl.uniform1f(Pp2.u.uExposure, mode ? 1 : A.exposure * (st.exposure || 1));
      gl.uniform1f(Pp2.u.uRaw, mode ? 1 : 0);
      gl.uniform1f(Pp2.u.uW, st._acc || 1);
      gl.uniform1f(Pp2.u.uVig, st.vignette == null ? 0.22 : st.vignette); gl.uniform1f(Pp2.u.uGrain, st.grain || 0); gl.uniform1f(Pp2.u.uSeed, (st.seed || 0) % 97);
      gl.uniform3fv(Pp2.u.uLift, st.lift || [0.004, 0.005, 0.012]); gl.uniform3fv(Pp2.u.uGain, st.gain || [1, 1, 1]); gl.uniform1f(Pp2.u.uSat, mode ? 1 : (st.sat || 1.25));
      if (mode) { gl.uniform3fv(Pp2.u.uLift, [0, 0, 0]); }
      gl.bindVertexArray(this.quadVAO); gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND); gl.bindVertexArray(null);
      return s;
    }

    // motion blur: average several states (e.g. the same camera across a 180-degree shutter)
    renderBlur(states) {
      const gl = this.gl;
      if (!this.accFBO || this.accW !== this.W || this.accH !== this.H) {
        if (this.accTex) { gl.deleteTexture(this.accTex); gl.deleteFramebuffer(this.accFBO); }
        this.accTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.accTex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, this.hdr ? gl.RGBA32F : gl.RGBA8, this.W, this.H);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        this.accFBO = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.accFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accTex, 0);
        this.accW = this.W; this.accH = this.H;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.accFBO); gl.viewport(0, 0, this.W, this.H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      let s; const w = 1 / states.length;
      for (const st of states) s = this.render(Object.assign({}, st, { _acc: w }));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.W, this.H);
      const P = this.progs.copy; gl.useProgram(P.p); gl.activeTexture(gl.TEXTURE0); gl.bindSampler(0, null); gl.bindTexture(gl.TEXTURE_2D, this.accTex); gl.uniform1i(P.u.uT, 0);
      gl.bindVertexArray(this.quadVAO); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.bindVertexArray(null);
      return s;
    }

    // project a world point to canvas pixels (for overlays)
    project(p, cam) {
      const asp = this.W / this.H, V = M4.look(cam.pos, cam.target, cam.up || [0, 1, 0]);
      const dist = Math.hypot(cam.pos[0] - cam.target[0], cam.pos[1] - cam.target[1], cam.pos[2] - cam.target[2]);
      const P = cam.ortho ? M4.ortho(-cam.ortho * asp, cam.ortho * asp, -cam.ortho, cam.ortho, 0.5, dist * 3 + 200) : M4.persp(cam.fov || 40, asp, 0.2, 2400);
      const q = M4.xf(M4.mul(P, V), p); return [(q[0] * 0.5 + 0.5) * this.W, (0.5 - q[1] * 0.5) * this.H];
    }
  }

  G.UMBRA = { Engine, sunLocal, sunUTC, air, M4 };
})(typeof window !== 'undefined' ? window : globalThis);
