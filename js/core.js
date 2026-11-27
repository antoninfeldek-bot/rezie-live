'use strict';
/* ============================================================
   RÉŽIE LIVE – webová režie pro živé vysílání
   ============================================================ */
const [W, H] = CFG.base();   // rozlišení plátna (⚙ Nastavení → Obraz)
const PVH = 540, PVW = Math.round(540 * W / H / 2) * 2;   // náhled se stejným poměrem stran
const $ = s => document.querySelector(s) || POP.q(s);   // hledá i ve stránkách otevřených v samostatném okně
const $$ = s => [...document.querySelectorAll(s), ...POP.all(s)];
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const IC = {camera:'📷', screen:'🖥', video:'🎞', image:'🖼', text:'🔤', color:'🎨', mic:'🎤', guest:'👤', replay:'⏪', playlist:'📃', slides:'🗂', web:'🌐', netin:'📡', ndiin:'🔗', v360:'🌐'};
const icon = s => s ? (IC[s.type] || '•') : '⚠';
const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;


const S = {
  sources: [], scenes: [], previewId: null, programId: null, selLayer: null,
  trans: {dur: 600, swap: true}, active: null, picking: false,
  streamCfg: null
};
const R = {
  rec: null, iso: [], stream: null, recordings: [], meters: [], monitor: false,
  wins: {program: null, multi: null},
  prompter: {text: L('Dobrý večer, vítejte u našeho živého vysílání.\n\nSem si napiš text, který bude moderátor číst.'), speed: 60, size: 64, mirror: false, playing: false, pos: 0, win: null}
};

const srcById = id => S.sources.find(s => s.id === id);
const sceneById = id => S.scenes.find(s => s.id === id);
const prevScene = () => sceneById(S.previewId);
const selLayerObj = () => { const sc = prevScene(); return sc ? sc.layers.find(l => l.id === S.selLayer) : null; };
function setPath(o, p, v) { const k = p.split('.'); let x = o; for (let i = 0; i < k.length - 1; i++) x = x[k[i]]; x[k[k.length - 1]] = v; }
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
function rgb2hex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
function val(el) { if (el.type === 'checkbox') return el.checked; if (el.type === 'number' || el.type === 'range') { const n = parseFloat(el.value); return isNaN(n) ? null : n; } return el.value; }
const fmtT = ms => { const s = Math.floor(ms / 1000); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':'); };
const stamp = () => { const d = new Date(), p = v => String(v).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; };
const safe = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_');
const dbTxt = v => v <= 0.001 ? '−∞' : (20 * Math.log10(v)).toFixed(1);

/* ================= WebGL renderer (vrstvy + chroma key) ================= */
const glc = document.createElement('canvas'); glc.width = W; glc.height = H;
// preserveDrawingBuffer: false – obraz se kopíruje hned po vykreslení, takže GPU nemusí každý snímek dělat kopii navíc
const gl = glc.getContext('webgl', {alpha:false, antialias:false, preserveDrawingBuffer:false, premultipliedAlpha:false, powerPreference:'high-performance', desynchronized:true});
const VS = `attribute vec2 a;uniform vec4 r;uniform vec4 cr;varying vec2 v;
void main(){vec2 p=r.xy+a*r.zw;vec2 c=p/vec2(${W}.0,${H}.0)*2.0-1.0;gl_Position=vec4(c.x,-c.y,0.0,1.0);
v=vec2(mix(cr.x,1.0-cr.z,a.x),mix(cr.y,1.0-cr.w,a.y));}`;
const FS = `precision mediump float;uniform sampler2D t;uniform float op;uniform float key;uniform vec3 kc;
uniform float sim;uniform float smo;uniform float spl;varying vec2 v;
uniform sampler2D lut;uniform float lutOn;uniform float lutN;uniform float lutCols;uniform vec2 lutTex;uniform float lutMix;
uniform sampler2D crv;uniform float crvOn;uniform float gradeOn;
uniform float ex;uniform float tmp;uniform float tnt;uniform float con;uniform float piv;uniform float sat;uniform float hue;
uniform vec3 lift;uniform vec3 gam;uniform vec3 gain;uniform vec3 offs;
const vec3 LW=vec3(0.2126,0.7152,0.0722);
vec2 cuv(vec3 c){return vec2(c.r*-0.169+c.g*-0.331+c.b*0.5+0.5,c.r*0.5+c.g*-0.419+c.b*-0.081+0.5);}
vec3 lutS(vec3 c){float n=lutN;float b=c.b*(n-1.0);float b0=floor(b);float b1=min(b0+1.0,n-1.0);float f=b-b0;
vec2 xy=vec2(c.r*(n-1.0)+0.5,c.g*(n-1.0)+0.5);
vec2 t0=vec2(mod(b0,lutCols),floor(b0/lutCols))*n;vec2 t1=vec2(mod(b1,lutCols),floor(b1/lutCols))*n;
return mix(texture2D(lut,(t0+xy)/lutTex).rgb,texture2D(lut,(t1+xy)/lutTex).rgb,f);}
void main(){vec4 c=texture2D(t,v);float a=c.a;
if(key>0.5){float d=distance(cuv(c.rgb),cuv(kc));float b=d-sim;
float m=pow(clamp(b/smo,0.0,1.0),1.5);float sv=pow(clamp(b/spl,0.0,1.0),1.5);
float l=dot(c.rgb,LW);c.rgb=mix(vec3(l),c.rgb,sv);a*=m;}
if(gradeOn>0.5){
c.rgb*=ex;c.r+=tmp*0.08;c.b-=tmp*0.08;c.g-=tnt*0.08;c.rgb=clamp(c.rgb,0.0,1.0);
if(lutOn>0.5){c.rgb=mix(c.rgb,lutS(c.rgb),lutMix);}
c.rgb=c.rgb*gain+lift*(1.0-c.rgb)+offs;
c.rgb=pow(max(c.rgb,0.0),1.0/max(gam,vec3(0.05)));
c.rgb=(c.rgb-piv)*con+piv;
float L=dot(c.rgb,LW);c.rgb=mix(vec3(L),c.rgb,sat);
if(abs(hue)>0.0005){float ca=cos(hue);float sa=sin(hue);vec3 k=vec3(0.57735);c.rgb=c.rgb*ca+cross(k,c.rgb)*sa+k*dot(k,c.rgb)*(1.0-ca);}
c.rgb=clamp(c.rgb,0.0,1.0);
if(crvOn>0.5){c.r=texture2D(crv,vec2(c.r*0.99609+0.00195,0.5)).r;c.g=texture2D(crv,vec2(c.g*0.99609+0.00195,0.5)).g;c.b=texture2D(crv,vec2(c.b*0.99609+0.00195,0.5)).b;}
}
gl_FragColor=vec4(c.rgb,a*op);}`;
const U = {};
if (gl) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
  const glProg = gl.createProgram();
  gl.attachShader(glProg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(glProg); gl.useProgram(glProg);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 1,1]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(glProg, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  ['r','cr','t','op','key','kc','sim','smo','spl','lut','lutOn','lutN','lutCols','lutTex','lutMix','ex','tmp','tnt','con','sat','crv','crvOn','gradeOn','piv','hue','lift','gam','gain','offs'].forEach(n => U[n] = gl.getUniformLocation(glProg, n));
  gl.uniform1i(U.t, 0); gl.uniform1i(U.lut, 1); gl.uniform1i(U.crv, 2);
}

/* ================= LUTy (.cube) ================= */
const COLOR_DEF = {exp:0, temp:0, tint:0, con:1, piv:0.435, sat:1, hue:0, lut:null, mix:1,
  lift:[0,0,0], liftY:0, gam:[0,0,0], gamY:0, gain:[0,0,0], gainY:0, offs:[0,0,0], offsY:0, curves:null};
const colorDefault = () => JSON.parse(JSON.stringify(COLOR_DEF));
const fixColor = c => Object.assign(colorDefault(), c ? JSON.parse(JSON.stringify(c)) : {});
const colorOf = s => s.color || (s.color = colorDefault());
S.luts = [];
const lutById = id => S.luts.find(l => l.id === id);
function parseCube(txt, name) {
  let n = 0; const vals = [];
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l[0] === '#') continue;
    const k = l.split(/\s+/);
    if (k[0] === 'LUT_3D_SIZE') n = +k[1];
    else if (k[0] === 'LUT_1D_SIZE') throw new Error('Tohle je 1D LUT. Potřebuju 3D LUT (.cube) – v DaVinci: Export LUT → 33 Point Cube.');
    else if (/^[-+\d.]/.test(k[0]) && k.length >= 3) vals.push(+k[0], +k[1], +k[2]);
  }
  if (!n || n > 129 || vals.length < n * n * n * 3) throw new Error('Soubor není platný 3D LUT (.cube).');
  const d = new Uint8Array(n * n * n * 3);
  for (let i = 0; i < d.length; i++) d[i] = clamp(Math.round(vals[i] * 255), 0, 255);
  return {id:uid(), name, n, d};
}
function lutTexture(L) {
  if (L.tex) return L.tex;
  const n = L.n, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), w = cols * n, h = rows * n, px = new Uint8Array(w * h * 4);
  for (let b = 0; b < n; b++) {
    const tx = (b % cols) * n, ty = Math.floor(b / cols) * n;
    for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
      const si = (r + g * n + b * n * n) * 3, di = ((ty + g) * w + tx + r) * 4;
      px[di] = L.d[si]; px[di + 1] = L.d[si + 1]; px[di + 2] = L.d[si + 2]; px[di + 3] = 255;
    }
  }
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.activeTexture(gl.TEXTURE0);
  Object.assign(L, {tex:t, cols, w, h}); return t;
}
function b64enc(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64dec(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
const lutsJson = () => S.luts.map(l => ({id:l.id, name:l.name, n:l.n, b64:b64enc(l.d)}));
function lutsFromJson(arr) { return (arr || []).map(x => ({id:x.id, name:x.name, n:x.n, d:b64dec(x.b64)})); }
function saveLuts() {
  try { localStorage.setItem('rezie-luts', JSON.stringify(lutsJson())); }
  catch (e) { alert('LUTů je moc na uložení v prohlížeči. Po novém spuštění je bude potřeba nahrát znovu (nebo ulož projekt tlačítkem 💾 – tam se uloží).'); }
}
async function loadLutFile() {
  const f = await pickFile('.cube'); if (!f) return null;
  try { const L = parseCube(await f.text(), f.name.replace(/\.cube$/i, '')); S.luts.push(L); saveLuts(); return L; }
  catch (e) { alert(e.message); return null; }
}
let frameNo = 0;

function texFor(s) {
  if (!s.tex) {
    s.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, s.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    s.dirty = true; s.ready = false;
  }
  gl.bindTexture(gl.TEXTURE_2D, s.tex);
  const el = s.el;
  try {
    if (el instanceof HTMLVideoElement) {
      if (el.readyState < 2 || !el.videoWidth) return s.ready;
      // kamera dává třeba 30 snímků/s – na grafiku nahrát jen NOVÝ snímek (a nejvýš jednou za vykreslení)
      if (el.requestVideoFrameCallback && !el._vfc) { el._vfc = 1; el._vf = 1; const cb = () => { el._vf++; el.requestVideoFrameCallback(cb); }; el.requestVideoFrameCallback(cb); }
      const fresh = el.requestVideoFrameCallback ? s.upVf !== el._vf || el._vfEl !== s.tex : s.upFrame !== frameNo;
      if (fresh && s.upFrame !== frameNo) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el); s.upFrame = frameNo; s.upVf = el._vf; el._vfEl = s.tex; s.ready = true; }
    } else if (s.dirty) {
      if (el instanceof HTMLImageElement && !(el.complete && el.naturalWidth)) return false;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el); s.dirty = false; s.ready = true;
    }
  } catch (e) { return false; }
  return s.ready;
}

function layerRect(l, s) {
  if (s && s.type === 'text' && s.el) return {x:l.x, y:l.y, w:s.el.width * l.s, h:s.el.height * l.s};
  return {x:l.x, y:l.y, w:l.w, h:l.h};
}

// small = true → vykreslit zmenšeně (náhled): 4× méně bodů pro klíčování a barvy; obraz je pak v levém dolním rohu plátna
function renderScene(sc, small) {
  if (small) { gl.viewport(0, 0, PVW, PVH); gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, PVW, PVH); } else gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); if (small) gl.disable(gl.SCISSOR_TEST);
  if (!sc) return;
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.activeTexture(gl.TEXTURE0);
  for (const l of sc.layers) {
    if (!l.visible) continue;
    const s = srcById(l.sourceId);
    if (!s || !s.hasVideo || !s.el) continue;
    if (!texFor(s)) continue;
    const r = layerRect(l, s), c = l.crop;
    gl.uniform4f(U.r, r.x + c.l * r.w, r.y + c.t * r.h, r.w * (1 - c.l - c.r), r.h * (1 - c.t - c.b));
    gl.uniform4f(U.cr, c.l, c.t, c.r, c.b);
    gl.uniform1f(U.op, l.opacity);
    const k = l.key, kc = hex2rgb(k.color);
    gl.uniform1f(U.key, k.on ? 1 : 0); gl.uniform3f(U.kc, kc[0], kc[1], kc[2]);
    gl.uniform1f(U.sim, k.sim); gl.uniform1f(U.smo, Math.max(k.smooth, 0.001)); gl.uniform1f(U.spl, Math.max(k.spill, 0.001));
    gradeUniforms(s);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

function gradeUniforms(s) {
  const co = (s.type === 'text' || s.type === 'color') ? null : s.color;
  if (!co) { gl.uniform1f(U.gradeOn, 0); return; }
  gl.uniform1f(U.gradeOn, 1);
  const L = co.lut && lutById(co.lut);
  gl.uniform1f(U.ex, Math.pow(2, co.exp)); gl.uniform1f(U.tmp, co.temp); gl.uniform1f(U.tnt, co.tint);
  gl.uniform1f(U.con, co.con); gl.uniform1f(U.piv, co.piv); gl.uniform1f(U.sat, co.sat); gl.uniform1f(U.hue, co.hue * Math.PI / 180);
  gl.uniform3f(U.lift, co.liftY + co.lift[0], co.liftY + co.lift[1], co.liftY + co.lift[2]);
  gl.uniform3f(U.gam, 1 + co.gamY + co.gam[0], 1 + co.gamY + co.gam[1], 1 + co.gamY + co.gam[2]);
  gl.uniform3f(U.gain, 1 + co.gainY + co.gain[0], 1 + co.gainY + co.gain[1], 1 + co.gainY + co.gain[2]);
  gl.uniform3f(U.offs, co.offs[0] + co.offsY, co.offs[1] + co.offsY, co.offs[2] + co.offsY);
  if (L) {
    const lt = lutTexture(L); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lt); gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(U.lutOn, 1); gl.uniform1f(U.lutN, L.n); gl.uniform1f(U.lutCols, L.cols); gl.uniform2f(U.lutTex, L.w, L.h); gl.uniform1f(U.lutMix, co.mix);
  } else gl.uniform1f(U.lutOn, 0);
  const ct = co.curves && GR.curveTexture(s);
  if (ct) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, ct); gl.activeTexture(gl.TEXTURE0); gl.uniform1f(U.crvOn, 1); }
  else gl.uniform1f(U.crvOn, 0);
}

/* ================= Zvuk ================= */
let actx, master, masterFader, masterAn, dest, monOut;
function initAudio() { AUD.start(); }
function attachAudio(s, node) { AUD.attach(s, node); }
function peak(an) {
  const b = an._b || (an._b = new Float32Array(an.fftSize));
  an.getFloatTimeDomainData(b); let m = 0;
  for (let i = 0; i < b.length; i++) { const x = Math.abs(b[i]); if (x > m) m = x; }
  return m;
}
function meterPct(an, st) {
  const p = peak(an), d = p > 0 ? 20 * Math.log10(p) : -100;
  const pct = clamp((d + 60) / 60, 0, 1);
  st.v = Math.max(pct, (st.v || 0) - 0.015);
  return st.v;
}

/* ================= Zdroje ================= */
function newSource(type, name) {
  const s = {id:uid(), type, name, props:{}, hasVideo:false};
  if (type === 'text') s.props = {text:L('Jméno Příjmení'), sub:L('moderátor'), size:64, subSize:40, color:'#ffffff', subColor:'#cbd5e1', bold:true,
    font:'system-ui, sans-serif', bg:true, bgColor:'#0f172a', bgOp:0.85, accentOn:true, accent:'#3b82f6', pad:28};
  if (type === 'video') s.props = {loop:false, restart:true, pauseOff:true, afv:true};
  if (type === 'color') s.props = {color:'#1e3a8a'};
  return s;
}
function poolAdd(el) { $('#pool').appendChild(el); }

function attachVideoStream(s, st) {
  if (s.stream && s.stream !== st) s.stream.getTracks().forEach(t => t.stop());
  s.stream = st;
  let v = s.el;
  if (!(v instanceof HTMLVideoElement)) { v = document.createElement('video'); poolAdd(v); }
  v.muted = true; v.playsInline = true; v.autoplay = true; v.srcObject = st;
  v.onloadedmetadata = () => { s.aspect = v.videoWidth / v.videoHeight; v.play().catch(() => {}); try { const t = st.getVideoTracks()[0], g = t.getSettings(); s.actual = `${g.width}×${g.height} · ${Math.round((g.frameRate || 0) * 100) / 100} fps`; } catch (e) {} };
  v.play().catch(() => {});
  s.el = v; s.hasVideo = true; s.missing = false;
  const vt = st.getVideoTracks()[0];
  if (vt) { s.devLabel = vt.label; vt.onended = () => { s.missing = true; s.hasVideo = false; renderSources(); }; }
}
async function openCamera(s) {
  if (s.fmt && s.fmt.w) {   // zvolený formát (karta pro HDMI, 50/59.94 fps, 4K…)
    // resizeMode 'none' = bez ořezu a přepočtu v prohlížeči, přesně jak kamera posílá (důležité pro 360° obraz 2:1)
    const st = await navigator.mediaDevices.getUserMedia({video:{deviceId:s.deviceId ? {exact:s.deviceId} : undefined,
      width:{ideal:s.fmt.w}, height:{ideal:s.fmt.h}, aspectRatio:{ideal:s.fmt.w / s.fmt.h}, frameRate:{ideal:s.fmt.fps}, resizeMode:{ideal:'none'}}, audio:false});
    attachVideoStream(s, st);
    try { const g = st.getVideoTracks()[0].getSettings(); if (g.width && (g.width !== s.fmt.w || g.height !== s.fmt.h)) toast(`${s.name}: ${L('kamera neumí')} ${s.fmt.w}×${s.fmt.h}, ${L('posílá')} ${g.width}×${g.height}`); } catch (e) {}
    return;
  }
  const h = Math.min(s.res || CFG.video.camRes, Math.max(H, W) >= 3840 ? 2160 : Math.max(H, W) >= 2560 ? 1440 : 1080), w = Math.round(h * 16 / 9);   // kamera nikdy větší, než plátno potřebuje
  const st = await navigator.mediaDevices.getUserMedia({video:{deviceId:s.deviceId ? {exact:s.deviceId} : undefined,
    width:{ideal:w}, height:{ideal:h}, frameRate:{ideal:CFG.video.fps}}, audio:false});
  attachVideoStream(s, st);
}
async function openMic(s) {
  const o = s.micOpts || {};
  const st = await navigator.mediaDevices.getUserMedia({audio:{deviceId:s.deviceId ? {exact:s.deviceId} : undefined,
    echoCancellation:!!o.ec, noiseSuppression:!!o.ns, autoGainControl:false}});
  if (s.stream) s.stream.getTracks().forEach(t => t.stop());
  s.stream = st; s.devLabel = st.getAudioTracks()[0].label; s.missing = false;
  st.getAudioTracks()[0].onended = () => { s.missing = true; renderSources(); };
  attachAudio(s, actx.createMediaStreamSource(st));
}
async function openScreen(s) {
  const st = await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:CFG.video.fps}}, audio:true});
  attachVideoStream(s, st);
  const at = st.getAudioTracks();
  if (at.length) attachAudio(s, actx.createMediaStreamSource(new MediaStream(at)));
}
function loadVideo(s, file) {
  let v = s.el;
  if (!(v instanceof HTMLVideoElement)) {
    v = document.createElement('video'); v.playsInline = true; v.preload = 'auto'; poolAdd(v); s.el = v;
    attachAudio(s, actx.createMediaElementSource(v));
    v.onloadedmetadata = () => { s.aspect = v.videoWidth / v.videoHeight; };
    v.onended = () => {
      AUT.emit('vend', s.id);
      const sc = sceneById(S.programId);
      if (sc && sc.autoNext && sceneById(sc.autoNext) && sceneSources(sc, new Set()).has(s.id)) takeScene(sc.autoNext, 'fade');
    };
  }
  if (v.src && v.src.startsWith('blob:')) URL.revokeObjectURL(v.src);
  v.src = URL.createObjectURL(file); v.loop = !!s.props.loop;
  s.hasVideo = true; s.missing = false; s.devLabel = file.name;
}
function loadImageUrl(s, url) {
  const img = new Image();
  img.onload = () => { s.aspect = img.naturalWidth / img.naturalHeight; s.dirty = true; s.ready = false; };
  img.src = url; s.el = img; s.hasVideo = true; s.missing = false; s.dirty = true;
}
function loadImage(s, file) {
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => { if (fr.result.length < 1.5e6) s.props.dataUrl = fr.result; else delete s.props.dataUrl; loadImageUrl(s, fr.result); s.devLabel = file.name; res(); };
    fr.readAsDataURL(file);
  });
}
function renderText(s) {
  const p = s.props, c = s.el || (s.el = document.createElement('canvas')), x = c.getContext('2d');
  const lines = [];
  String(p.text || '').split('\n').forEach(t => lines.push({t, s:+p.size || 64, c:p.color, w:p.bold ? 700 : 400}));
  if (p.sub) String(p.sub).split('\n').forEach(t => lines.push({t, s:+p.subSize || 40, c:p.subColor, w:400}));
  const pad = p.bg ? (p.pad || 28) : 4, acc = p.accentOn && p.bg ? 12 : 0;
  let mw = 10, th = 0;
  for (const l of lines) { x.font = `${l.w} ${l.s}px ${p.font}`; mw = Math.max(mw, x.measureText(l.t).width); th += l.s * 1.22; }
  c.width = Math.ceil(mw + pad * 2 + acc + (p.bg ? 0 : 8)); c.height = Math.ceil(th + pad * 2);
  x.clearRect(0, 0, c.width, c.height);
  if (p.bg) {
    x.globalAlpha = p.bgOp ?? 0.85; x.fillStyle = p.bgColor; x.fillRect(0, 0, c.width, c.height); x.globalAlpha = 1;
    if (acc) { x.fillStyle = p.accent; x.fillRect(0, 0, acc, c.height); }
  }
  let y = pad;
  x.textBaseline = 'top';
  for (const l of lines) {
    x.font = `${l.w} ${l.s}px ${p.font}`; x.fillStyle = l.c;
    if (!p.bg) { x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 8; x.shadowOffsetY = 2; }
    x.fillText(l.t, pad + acc, y + l.s * 0.08); x.shadowColor = 'transparent';
    y += l.s * 1.22;
  }
  s.hasVideo = true; s.dirty = true; s.aspect = c.width / c.height;
}
function renderColor(s) {
  const c = s.el || (s.el = document.createElement('canvas')); c.width = c.height = 16;
  const x = c.getContext('2d'); x.fillStyle = s.props.color; x.fillRect(0, 0, 16, 16);
  s.hasVideo = true; s.dirty = true; s.aspect = 16 / 9;
}
function newLayer(s) {
  const l = {id:uid(), sourceId:s.id, x:0, y:0, w:W, h:H, s:1, opacity:1, visible:true,
    crop:{l:0, t:0, r:0, b:0}, key:{on:false, color:'#00ff00', sim:0.4, smooth:0.08, spill:0.1}};
  if (s.type === 'text') { l.x = 110; l.y = H - (s.el ? s.el.height : 150) - 100; }
  if (s.type === 'image' && s.aspect) { l.w = Math.min(W, H * s.aspect); l.h = l.w / s.aspect; l.x = (W - l.w) / 2; l.y = (H - l.h) / 2; }
  return l;
}
function addToPreview(s) {
  const sc = prevScene(); if (!sc || !s) return;
  const l = newLayer(s); sc.layers.push(l); S.selLayer = l.id;
  renderLayers(); renderProps(); showTab('props'); save();
}
function removeSource(s) {
  if (!confirm(`Smazat zdroj „${s.name}“? Zmizí ze všech scén.`)) return;
  S.scenes.forEach(sc => sc.layers = sc.layers.filter(l => l.sourceId !== s.id));
  EXT.remove(s); NIN.remove(s); V360.remove(s);
  if (s.stream) s.stream.getTracks().forEach(t => t.stop());
  if (s.audio && s.audio.gainN) { try { s.audio.gainN.disconnect(); s.audio.node && s.audio.node.disconnect(); } catch (e) {} }
  if (s.el instanceof HTMLVideoElement) { s.el.pause(); s.el.remove(); }
  if (s.tex) gl.deleteTexture(s.tex);
  S.sources = S.sources.filter(x => x !== s);
  if (S.selLayer && !selLayerObj()) S.selLayer = null;
  renderAll(); save();
}

function toast(msg) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3500);
}
/* ---------- dialogy ---------- */
function dialog(title, html, info) {
  return new Promise(res => {
    const d = $('#dlg'); $('#dlgT').textContent = title; $('#dlgB').innerHTML = html; d.returnValue = '';
    const bs = d.querySelectorAll('menu button'); bs[0].style.display = info ? 'none' : ''; bs[1].textContent = info ? 'Zavřít' : 'OK';
    d.onclose = () => {
      if (d.returnValue !== 'ok') return res(null);
      const o = {}; d.querySelectorAll('#dlgB [name]').forEach(el => o[el.name] = el.type === 'checkbox' ? el.checked : el.value);
      res(o);
    };
    d.showModal();
  });
}
function pickFile(accept) {
  return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files[0] || null); i.click(); });
}
async function devices(kind) { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === kind); }

// karty pro HDMI/SDI vstup (Elgato, Blackmagic, Magewell, AJA, AVerMedia…) se na Macu hlásí jako kamera
const CAPTURE_RE = /elgato|cam ?link|blackmagic|ultrastudio|decklink|magewell|aja |aja$|avermedia|hauppauge|hdmi|sdi|capture|usb video|uvc|game ?capture|atem|live gamer/i;
const FMT_RES = [[7680, 3840], [5760, 2880], [4096, 2160], [3840, 2160], [3840, 1920], [2880, 1440], [2560, 1440], [1920, 1080], [1920, 960], [1440, 720], [1280, 720], [1024, 576], [720, 576], [720, 480], [640, 480]];   // 16:9 i 2:1 (360° kamery – Insta360, Ricoh Theta…)
const FMT_FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
async function chooseCamera(s) {
  const ds = await devices('videoinput'); const mics = await devices('audioinput');
  if (!ds.length) { alert('Nenašel jsem žádnou kameru.'); return null; }
  const curFmt = s && s.fmt ? `${s.fmt.w}x${s.fmt.h}@${s.fmt.fps}` : 'auto';
  const pr = dialog('Kamera', `<label>Kamera / karta pro HDMI vstup<select name="dev">${ds.map((d, i) => `<option value="${d.deviceId}" ${s && s.deviceId === d.deviceId ? 'selected' : ''}>${CAPTURE_RE.test(d.label) ? '🎛 ' : '📷 '}${esc(d.label || 'Kamera ' + (i + 1))}</option>`).join('')}</select></label>
    <label>Formát (rozlišení a snímky za sekundu)<select name="fmt"><option value="auto">Automaticky (podle nastavení)</option></select></label>
    <div class="row" id="fmtCustom" hidden style="gap:6px;align-items:end"><label>${L('Šířka')}<input type="number" name="cw" min="160" max="8192" step="2" value="${s && s.fmt ? s.fmt.w : 3840}" style="width:90px"></label>
      <label>${L('Výška')}<input type="number" name="ch" min="120" max="8192" step="2" value="${s && s.fmt ? s.fmt.h : 1920}" style="width:90px"></label>
      <label>FPS<input type="number" name="cf" min="1" max="120" step="0.01" value="${s && s.fmt ? s.fmt.fps : 30}" style="width:70px"></label></div>
    <p class="dim" id="fmtInfo"></p>
    <label class="chk" id="capAudio" hidden><input type="checkbox" name="audio" ${s ? '' : 'checked'}> Přidat i zvuk z karty (zvuk z HDMI)</label>
    <input type="hidden" name="audioDev">
    <p class="dim">Tip: stejná kamera nejde většinou otevřít dvakrát. Když ji chceš ve více scénách, přidej ji jako vrstvu do dalších scén.</p>`);
  // po výběru zařízení zjistit, jaké formáty opravdu umí
  const dlg = $('#dlg'), sel = dlg.querySelector('[name=dev]'), fs = dlg.querySelector('[name=fmt]'), info = dlg.querySelector('#fmtInfo');
  const probe = async () => {
    const id = sel.value, d = ds.find(x => x.deviceId === id) || {}, isCap = CAPTURE_RE.test(d.label || '');
    let cap = null; info.textContent = L('Zjišťuji, co zařízení umí…');
    const busy = S.sources.find(x => x.deviceId === id && x.stream && x !== s);
    try {
      const t = busy ? busy.stream.getVideoTracks()[0] : (await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:id}, width:{ideal:3840}, height:{ideal:2160}, frameRate:{ideal:60}}})).getVideoTracks()[0];
      cap = t.getCapabilities ? t.getCapabilities() : null; if (!busy) t.stop();
    } catch (e) {}
    if (sel.value !== id) return;
    const mw = cap && cap.width ? cap.width.max : 1920, mh = cap && cap.height ? cap.height.max : 1080, mf = cap && cap.frameRate ? cap.frameRate.max : 30;
    const res = FMT_RES.filter(([w, hh]) => w <= mw && hh <= mh), fps = FMT_FPS.filter(f => f <= mf + 0.5);
    if (!fps.some(f => Math.abs(f - mf) < 0.6)) fps.push(Math.round(mf * 100) / 100);   // i neobvyklé maximum (např. 20 fps)
    const top = Math.round(mf * 100) / 100;
    const opts = ['<option value="auto">' + L('Automaticky (podle nastavení)') + '</option>'];
    if (cap) opts.push(`<option value="${mw}x${mh}@${top}">⭐ ${L('Maximum zařízení')} – ${mw}×${mh} · ${top} fps</option>`);
    for (const [w, hh] of res) for (const f of fps) if (!(w === mw && hh === mh && f === top)) opts.push(`<option value="${w}x${hh}@${f}">${w}×${hh}${Math.abs(w / hh - 2) < 0.01 ? ' (2:1 · 360°)' : ''} · ${f} fps</option>`);
    opts.push(`<option value="custom">✏️ ${L('Vlastní rozlišení…')}</option>`);
    fs.innerHTML = opts.join('');
    const cu = () => { dlg.querySelector('#fmtCustom').hidden = fs.value !== 'custom'; };
    fs.onchange = cu;
    // karta: rovnou nejlepší formát, který sedí k plátnu a k FPS vysílání
    const want = curFmt !== 'auto' ? curFmt : isCap ? (() => { const r = res.find(([w, hh]) => hh <= Math.max(H, 1080)) || res[0]; const f = fps.filter(x => Math.abs(x - CFG.video.fps) < 1).pop() || fps.filter(x => x <= CFG.video.fps + 0.5).pop() || fps[fps.length - 1]; return r ? `${r[0]}x${r[1]}@${f}` : 'auto'; })() : 'auto';
    fs.value = [...fs.options].some(o => o.value === want) ? want : (curFmt !== 'auto' ? 'custom' : 'auto'); cu();
    info.textContent = cap ? `${isCap ? '🎛 ' + L('Karta pro HDMI vstup') + ' · ' : ''}${L('umí až')} ${mw}×${mh} · ${Math.round(mf * 100) / 100} fps` : L('Formáty se nepodařilo zjistit – použij Automaticky.');
    // zvuk z karty (stejné nebo podobné jméno zvukového zařízení)
    const key = (d.label || '').replace(/\s*\(.*\)$/, '').toLowerCase().split(/\s+/).slice(0, 2).join(' ');
    const am = isCap && key ? mics.find(m => m.label.toLowerCase().includes(key)) : null;
    dlg.querySelector('#capAudio').hidden = !am; dlg.querySelector('[name=audioDev]').value = am ? am.deviceId : '';
  };
  sel.addEventListener('change', probe); probe();
  return pr;
}
function fmtOf(f) { return f.fmt === 'custom' ? `${Math.round(+f.cw / 2) * 2 || 1920}x${Math.round(+f.ch / 2) * 2 || 1080}@${+f.cf || 30}` : f.fmt; }
function setFmt(s, v) {
  const m = /^(\d+)x(\d+)@([\d.]+)$/.exec(v || ''); s.fmt = m ? {w:+m[1], h:+m[2], fps:+m[3]} : null; if (m) s.res = +m[2];
}
async function chooseMic(s) {
  const ds = await devices('audioinput');
  if (!ds.length) { alert('Nenašel jsem žádný mikrofon.'); return null; }
  return dialog('Mikrofon', `<label>Mikrofon / zvuková karta<select name="dev">${ds.map((d, i) => `<option value="${d.deviceId}" ${s && s.deviceId === d.deviceId ? 'selected' : ''}>${esc(d.label || 'Mikrofon ' + (i + 1))}</option>`).join('')}</select></label>
    <label class="chk"><input type="checkbox" name="ns"> Potlačení šumu (pro levné mikrofony)</label>
    <label class="chk"><input type="checkbox" name="ec"> Potlačení ozvěny (když nemáš sluchátka)</label>`);
}

async function addSource(type) {
  try {
    if (type === 'guest') { showTab('remote'); return; }
    if (await EXT.add(type)) return;
    if (await NIN.add(type)) return;
    if (await V360.add(type)) return;
    if (type === 'camera') {
      const f = await chooseCamera(); if (!f) return;
      const ds = await devices('videoinput'); const d = ds.find(x => x.deviceId === f.dev);
      const s = newSource('camera', d && d.label ? d.label.replace(/\s*\(.*\)$/, '') : L('Kamera ') + (S.sources.filter(x => x.type === 'camera').length + 1));
      s.deviceId = f.dev; setFmt(s, fmtOf(f)); await openCamera(s); S.sources.push(s); addToPreview(s);
      if (f.audio && f.audioDev) { const m = newSource('mic', s.name + ' – ' + L('zvuk')); m.deviceId = f.audioDev; await openMic(m); S.sources.push(m); }
    } else if (type === 'mic') {
      const f = await chooseMic(); if (!f) return;
      const s = newSource('mic', L('Mikrofon ') + (S.sources.filter(x => x.type === 'mic').length + 1));
      s.deviceId = f.dev; s.micOpts = {ns:f.ns, ec:f.ec}; await openMic(s); S.sources.push(s); showTab('audio');
    } else if (type === 'screen') {
      const s = newSource('screen', L('Obrazovka')); await openScreen(s); S.sources.push(s); addToPreview(s);
    } else if (type === 'video') {
      const file = await pickFile('video/*'); if (!file) return;
      const s = newSource('video', file.name.replace(/\.[^.]+$/, '')); loadVideo(s, file); S.sources.push(s); addToPreview(s);
    } else if (type === 'image') {
      const file = await pickFile('image/*'); if (!file) return;
      const s = newSource('image', file.name.replace(/\.[^.]+$/, '')); await loadImage(s, file);
      await new Promise(r => { if (s.el.complete) r(); else s.el.onload = () => { s.aspect = s.el.naturalWidth / s.el.naturalHeight; s.dirty = true; r(); }; });
      S.sources.push(s); addToPreview(s);
    } else if (type === 'text') {
      const s = newSource('text', L('Titulek ') + (S.sources.filter(x => x.type === 'text').length + 1)); renderText(s); S.sources.push(s); addToPreview(s);
    } else if (type === 'color') {
      const s = newSource('color', L('Barevné pozadí')); renderColor(s); S.sources.push(s); addToPreview(s);
    }
  } catch (e) {
    console.error(e); alert('Zdroj se nepodařilo přidat: ' + (e.message || e.name));
  }
  renderSources(); renderMixer(); save();
}
async function reloadSource(s) {
  try {
    if (s.type === 'camera') { const f = await chooseCamera(s); if (!f) return; s.deviceId = f.dev; setFmt(s, fmtOf(f)); await openCamera(s); }
    else if (s.type === 'mic') { const f = await chooseMic(s); if (!f) return; s.deviceId = f.dev; s.micOpts = {ns:f.ns, ec:f.ec}; await openMic(s); }
    else if (s.type === 'screen') await openScreen(s);
    else if (s.type === 'video') { const f = await pickFile('video/*'); if (!f) return; loadVideo(s, f); }
    else if (s.type === 'image') { const f = await pickFile('image/*'); if (!f) return; await loadImage(s, f); }
  } catch (e) { alert('Nepodařilo se: ' + (e.message || e.name)); }
  renderSources(); renderMixer(); renderLayers(); save();
}

/* ================= Scény & přepínání ================= */
function sceneSources(sc, set) { if (sc) for (const l of sc.layers) if (l.visible) set.add(l.sourceId); return set; }
function onAirSet() { const set = sceneSources(sceneById(S.programId), new Set()); if (S.active) sceneSources(sceneById(S.active.from), set); return set; }

function setPreview(id) {
  if (S.previewId === id) return;
  S.previewId = id; S.selLayer = null;
  renderScenes(); renderLayers(); renderProps(); save();
}
function take(mode) {
  const to = S.previewId; if (!to) return;
  if (S.active) S.active = null;
  const from = S.programId;
  const before = sceneSources(sceneById(from), new Set()), after = sceneSources(sceneById(to), new Set());
  S.programId = to; AUT.emit('scene', to); CUT.take(to);
  if (mode !== 'cut' && from !== to) TR.start(from, to, mode === 'manual');
  for (const id of after) {
    if (before.has(id)) continue;
    const s = srcById(id);
    if (s && s.type === 'video' && s.el instanceof HTMLVideoElement) { s._manual = false; if (s.props.restart) s.el.currentTime = 0; s.el.play().catch(() => {}); }
  }
  if (S.trans.swap && from && from !== to) { S.previewId = from; S.selLayer = null; }
  else if (S.trans.swap && !from && S.scenes.length > 1) { const i = S.scenes.findIndex(s => s.id === to); S.previewId = S.scenes[(i + 1) % S.scenes.length].id; S.selLayer = null; }
  renderScenes(); renderLayers(); renderProps(); save();
}
function takeScene(id, mode) { S.previewId = id; take(mode); }

function addScene() {
  const sc = {id:uid(), name:L('Scéna ') + (S.scenes.length + 1), layers:[], autoNext:null};
  S.scenes.push(sc); setPreview(sc.id); renderScenes(); save();
}
function dupScene() {
  const sc = prevScene(); if (!sc) return;
  const c = JSON.parse(JSON.stringify(sc)); c.id = uid(); c.name = sc.name + ' ' + L('(kopie)'); c.layers.forEach(l => l.id = uid());
  S.scenes.splice(S.scenes.indexOf(sc) + 1, 0, c); setPreview(c.id); renderScenes(); save();
}
function delScene() {
  const sc = prevScene(); if (!sc) return;
  if (sc.id === S.programId) return alert('Tuhle scénu teď vysíláš. Nejdřív přepni na jinou.');
  if (!confirm(`Smazat scénu „${sc.name}“?`)) return;
  const i = S.scenes.indexOf(sc); S.scenes.splice(i, 1);
  S.scenes.forEach(x => { if (x.autoNext === sc.id) x.autoNext = null; });
  S.previewId = (S.scenes[i] || S.scenes[i - 1] || {}).id || null; S.selLayer = null;
  renderScenes(); renderLayers(); renderProps(); save();
}
function moveScene(d) {
  const sc = prevScene(); if (!sc) return;
  const i = S.scenes.indexOf(sc), j = i + d; if (j < 0 || j >= S.scenes.length) return;
  [S.scenes[i], S.scenes[j]] = [S.scenes[j], S.scenes[i]]; renderScenes(); save();
}

/* ================= UI: scény, vrstvy ================= */
function renderScenes() {
  $('#scenes').innerHTML = S.scenes.map((sc, i) =>
    `<button class="scene ${sc.id === S.previewId ? 'pv' : ''} ${sc.id === S.programId ? 'pg' : ''}" data-id="${sc.id}" title="Klik = náhled, dvojklik = rovnou do vysílání"><span class="n">${i < 9 ? i + 1 : ''}</span>${esc(sc.name)}</button>`).join('');
  const pv = prevScene(), pg = sceneById(S.programId);
  $('#pvName').textContent = pv ? '– ' + pv.name : ''; $('#pgName').textContent = pg ? '– ' + pg.name : '';
}
function renderLayers() {
  const sc = prevScene(), box = $('#layers');
  if (!sc) { box.innerHTML = '<p class="dim">Vyber nebo vytvoř scénu.</p>'; return; }
  const rows = [...sc.layers].reverse().map(l => {
    const s = srcById(l.sourceId);
    return `<div class="layer ${l.id === S.selLayer ? 'sel' : ''}" data-id="${l.id}">
      <button data-act="vis" title="Zobrazit/skrýt">${l.visible ? '👁' : '—'}</button>
      <span class="nm">${icon(s)} ${esc(s ? s.name : '(smazaný zdroj)')}</span>${l.key.on ? '<span class="tag">KLÍČ</span>' : ''}
      <button data-act="up" title="Výš">▲</button><button data-act="down" title="Níž">▼</button><button data-act="del" title="Odebrat ze scény">✕</button></div>`;
  }).join('');
  const opts = S.sources.filter(s => s.hasVideo).map(s => `<option value="${s.id}">${icon(s)} ${esc(s.name)}</option>`).join('');
  box.innerHTML = (rows || '<p class="dim">Scéna je prázdná.</p>') +
    `<select id="addLayerSel" style="margin-top:6px"><option value="">+ Přidat zdroj do této scény…</option>${opts}</select>`;
}

/* ================= UI: vlastnosti ================= */
const fmtN = (v, st) => (+v).toFixed(st < 0.01 ? 3 : st < 1 ? 2 : 0);
function range(label, key, v, min, max, step) {
  return `<label class="rng"><span>${label}</span><input type="range" data-l="${key}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${fmtN(v, step)}</output></label>`;
}
function renderProps() {
  const box = $('#tab-props'), sc = prevScene();
  if (!sc) { box.innerHTML = '<p class="dim">Vyber scénu.</p>'; return; }
  const l = selLayerObj(), s = l && srcById(l.sourceId);
  let h = `<div class="propcols"><div class="sec"><h4>Scéna</h4>
    <div class="row"><label>Název scény<input data-sc="name" value="${esc(sc.name)}"></label></div>
    <div class="row"><label>Když v této scéně skončí video, přepnout na:<select data-sc="autoNext"><option value="">— nic —</option>${S.scenes.filter(x => x.id !== sc.id).map(x => `<option value="${x.id}" ${sc.autoNext === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label></div>
    <p class="dim">Hodí se na znělku: pustíš scénu se znělkou a po jejím konci se samo přepne na kameru.</p></div>`;
  if (!l) h += `<div class="sec"><h4>Vrstva</h4><p class="dim">Klikni na něco v náhledu nebo na vrstvu v seznamu. V náhledu můžeš vrstvy myší posouvat a za rohy zvětšovat (Shift = volný poměr).</p></div></div>`;
  else {
    const isT = s && s.type === 'text';
    h += `<div class="sec"><h4>Vrstva: ${icon(s)} ${esc(s ? s.name : '?')}</h4>
      <div class="grid4"><label>X<input type="number" data-l="x" value="${Math.round(l.x)}"></label><label>Y<input type="number" data-l="y" value="${Math.round(l.y)}"></label>
      ${isT ? `<label>Velikost %<input type="number" data-l="s" data-mul="100" value="${Math.round(l.s * 100)}"></label><span></span>`
            : `<label>Šířka<input type="number" data-l="w" value="${Math.round(l.w)}"></label><label>Výška<input type="number" data-l="h" value="${Math.round(l.h)}"></label>`}</div>
      <div class="btns">${isT ? '' : '<button data-do="full">Celá obrazovka</button><button data-do="aspect">Podle poměru zdroje</button><button data-do="pip">Malé okno v rohu</button>'}<button data-do="center">Na střed</button>${isT ? '<button data-do="lower">Dolní třetina</button>' : ''}</div>
      ${range('Průhlednost', 'opacity', l.opacity, 0, 1, 0.01)}
      <h5>Oříznutí</h5>
      ${range('Zleva', 'crop.l', l.crop.l, 0, 0.45, 0.005)}${range('Zprava', 'crop.r', l.crop.r, 0, 0.45, 0.005)}
      ${range('Shora', 'crop.t', l.crop.t, 0, 0.45, 0.005)}${range('Zdola', 'crop.b', l.crop.b, 0, 0.45, 0.005)}
      </div>
      <div class="sec"><h4>Klíčování (zelené / modré pozadí)</h4>
      <label class="chk"><input type="checkbox" data-l="key.on" ${l.key.on ? 'checked' : ''}> Zapnout klíč</label>
      <div class="row" style="margin-top:8px"><label style="flex:0">Barva<input type="color" data-l="key.color" value="${l.key.color}"></label>
        <button data-do="pick">🎯 Kliknout do náhledu a vybrat barvu</button><button data-do="green">Zelená</button><button data-do="blue">Modrá</button></div>
      ${range('Podobnost (kolik zmizí)', 'key.sim', l.key.sim, 0, 1, 0.005)}
      ${range('Vyhlazení okrajů', 'key.smooth', l.key.smooth, 0.001, 0.5, 0.001)}
      ${range('Potlačení zeleného přesvitu', 'key.spill', l.key.spill, 0.001, 0.5, 0.001)}
      <p class="dim">Postup: zapni klíč → klikni na 🎯 → klikni do zeleného pozadí v náhledu → posuň „Podobnost“, až pozadí zmizí a člověk zůstane celý. Rovnoměrné světlo na plátně pomáhá nejvíc.</p></div>${s && !['text','color'].includes(s.type) ? `<div class="sec"><h4>🎨 Barvy</h4><p class="dim">${s.color && s.color.lut && lutById(s.color.lut) ? 'LUT: ' + esc(lutById(s.color.lut).name) : 'Bez úprav barev.'}</p><button data-do="opencolor" class="primary">Otevřít v Barvách (grading, LUT, scopy)</button></div>` : ''}</div>`;
  }
  box.innerHTML = h;
}
function updatePropInputs() {
  const l = selLayerObj(); if (!l) return;
  $('#tab-props').querySelectorAll('[data-l]').forEach(el => {
    if (el === document.activeElement) return;
    const k = el.dataset.l; if (!['x','y','w','h','s'].includes(k)) return;
    el.value = Math.round(l[k] * (+el.dataset.mul || 1));
  });
}
function layerAction(act) {
  const l = selLayerObj(); if (!l) return; const s = srcById(l.sourceId);
  const r = layerRect(l, s);
  if (act === 'full') { l.x = 0; l.y = 0; l.w = W; l.h = H; }
  else if (act === 'aspect' && s && s.aspect) { l.h = l.w / s.aspect; }
  else if (act === 'center') { l.x = (W - r.w) / 2; l.y = (H - r.h) / 2; }
  else if (act === 'pip') { const a = s && s.aspect ? s.aspect : 16 / 9; l.w = W * 0.3; l.h = l.w / a; l.x = W - l.w - 60; l.y = H - l.h - 60; }
  else if (act === 'lower') { l.x = 110; l.y = H - r.h - 100; }
  else if (act === 'green') { l.key.color = '#00ff00'; l.key.on = true; }
  else if (act === 'blue') { l.key.color = '#0000ff'; l.key.on = true; }
  else if (act === 'pick') { S.picking = true; $('#pv').style.cursor = 'crosshair'; return; }
  renderProps(); renderLayers(); save();
}
const pickCv = document.createElement('canvas'); pickCv.width = pickCv.height = 6;
function pickColor(p) {
  const l = selLayerObj(); if (!l) return; const s = srcById(l.sourceId); if (!s || !s.el) return;
  const r = layerRect(l, s); const u = (p.x - r.x) / r.w, v = (p.y - r.y) / r.h;
  if (u < 0 || u > 1 || v < 0 || v > 1) return alert('Klikni přímo do obrazu vybrané vrstvy (do zeleného pozadí).');
  const [sw, shh] = elSize(s.el); if (!sw) return;
  const x = pickCv.getContext('2d', {willReadFrequently:true});
  x.drawImage(s.el, u * sw - 3, v * shh - 3, 6, 6, 0, 0, 6, 6);
  const d = x.getImageData(0, 0, 6, 6).data; let rr = 0, gg = 0, bb = 0;
  for (let i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; }
  const n = d.length / 4; l.key.color = rgb2hex(rr / n, gg / n, bb / n); l.key.on = true;
  renderProps(); renderLayers(); save();
}

/* ================= UI: zdroje ================= */
const FONTS = [['system-ui, sans-serif','Systémové'],['Arial, sans-serif','Arial'],['"Arial Black", sans-serif','Arial Black'],['Impact, sans-serif','Impact'],['Georgia, serif','Georgia'],['"Times New Roman", serif','Times'],['"Courier New", monospace','Courier']];
function srcCard(s) {
  const p = s.props; let b = '';
  if ((s.type === 'video' || s.type === 'playlist') && s.el instanceof HTMLVideoElement && s.el.videoWidth) b += `<div class="dim" style="font-size:11px">${s.el.videoWidth}×${s.el.videoHeight}${Math.abs(s.el.videoWidth / s.el.videoHeight - 2) < 0.01 ? ' · 360° (2:1)' : ''}</div>`;
  if (s.type === 'camera' && s.actual) b += `<div class="dim" style="font-size:11px">${CAPTURE_RE.test(s.devLabel || s.name) ? '🎛 ' : ''}${esc(s.actual)}</div>`;
  b += EXT.card(s); b += NIN.card(s); b += V360.card(s);
  if (s.missing) b += s.type === 'guest' ? `<div class="warn">⚠ Host není připojený – pošli mu odkaz (záložka 📱 Dálkově).</div>` : `<div class="warn">⚠ Zdroj není připojený.<button data-sa="reload">Připojit znovu</button></div>`;
  if (s.type === 'text') b += `
    <label>Hlavní text<textarea data-s="props.text" rows="2">${esc(p.text)}</textarea></label>
    <label>Druhý řádek (např. funkce)<textarea data-s="props.sub" rows="1">${esc(p.sub)}</textarea></label>
    <div class="grid4"><label>Velikost<input type="number" data-s="props.size" value="${p.size}"></label><label>Barva<input type="color" data-s="props.color" value="${p.color}"></label>
      <label>Velikost 2.<input type="number" data-s="props.subSize" value="${p.subSize}"></label><label>Barva 2.<input type="color" data-s="props.subColor" value="${p.subColor}"></label></div>
    <div class="grid4"><label class="chk"><input type="checkbox" data-s="props.bold" ${p.bold ? 'checked' : ''}>Tučně</label><label class="chk"><input type="checkbox" data-s="props.bg" ${p.bg ? 'checked' : ''}>Pozadí</label>
      <label>Barva pozadí<input type="color" data-s="props.bgColor" value="${p.bgColor}"></label><label>Krytí pozadí<input type="range" data-s="props.bgOp" min="0" max="1" step="0.05" value="${p.bgOp}"></label></div>
    <div class="grid4"><label class="chk"><input type="checkbox" data-s="props.accentOn" ${p.accentOn ? 'checked' : ''}>Proužek</label><label>Barva proužku<input type="color" data-s="props.accent" value="${p.accent}"></label>
      <label style="grid-column:span 2">Písmo<select data-s="props.font">${FONTS.map(f => `<option value='${f[0]}' ${p.font === f[0] ? 'selected' : ''}>${f[1]}</option>`).join('')}</select></label></div>`;
  if (s.type === 'video') b += `
    <div class="btns"><button data-sa="play">▶ Přehrát</button><button data-sa="pause">⏸ Pauza</button><button data-sa="rew">⏮ Začátek</button><span class="dim" data-time="${s.id}"></span></div>
    <label class="chk"><input type="checkbox" data-s="props.restart" ${p.restart ? 'checked' : ''}>Při přepnutí do vysílání pustit od začátku</label>
    <label class="chk"><input type="checkbox" data-s="props.loop" ${p.loop ? 'checked' : ''}>Opakovat dokola (smyčka)</label>
    <label class="chk"><input type="checkbox" data-s="props.pauseOff" ${p.pauseOff ? 'checked' : ''}>Zastavit, když není ve vysílání</label>`;
  if (s.type === 'color') b += `<label>Barva<input type="color" data-s="props.color" value="${p.color}"></label>`;
  if (s.devLabel && s.type !== 'text') b += `<div class="dim">${esc(s.devLabel)}</div>`;
  if (['camera','screen','mic','video','image'].includes(s.type) && !s.missing) b += `<div class="btns"><button data-sa="reload">${s.type === 'video' || s.type === 'image' ? 'Vyměnit soubor' : 'Změnit zařízení'}</button></div>`;
  return `<div class="src" data-id="${s.id}"><div class="srch"><span class="ic">${icon(s)}</span><input class="nm" data-s="name" value="${esc(s.name)}">
    ${s.hasVideo ? '<button data-sa="add" title="Přidat do scény, která je v náhledu">+ do scény</button>' : ''}<button data-sa="del" title="Smazat zdroj">✕</button></div>${b}</div>`;
}
function renderSources() {
  $('#tab-sources').innerHTML = `<div class="addbar">
    <button data-add="camera">📷 + Kamera</button><button data-add="screen">🖥 + Obrazovka / okno</button><button data-add="video">🎞 + Video (znělka)</button>
    <button data-add="image">🖼 + Obrázek / logo</button><button data-add="text">🔤 + Text / titulek</button><button data-add="color">🎨 + Barva</button><button data-add="mic">🎤 + Mikrofon</button><button data-add="guest">👤 + Host přes odkaz</button><button data-add="playlist">📃 + Playlist videí</button><button data-add="slides">🗂 + Prezentace</button><button data-add="web">🌐 + Web / chat</button><button data-add="netin">📡 + SRT / RTMP / IP kamera</button><button data-add="ndiin">🔗 + NDI vstup</button><button data-add="v360">🌐 + 360° záběr</button></div>
    <div class="srclist">${S.sources.map(srcCard).join('') || '<p class="dim">Zatím žádné zdroje. Začni tím, že přidáš kameru.</p>'}</div>`;
}

/* ================= UI: mix zvuku ================= */
function renderMixer() {
  const b = $('#tab-audio'); if (!actx) return;
  const ch = S.sources.filter(s => s.audio && s.audio.gainN);
  const row = s => `<div class="ch" data-id="${s.id}"><span class="cn">${icon(s)} ${esc(s.name)}</span><div class="meter" data-m="${s.id}"><i></i></div>
    <input type="range" min="0" max="2" step="0.01" data-a="vol" value="${s.audio.vol}"><output>${dbTxt(s.audio.vol)} dB</output>
    <button data-a="mute" class="${s.audio.mute ? 'on' : ''}" title="Ztlumit">M</button>
    ${s.type === 'mic' ? `<label title="Když zvuk předbíhá obraz">zpoždění <input type="number" data-a="delay" min="0" max="1000" step="10" value="${s.audio.delay || 0}"> ms</label>`
      : s.type === 'video' ? `<label class="chk" title="Zvuk videa jen když je video ve vysílání"><input type="checkbox" data-a="afv" ${s.props.afv ? 'checked' : ''}> jen ve vysílání</label>` : '<span></span>'}</div>`;
  b.innerHTML = `<div class="mix">${ch.map(row).join('')}
    <div class="ch master"><span class="cn">🔴 MASTER (program)</span><div class="meter" data-m="master"><i></i></div>
    <input type="range" min="0" max="2" step="0.01" data-a="mvol" value="${masterFader.gain.value}"><output>${dbTxt(masterFader.gain.value)} dB</output>
    <button data-a="mon" class="${R.monitor ? 'on2' : ''}" title="Pustit program do repráků/sluchátek">🎧 Odposlech</button><span></span></div></div>
    <div class="btns" style="margin-top:8px"><button class="primary" onclick="showPage('audio')">🎚 Otevřít mix pult s efekty</button><span class="dim">${AUD.lufsText()}</span></div>    ${ch.length ? '' : '<p class="dim">Zatím tu nic není. Přidej mikrofon nebo video v záložce Zdroje.</p>'}
    <p class="dim">Zelená = v pohodě, žlutá = hlasitě, červená = moc nahlas (zkreslení). Odposlech pouštěj jen do sluchátek, jinak bude pískat zpětná vazba.</p>`;
  R.meters = [...b.querySelectorAll('.meter')].map(m => ({el:m.firstElementChild, id:m.dataset.m}));
}

/* ================= Okna (druhý monitor) ================= */
function openWin(name, title, w = 1280, h = 720) {
  const win = window.open('', name, `width=${w},height=${h}`);
  if (!win) { alert('Prohlížeč zablokoval nové okno. Povol vyskakovací okna pro tuto stránku (ikona v adresním řádku).'); return null; }
  const d = win.document;
  d.head.innerHTML = `<meta charset="utf-8"><title>${title}</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden;cursor:none}canvas{width:100vw;height:100vh;object-fit:contain;display:block}</style>`;
  d.title = title; d.body.innerHTML = '';
  d.ondblclick = () => { d.fullscreenElement ? d.exitFullscreen() : d.documentElement.requestFullscreen().catch(() => {}); };
  d.onkeydown = onKey;
  return win;
}
function openCanvasWin(key, name, title) {
  let w = R.wins[key]; if (w && !w.closed) { w.focus(); return; }
  w = openWin(name, title); if (!w) return;
  const c = w.document.createElement('canvas'); c.width = key === 'multi' ? 1920 : W; c.height = key === 'multi' ? 1080 : H; c._x = c.getContext('2d');
  w.document.body.appendChild(c); w._c = c; R.wins[key] = w;
}
function elSize(el) {
  if (el instanceof HTMLVideoElement) return [el.videoWidth, el.videoHeight];
  if (el instanceof HTMLImageElement) return [el.naturalWidth, el.naturalHeight];
  return [el.width, el.height];
}
function drawContain(x, el, bx, by, bw, bh) {
  if (!el) return; const [w, h] = elSize(el); if (!w || !h) return;
  if (el instanceof HTMLVideoElement && el.readyState < 2) return;
  const k = Math.min(bw / w, bh / h), dw = w * k, dh = h * k;
  try { x.drawImage(el, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh); } catch (e) {}
}
function tallyBox(x, bx, by, bw, bh, col, label) {
  x.strokeStyle = col; x.lineWidth = 5; x.strokeRect(bx + 3, by + 3, bw - 6, bh - 6);
  x.font = '600 24px system-ui, sans-serif'; const tw = x.measureText(label).width;
  x.fillStyle = 'rgba(0,0,0,.72)'; x.fillRect(bx + 10, by + 10, tw + 20, 34); x.fillStyle = '#fff'; x.fillText(label, bx + 20, by + 35);
}
function drawMulti(c, onAir) {
  const x = c._x; x.fillStyle = '#0b0b0d'; x.fillRect(0, 0, 1920, 1080);
  const pvS = prevScene(), pgS = sceneById(S.programId);
  drawContain(x, pvBuf, 0, 0, 960, 540); drawContain(x, pg, 960, 0, 960, 540);
  tallyBox(x, 0, 0, 960, 540, '#22c55e', L('NÁHLED') + (pvS ? ': ' + pvS.name : ''));
  tallyBox(x, 960, 0, 960, 540, '#ef4444', 'PROGRAM' + (pgS ? ': ' + pgS.name : ''));
  const inPv = sceneSources(pvS, new Set());
  // poslední políčko: hodiny, stav vysílání a hlasitost
  { const bx = 1440, by = 810, now = performance.now(); x.fillStyle = '#111318'; x.fillRect(bx + 4, by + 4, 472, 262);
    x.fillStyle = '#fff'; x.font = '600 64px ui-monospace, Menlo, Consolas, monospace'; x.textAlign = 'center'; x.fillText(new Date().toLocaleTimeString('cs-CZ'), bx + 240, by + 100);
    x.font = '600 26px system-ui, sans-serif';
    const st = [R.stream ? L('● ŽIVĚ') + ' ' + fmtT(now - R.stream.start) : '', R.rec ? 'REC ' + fmtT(now - R.rec.start) : '', R.iso.length ? 'ISO ' + fmtT(now - R.isoStart) : ''].filter(Boolean).join('   ');
    x.fillStyle = st ? '#ef4444' : '#6b7280'; x.fillText(st || L('nevysílá se'), bx + 240, by + 150);
    const gn = GFX.onAirNames(); x.fillStyle = '#fde68a'; x.font = '22px system-ui, sans-serif'; if (gn.length) x.fillText('✨ ' + gn.join(', ').slice(0, 40), bx + 240, by + 190);
    x.textAlign = 'left';
    if (masterAn) { R._mvm = R._mvm || {}; const p = meterPct(masterAn, R._mvm); const gg = x.createLinearGradient(bx + 30, 0, bx + 450, 0); gg.addColorStop(0, '#16a34a'); gg.addColorStop(0.7, '#16a34a'); gg.addColorStop(0.72, '#eab308'); gg.addColorStop(0.88, '#eab308'); gg.addColorStop(0.9, '#ef4444');
      x.fillStyle = '#23262c'; x.fillRect(bx + 30, by + 220, 420, 18); x.fillStyle = gg; x.fillRect(bx + 30, by + 220, 420 * p, 18); }
    x.strokeStyle = '#3a3d44'; x.lineWidth = 5; x.strokeRect(bx + 3, by + 3, 474, 264); }
  S.sources.filter(s => s.hasVideo && s.el && s.type !== 'color').slice(0, 7).forEach((s, i) => {
    const bx = (i % 4) * 480, by = 540 + Math.floor(i / 4) * 270;
    drawContain(x, s.el, bx + 5, by + 5, 470, 260);
    tallyBox(x, bx, by, 480, 270, onAir.has(s.id) ? '#ef4444' : inPv.has(s.id) ? '#22c55e' : '#3a3d44', s.name);
  });
}

/* ================= Čtečka (teleprompter) ================= */
function openPrompter() {
  const P = R.prompter; let w = P.win; if (w && !w.closed) { w.focus(); return; }
  w = openWin('rz_prompter', L('Čtečka'), 1280, 800); if (!w) return;
  const d = w.document;
  d.head.querySelector('style').textContent += `#wrap{position:absolute;inset:0;overflow:hidden}#txt{padding:45vh 8vw 60vh;white-space:pre-wrap;font:600 64px/1.35 system-ui,sans-serif;color:#fff;will-change:transform}#line{position:fixed;left:0;right:0;top:45vh;border-top:3px solid rgba(255,40,40,.65)}#arrow{position:fixed;left:1.5vw;top:calc(45vh - 22px);color:#f33;font-size:40px}`;
  d.body.innerHTML = '<div id="wrap"><div id="txt"></div></div><div id="line"></div><div id="arrow">▶</div>';
  w._txt = d.getElementById('txt'); w._wrap = d.getElementById('wrap');
  d.onkeydown = e => {
    if (e.code === 'Space') { togglePrompter(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setPrSpeed(P.speed - 10); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { setPrSpeed(P.speed + 10); e.preventDefault(); }
    else if (e.key === 'Home') { P.pos = 0; }
    else onKey(e);
  };
  P.win = w; updatePrompterLook();
}
function updatePrompterLook() {
  const P = R.prompter, w = P.win;
  if (w && !w.closed) { w._txt.textContent = P.text; w._txt.style.fontSize = P.size + 'px'; w._wrap.style.transform = P.mirror ? 'scaleX(-1)' : ''; }
  $('#prMiniT').textContent = P.text; $('#prMini').style.transform = P.mirror ? 'scaleX(-1)' : '';
  $('#prPlay').textContent = P.playing ? '⏸ Pauza' : '▶ Spustit';
  $('#prSpeed').value = P.speed; $('#prSpeedO').textContent = P.speed; $('#prSize').value = P.size; $('#prSizeO').textContent = P.size;
  P._k = null;
}
function togglePrompter() { R.prompter.playing = !R.prompter.playing; updatePrompterLook(); }
function setPrSpeed(v) { R.prompter.speed = clamp(v, 0, 300); updatePrompterLook(); save(); }
function tickPrompter(dt) {
  const P = R.prompter, w = P.win && !P.win.closed ? P.win : null;
  if (P.playing) P.pos += P.speed * dt;
  if (w) { const max = Math.max(0, w._txt.scrollHeight - w.innerHeight); if (P.pos > max) { P.pos = max; } }
  if (P.pos < 0) P.pos = 0;
  if (w) w._txt.style.transform = `translateY(${-P.pos}px)`;
  const mini = $('#prMini'), mt = $('#prMiniT');
  if (mini.offsetParent) {
    const k = mini.clientWidth / (w ? w.innerWidth : 1280);
    if (P._k !== k) { P._k = k; mt.style.fontSize = (P.size * k) + 'px'; mt.style.paddingTop = (mini.clientHeight * 0.45) + 'px'; }
    mt.style.transform = `translateY(${-P.pos * k}px)`;
    if (!w && P.playing) { const max = mt.scrollHeight / k; if (P.pos > max) P.pos = max; }
  }
}

/* ================= Nahrávání ================= */
function pickMime(kind) {
  const list = kind === 'audio' ? ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    : ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d0028,mp4a.40.2', 'video/mp4;codecs=avc1.42e01f,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2',
       'video/mp4;codecs=avc1.640028,opus', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const pref = CFG.rec.fmt === 'webm' ? [...list.filter(m => m.includes('webm')), ...list.filter(m => !m.includes('webm'))] : list;
  return pref.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}
function recFormatInfo() {
  const m = pickMime('video');
  if (/avc1.*mp4a/.test(m)) return '✅ MP4 · H.264 + AAC – otevře ho Premiere, DaVinci, Final Cut i telefon.';
  if (/avc1/.test(m)) return '🟡 MP4 · H.264 + zvuk Opus – obraz jde všude, zvuk některé střihové programy (Premiere) neumí. DaVinci a VLC ano.';
  if (m.includes('mp4')) return '🟠 MP4 · tenhle prohlížeč neumí H.264 – uloží se VP9. Pro střih použij Chrome nebo Edge na Windows/Macu, nebo soubor převeď (HandBrake).';
  return '🟠 WebM – přehraje VLC a DaVinci, pro Premiere převeď (HandBrake).';
}
let pgTrack = null;
function outStream() {
  if (!pgTrack || pgTrack.readyState === 'ended') pgTrack = pg.captureStream(CFG.video.fps).getVideoTracks()[0];
  return new MediaStream([pgTrack, ...dest.stream.getAudioTracks()]);
}
function makeRec(stream, name, kind, bits, st) {
  const mime = pickMime(kind), opts = {}; if (mime) opts.mimeType = mime;
  if (kind === 'audio') opts.audioBitsPerSecond = bits; else { opts.videoBitsPerSecond = bits; opts.audioBitsPerSecond = CFG.rec.ab * 1000; }
  const r = new MediaRecorder(stream, opts), chunks = [];
  const type = mime || 'video/webm', ext = type.includes('mp4') ? (kind === 'audio' ? 'm4a' : 'mp4') : 'webm';
  const fname = `${safe(name)}_${st}.${ext}`, w = DISK.open(fname);
  r.ondataavailable = e => { if (!e.data.size) return; if (w) w.write(e.data); else chunks.push(e.data); };
  r.onstop = async () => {
    if (w) { const ok = await w.close(); R.recordings.unshift({name:fname, disk:true, size:w.size, ok}); renderRecs(); }
    else saveBlob(new Blob(chunks, {type}), fname);
  };
  r.start(1000); return r;
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  R.recordings.unshift({name, url, size:blob.size}); renderRecs();
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function renderRecs() {
  $('#recList').innerHTML = R.recordings.length ? R.recordings.map(r => r.disk ? `<div>${r.ok === false ? '⚠' : '✅'} ${esc(r.name)} <span class="dim">${(r.size / 1048576).toFixed(1)} MB – uloženo ve složce ${esc(DISK.dirName())}</span></div>` : `<div>💾 <a href="${r.url}" download="${esc(r.name)}">${esc(r.name)}</a> <span class="dim">${(r.size / 1048576).toFixed(1)} MB</span></div>`).join('') : '<p class="dim">Zatím nic nenahráno.</p>';
}
function toggleRec() {
  if (R.rec) { R.rec.r.stop(); R.rec = null; }
  else { try { R.rec = {r:makeRec(outStream(), 'program', 'video', CFG.rec.vb * 1000, stamp()), start:performance.now()}; AUT.emit('rec'); } catch (e) { alert('Nahrávání nejde spustit: ' + e.message); } }
  updateHeader();
}
function toggleIso() {
  if (R.iso.length) { R.iso.forEach(r => r.stop()); R.iso = []; R.isoStart = 0; updateHeader(); return; }
  const st = stamp();
  try {
    R.iso.push(makeRec(outStream(), 'PROGRAM', 'video', CFG.rec.vb * 1000, st));
    for (const s of S.sources) {
      if (!s.stream || s.missing) continue;
      if ((s.type === 'camera' || s.type === 'screen') && s.stream.getVideoTracks().length) R.iso.push(makeRec(new MediaStream(s.stream.getTracks()), 'ISO_' + s.name, 'video', CFG.rec.isoVb * 1000, st));
      if (s.type === 'mic') R.iso.push(makeRec(new MediaStream(s.stream.getAudioTracks()), 'ISO_' + s.name, 'audio', 256000, st));
    }
    // hosté přes odkaz a síťové vstupy (NDI, SRT…) – každý zvlášť, obraz i zvuk
    for (const s of S.sources) {
      if (s.missing) continue;
      try {
        if (s.type === 'guest' && s.stream && s.stream.getVideoTracks().length) R.iso.push(makeRec(new MediaStream([...s.stream.getVideoTracks(), ...(s.guestAudio && s.guestAudio.readyState === 'live' ? [s.guestAudio] : [])]), 'ISO_' + s.name, 'video', CFG.rec.isoVb * 1000, st));
        else if (s.type === 'guest' && s.guestAudio && s.guestAudio.readyState === 'live') R.iso.push(makeRec(new MediaStream([s.guestAudio]), 'ISO_' + s.name, 'audio', 256000, st));
        if ((s.type === 'netin' || s.type === 'ndiin') && s.el instanceof HTMLCanvasElement && s._st && s._st.state === 'on') {
          const tr = s.el.captureStream(CFG.video.fps).getVideoTracks();
          if (s._an && s._an.connect) { s._isoDest = s._isoDest || actx.createMediaStreamDestination(); try { s._an.connect(s._isoDest); } catch (e) {} tr.push(...s._isoDest.stream.getAudioTracks()); }
          R.iso.push(makeRec(new MediaStream(tr), 'ISO_' + s.name.replace(/^[^\w]+\s*/, ''), 'video', CFG.rec.isoVb * 1000, st));
        }
      } catch (e) { console.warn('ISO', s.name, e); }
    }
    R.isoStart = performance.now();
  } catch (e) { alert('Nahrávání nejde spustit: ' + e.message); }
  updateHeader();
}

/* Vysílání je v js/stream.js */

/* ================= Hlavička ================= */
function updateHeader() {
  const bR = $('#bRec'), bI = $('#bIso'), bS = $('#bStream');
  bR.classList.toggle('on', !!R.rec); bR.textContent = R.rec ? '■ Stop program' : '● Program';
  bI.classList.toggle('on', R.iso.length > 0); bI.textContent = R.iso.length ? `■ Stop vše (${R.iso.length})` : '● Vše (ISO)';
  bS.classList.toggle('on', !!R.stream); bS.textContent = R.stream ? '■ Ukončit vysílání' : '⦿ Vysílat';
  CFG.awake(!!(R.stream || R.rec || R.iso.length));
}
function tickClock() {
  const now = performance.now(); let t = new Date().toLocaleTimeString('cs-CZ');
  if (R.stream) t += `  <b>${L('● ŽIVĚ')} ${fmtT(now - R.stream.start)}</b>`;
  if (R.rec) t += `  <b>REC ${fmtT(now - R.rec.start)}</b>`;
  if (R.iso.length) t += `  <b>ISO ${fmtT(now - R.isoStart)}</b>`;
  $('#clock').innerHTML = t;
  S.sources.forEach(s => { if (s.type === 'video' && s.el instanceof HTMLVideoElement) { const el = $(`[data-time="${s.id}"]`); if (el && isFinite(s.el.duration)) el.textContent = `${fmtT(s.el.currentTime * 1000)} / ${fmtT(s.el.duration * 1000)}`; } });
}

/* ================= Hlavní smyčka ================= */
const pv = $('#pv'), pg = $('#pg'); pv.width = PVW; pv.height = PVH; pg.width = W; pg.height = H;
const pvx = pv.getContext('2d'), pgx = pg.getContext('2d');
const pvBuf = document.createElement('canvas'); pvBuf.width = PVW; pvBuf.height = PVH; const pvbx = pvBuf.getContext('2d');
let lastT = performance.now();
function frame(now) {
  // vykreslovat jen tolikrát, kolik snímků má vysílání (30 fps na 120Hz displeji = 4× méně práce)
  const iv = 1000 / (CFG.video.fps || 30);
  if (now - lastFrameT < iv - 3) return; lastFrameT = now - Math.min(iv, Math.max(0, now - lastFrameT - iv));
  frameNo++; const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const prv = prevScene(), prg = sceneById(S.programId);
  V360.tick();   // 360° záběry (virtuální kamery) před vykreslením scén
  if (gl) {
    if (S.active && !TR.compose(now)) S.active = null;
    if (!S.active) { renderScene(prg); pgx.drawImage(glc, 0, 0); }
    // náhled: zmenšeně a podle zátěže méně často (program má vždy přednost)
    const every = document.hidden ? 6 : CFG.gen.preview === 'low' ? 3 : CFG.gen.preview === 'full' ? 1 : frameCost > 20 ? 3 : frameCost > 12 || CFG.video.fps > 30 ? 2 : 1;
    let pvNew = false;
    if (frameNo % every === 0) {
      if (prv === prg && !S.active) pvbx.drawImage(pg, 0, 0, PVW, PVH);
      else { renderScene(prv, true); pvbx.drawImage(glc, 0, H - PVH, PVW, PVH, 0, 0, PVW, PVH); }
      pvNew = true;
    }
    GFX.tick(dt, now); GFX.drawOverlay(pgx, now);
    NDI.frame();   // hotový program → NDI (když je zapnuté)
    RPL.tick(now); // replay: kamery do paměti + přehrávání
    OUTS.frame();  // výstup 2 (jen když je okno otevřené)
    if (!document.hidden && (pvNew || R.pvOverlayDirty)) { pvx.drawImage(pvBuf, 0, 0); drawOverlay(); R.pvOverlayDirty = false; }
  }
  const onAir = onAirSet();
  if (actx) for (const s of S.sources) {
    const a = s.audio; if (!a || !a.gainN) continue;
    let target = a.mute ? 0 : a.vol;
    if (s.type === 'video' && s.props.afv && !onAir.has(s.id)) target = 0;
    if (a._t !== target) { a.gainN.gain.setTargetAtTime(target, actx.currentTime, 0.04); a._t = target; }
    if (s.type === 'video' && s.props.pauseOff && !S.active && !onAir.has(s.id) && s.el && !s.el.paused && !s._manual) s.el.pause();
  }
  for (const m of R.meters) {
    const an = m.id === 'master' ? masterAn : (srcById(m.id) || {}).audio?.an; if (!an) continue;
    m.el.style.width = (100 - meterPct(an, m) * 100) + '%';
  }
  if (masterAn) { R._mm = R._mm || {}; (R._vuM || (R._vuM = $('#vuMaster'))).style.height = (100 - meterPct(masterAn, R._mm) * 100) + '%'; }
  const wp = R.wins.program; if (wp && !wp.closed) wp._c._x.drawImage(pg, 0, 0);
  const wm = R.wins.multi; if (wm && !wm.closed && frameNo % (frameCost > 25 ? 4 : 2) === 0) drawMulti(wm._c, onAir);
  tickPrompter(dt);
  for (const f of [() => AUD.tick(), () => GR.tick(now), () => RUN.tick(now), () => GFX.editorTick(dt, now)]) { try { f(); } catch (e) { if (!frame._e) { console.error(e); frame._e = 1; } } }
}
/* Smyčka: normálně requestAnimationFrame. Když je okno zakryté nebo minimalizované, prohlížeč ho zastaví –
   pak převezme časovač ve Workeru (ten se nebrzdí), takže vysílání, nahrávání i okna Program/Multiview běží dál. */
let lastFrameT = 0, lastRafT = 0, frameCost = 0;
function timedFrame(n) { const t0 = performance.now(); frame(n); HLT.frame(); frameCost = frameCost * 0.9 + (performance.now() - t0) * 0.1; }
function rafLoop() { lastRafT = performance.now(); timedFrame(lastRafT); requestAnimationFrame(rafLoop); }
/* Záloha běží JEN když je okno skryté (nebo rAF úplně stojí přes 1 s) a nikdy se nehromadí:
   Worker pošle další tik až poté, co hlavní vlákno ten předchozí vyřídí (ping-pong). */
function bgTick(wk) {
  const n = performance.now();
  if (document.hidden || n - lastRafT > 1000) timedFrame(n);
  if (wk) wk.postMessage(0);
}
function startLoop() {
  requestAnimationFrame(rafLoop);
  try {
    const code = 'let wait=false;onmessage=()=>{wait=false};setInterval(()=>{if(!wait){wait=true;postMessage(0)}},16)';
    const wk = new Worker(URL.createObjectURL(new Blob([code], {type:'text/javascript'})));
    wk.onmessage = () => bgTick(wk);
  } catch (e) { setInterval(() => bgTick(null), 40); }
}
function drawOverlay() {
  const l = selLayerObj(); if (!l) return; const s = srcById(l.sourceId); const r = layerRect(l, s), k = PVW / W;
  pvx.strokeStyle = '#facc15'; pvx.lineWidth = 2; pvx.setLineDash([6, 4]); pvx.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k); pvx.setLineDash([]);
  pvx.fillStyle = '#facc15';
  [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].forEach(([x, y]) => pvx.fillRect(x * k - 5, y * k - 5, 10, 10));
}

/* ================= Myš v náhledu ================= */
function toCanvas(e) {
  const rc = pv.getBoundingClientRect(), ar = W / H;
  let dw, dh, ox = 0, oy = 0;
  if (rc.width / rc.height > ar) { dh = rc.height; dw = dh * ar; ox = (rc.width - dw) / 2; } else { dw = rc.width; dh = dw / ar; oy = (rc.height - dh) / 2; }
  return {x:(e.clientX - rc.left - ox) / dw * W, y:(e.clientY - rc.top - oy) / dh * H, k:dw / W};
}
let drag = null;
pv.addEventListener('pointerdown', e => {
  const p = toCanvas(e), sc = prevScene(); if (!sc) return;
  if (S.picking) { S.picking = false; pv.style.cursor = ''; pickColor(p); return; }
  const tol = 14 / p.k, sel = selLayerObj();
  if (sel) {
    const r = layerRect(sel, srcById(sel.sourceId));
    const cs = {tl:[r.x, r.y], tr:[r.x + r.w, r.y], bl:[r.x, r.y + r.h], br:[r.x + r.w, r.y + r.h]};
    for (const c in cs) if (Math.abs(p.x - cs[c][0]) < tol && Math.abs(p.y - cs[c][1]) < tol) {
      drag = {mode:'resize', l:sel, r0:{...r}, c, ax:c.includes('l') ? r.x + r.w : r.x, ay:c.includes('t') ? r.y + r.h : r.y};
      pv.setPointerCapture(e.pointerId); return;
    }
  }
  const hit = [...sc.layers].reverse().find(l => { if (!l.visible) return false; const r = layerRect(l, srcById(l.sourceId)); return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; });
  if (hit) {
    if (S.selLayer !== hit.id) { S.selLayer = hit.id; renderLayers(); renderProps(); showTab('props'); }
    drag = {mode:'move', l:hit, ox:p.x - hit.x, oy:p.y - hit.y}; pv.setPointerCapture(e.pointerId);
  } else if (S.selLayer) { S.selLayer = null; renderLayers(); renderProps(); }
});
pv.addEventListener('pointermove', e => {
  const p = toCanvas(e);
  if (!drag) {
    const sel = selLayerObj(); let cur = S.picking ? 'crosshair' : '';
    if (sel && !S.picking) { const r = layerRect(sel, srcById(sel.sourceId)), tol = 14 / p.k;
      const nl = Math.abs(p.x - r.x) < tol, nr = Math.abs(p.x - r.x - r.w) < tol, nt = Math.abs(p.y - r.y) < tol, nb = Math.abs(p.y - r.y - r.h) < tol;
      if ((nl && nt) || (nr && nb)) cur = 'nwse-resize'; else if ((nr && nt) || (nl && nb)) cur = 'nesw-resize';
      else if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) cur = 'move'; }
    pv.style.cursor = cur; return;
  }
  const l = drag.l, s = srcById(l.sourceId);
  if (drag.mode === 'move') {
    const r = layerRect(l, s), snap = 12 / p.k; let nx = p.x - drag.ox, ny = p.y - drag.oy;
    if (!e.altKey) {
      if (Math.abs(nx) < snap) nx = 0; if (Math.abs(nx + r.w - W) < snap) nx = W - r.w; if (Math.abs(nx + r.w / 2 - W / 2) < snap) nx = (W - r.w) / 2;
      if (Math.abs(ny) < snap) ny = 0; if (Math.abs(ny + r.h - H) < snap) ny = H - r.h; if (Math.abs(ny + r.h / 2 - H / 2) < snap) ny = (H - r.h) / 2;
    }
    l.x = nx; l.y = ny;
  } else {
    const isT = s && s.type === 'text';
    let nw = Math.max(20, Math.abs(p.x - drag.ax)), nh = Math.max(20, Math.abs(p.y - drag.ay));
    if (!e.shiftKey || isT) nh = nw / (drag.r0.w / drag.r0.h);
    l.x = drag.c.includes('l') ? drag.ax - nw : drag.ax; l.y = drag.c.includes('t') ? drag.ay - nh : drag.ay;
    if (isT) l.s = nw / s.el.width; else { l.w = nw; l.h = nh; }
  }
  updatePropInputs();
});
pv.addEventListener('pointerup', () => { if (drag) { drag = null; save(); } });

/* ================= Klávesy ================= */
function onKey(e) {
  const t = e.target;
  if (t && t.tagName && ((t.tagName === 'INPUT' && !['range','checkbox','button','color'].includes(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  if ($('#dlg').open) return;
  if (GFX.key(e)) { e.preventDefault(); return; }
  if (CTL.key(e)) { e.preventDefault(); return; }
  if (false) {}
  else if (e.key === 'Escape') { S.picking = false; pv.style.cursor = ''; }
  else if (e.key === 'Delete') { const sc = prevScene(), l = selLayerObj(); if (sc && l) { sc.layers = sc.layers.filter(x => x !== l); S.selLayer = null; renderLayers(); renderProps(); save(); } }
  else if (e.key.startsWith('Arrow')) {
    const l = selLayerObj(); if (!l) return; const d = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') l.x -= d; if (e.key === 'ArrowRight') l.x += d; if (e.key === 'ArrowUp') l.y -= d; if (e.key === 'ArrowDown') l.y += d;
    updatePropInputs(); save(); e.preventDefault();
  }
}
document.addEventListener('keydown', onKey);

/* ================= Uložení projektu ================= */
function serialize() {
  return {v:1, canvas:[W, H], buses:BUS.save(), out2:OUT2.save(), out3:OUT3.save(), out4:OUT4.save(), live:LIVE.save(), pops:POP.save(), rep:RPL.save(), ext:EXT.save(), data:DAT.save(), ptz:PTZ.save(), auto:AUT.save(), sources:S.sources.map(s => ({id:s.id, type:s.type, name:s.name, guestId:s.guestId, fmt:s.fmt, deviceId:s.deviceId, res:s.res, props:s.props, micOpts:s.micOpts, color:s.color,
      audio:s.audio ? AUD.saveCh(s.audio) : null})),
    scenes:S.scenes, previewId:S.previewId, programId:S.programId, trans:S.trans,
    prompter:{text:R.prompter.text, speed:R.prompter.speed, size:R.prompter.size, mirror:R.prompter.mirror},
    streamCfg:STR.save(), rem:REM.save(), aud:AUD.save(), gfx:GFX.save(), trs:TR.save(), rundown:RUN.save(), ctl:CTL.save(), grades:GR.save()};
}
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('rezie-project', JSON.stringify(serialize())); } catch (e) { console.warn('Uložení selhalo', e); } }, 400); }
async function restore(d) {
  S.sources.forEach(s => { if (s.stream) s.stream.getTracks().forEach(t => t.stop()); if (s.el instanceof HTMLVideoElement) s.el.remove(); });
  S.sources = [];
  for (const x of d.sources || []) {
    const s = {id:x.id, type:x.type, name:x.name, guestId:x.guestId, fmt:x.fmt, deviceId:x.deviceId, res:x.res, props:x.props || {}, micOpts:x.micOpts, color:x.color ? fixColor(x.color) : undefined, hasVideo:false};
    if (x.audio) s.audio = AUD.loadCh(x.audio);
    try {
      if (s.type === 'camera') await openCamera(s);
      else if (s.type === 'mic') await openMic(s);
      else if (s.type === 'text') renderText(s);
      else if (s.type === 'color') renderColor(s);
      else if (s.type === 'image' && s.props.dataUrl) loadImageUrl(s, s.props.dataUrl);
      else if (s.type === 'replay') { s.el = document.createElement('canvas'); s.el.width = W; s.el.height = H; s.hasVideo = true; s.dirty = true; }
      else if (EXT.restore(s)) {}
      else if (NIN.restore(s)) {}
      else if (V360.restore(s)) {}
      else s.missing = true;
    } catch (e) { console.warn(e); s.missing = true; }
    S.sources.push(s);
  }
  S.scenes = d.scenes || []; S.previewId = d.previewId; S.programId = d.programId; S.trans = Object.assign({dur:600, swap:true}, d.trans || {});
  if (d.prompter) Object.assign(R.prompter, d.prompter);
  STR.load(d.streamCfg); REM.load(d.rem); RPL.load(d.rep); EXT.load(d.ext); OUT2.load(d.out2); OUT3.load(d.out3); OUT4.load(d.out4); LIVE.load(d.live); BUS.load(d.buses); DAT.load(d.data); PTZ.load(d.ptz); AUT.load(d.auto); if (window.rzNative) POP.load(d.pops);
  AUD.load(d.aud || (d.masterVol != null ? {fader:d.masterVol} : null)); GFX.load(d.gfx); TR.load(d.trs); RUN.load(d.rundown); CTL.load(d.ctl); GR.load(d.grades);
  const oc = Array.isArray(d.canvas) ? d.canvas : [1920, 1080];
  if (oc[0] !== W || oc[1] !== H) rescaleProject(oc[0], oc[1]);
  if (!sceneById(S.previewId)) S.previewId = S.scenes[0] && S.scenes[0].id;
  if (!sceneById(S.programId)) S.programId = null;
}
// jiné rozlišení plátna než při uložení → vrstvy a grafiku přepočítat (poměr stran se zachová, obsah se vycentruje)
function rescaleProject(ow, oh) {
  const k = Math.min(W / ow, H / oh), ox = (W - ow * k) / 2, oy = (H - oh * k) / 2;
  const fx = o => { if (!o || typeof o.x !== 'number') return; o.x = Math.round(o.x * k + ox); o.y = Math.round(o.y * k + oy); if (typeof o.w === 'number') o.w = Math.round(o.w * k); if (typeof o.h === 'number') o.h = Math.round(o.h * k); };
  S.scenes.forEach(sc => sc.layers.forEach(l => {
    const full = Math.abs(l.x) < 2 && Math.abs(l.y) < 2 && Math.abs(l.w - ow) < 2 && Math.abs(l.h - oh) < 2;
    if (full) { l.x = 0; l.y = 0; l.w = W; l.h = H; } else fx(l);   // přes celé plátno zůstane přes celé plátno
  }));
  (S.gfx && S.gfx.list || []).forEach(G => (G.els || []).forEach(E => { const wasFull = E.p && Math.abs(E.p.w - ow) < 2; fx(E.p); if (wasFull) { E.p.x = 0; E.p.w = W; } if (E.p && typeof E.p.size === 'number') E.p.size = Math.max(8, Math.round(E.p.size * k));
    for (const [prop, ks] of Object.entries(E.kf || {})) for (const q of ks) { if (typeof q.v !== 'number') continue; q.v = prop === 'x' ? q.v * k + ox : prop === 'y' ? q.v * k + oy : ['w', 'h', 'size'].includes(prop) ? q.v * k : q.v; } }));
  setTimeout(() => toast(L('Plátno má nové rozlišení – vrstvy jsem přepočítal. Zkontroluj rozložení scén.')), 1500);
}
async function loadProject() {
  try { S.luts = lutsFromJson(JSON.parse(localStorage.getItem('rezie-luts'))); } catch (e) { S.luts = []; }
  let d = null; try { d = JSON.parse(localStorage.getItem('rezie-project')); } catch (e) {}
  if (!d || !d.scenes) { try { const b = JSON.parse(localStorage.getItem('rezie-project-bak')); if (b && b.scenes && b.scenes.length) { d = b; setTimeout(() => toast(L('Projekt obnoven ze zálohy')), 1500); } } catch (e) {} }
  if (d && d.scenes && d.scenes.length) await restore(d);
  else {
    S.scenes = ['Kamera', 'Host', 'Znělka', 'Titulky'].map(n => ({id:uid(), name:L(n), layers:[], autoNext:null}));
    S.previewId = S.scenes[0].id;
    AUD.load(null); GFX.load(null); TR.load(null); RUN.load(null); CTL.load(null); GR.load(null); STR.load(null); REM.load(null); RPL.load(null); EXT.load(null); DAT.load(null); PTZ.load(null); AUT.load(null);
  }
}
function exportProject() {
  const blob = new Blob([JSON.stringify({...serialize(), luts:lutsJson()})], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rezie-projekt_' + stamp() + '.json'; a.click();
}
async function importProject() {
  const f = await pickFile('.json,application/json'); if (!f) return;
  try { const d = JSON.parse(await f.text()); if (d.luts) { S.luts = lutsFromJson(d.luts); saveLuts(); } await restore(d); fillStatic(); renderAll(); save(); }
  catch (e) { alert('Soubor se nepodařilo načíst: ' + e.message); }
}
function showHelp() {
  dialog('Nápověda', `<table>
  <tr><td><kbd>1</kbd>–<kbd>9</kbd></td><td>scéna do náhledu</td></tr>
  <tr><td><kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>9</kbd></td><td>scéna rovnou do vysílání</td></tr>
  <tr><td><kbd>mezerník</kbd></td><td>CUT – okamžité přepnutí náhled → program</td></tr>
  <tr><td><kbd>Enter</kbd></td><td>AUTO – vybraný přechod (T-bar = ručně)</td></tr>
  <tr><td><kbd>P</kbd></td><td>čtečka start / pauza</td></tr>
  <tr><td><kbd>F1</kbd>–<kbd>F8</kbd></td><td>grafika 1–8 IN / OUT</td></tr>
  <tr><td><kbd>N</kbd> / <kbd>B</kbd></td><td>scénář: další / předchozí blok</td></tr>

  <tr><td>šipky</td><td>posun vybrané vrstvy (Shift = o 10 px)</td></tr>
  <tr><td><kbd>Delete</kbd></td><td>odebrat vybranou vrstvu ze scény</td></tr>
  <tr><td>dvojklik na scénu</td><td>rovnou do vysílání</td></tr>
  <tr><td>Alt při tažení</td><td>vypne přichytávání k okrajům</td></tr>
  <tr><td>⊞ nahoře</td><td>rozložení: dvě záložky vedle sebe, výchozí velikosti panelů</td></tr>
  <tr><td>tažení za okraj panelu</td><td>změna velikosti (dvojklik = výchozí)</td></tr>
  <tr><td>⧉ u záložky</td><td>záložka v samostatném okně (druhý monitor)</td></tr>
  </table>
  <p class="dim">Všechny klávesy, MIDI a Stream Deck nastavíš v záložce <b>Ovládání</b>. Na stránce Grafika je mezerník přehrát / zastavit animaci a Ctrl+Z zpět.</p>
  <p class="dim">Upravuješ vždy scénu v <b>NÁHLEDU</b> (zelená). Ven jde jen <b>PROGRAM</b> (červená).<br>
  Okno „Program“ přetáhni na druhý monitor / projektor a dvojklikem ho dej na celou obrazovku.<br>
  Režie běží dál, i když je okno zakryté nebo minimalizované.</p>`, true);
}

/* ================= Statické prvky a události ================= */
function fillStatic() {
  $('#tSwap').checked = S.trans.swap;
  $('#prText').value = R.prompter.text; $('#prMirror').checked = R.prompter.mirror; updatePrompterLook();
}
function showTab(name) {
  if (!name) return;
  if (POP.hasTab(name)) { POP.open('tab-' + name); return; }   // záložka je v samostatném okně
  S.tabCur = name;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('act', b.dataset.tab === name));
  document.querySelectorAll('.tabc').forEach(c => c.classList.toggle('act', c.id === 'tab-' + name));
  if (TAB_RENDER[name]) TAB_RENDER[name]();
  POP.renderNav();
}
const TAB_RENDER = {replay:() => RPL.renderTab(), ptz:() => PTZ.renderTab(), remote:() => REM.renderTab(), stream:() => STR.renderTab(), gfxctl:() => { GFX.renderCtl(); DAT.render(); }, trans:() => TR.renderTab(), rundown:() => RUN.renderTab(), control:() => { CTL.renderTab(); AUT.render(); }, rec:() => { DISK.renderBox(); CUT.render(); }, live:() => LIVE.renderTab(), audio:() => { renderMixer(); BUS.render(); }};
function renderAll() { renderScenes(); renderLayers(); renderProps(); renderSources(); renderMixer(); renderRecs(); updateHeader(); Object.values(TAB_RENDER).forEach(f => f()); TR.renderSel(); if (S.page && S.page !== 'rezie') showPage(S.page); }
function showPage(name) {
  if (POP.has(name)) { POP.open('page-' + name); return; }   // stránka je v samostatném okně → jen ho ukázat
  S.page = name;
  document.querySelectorAll('#pages button').forEach(b => b.classList.toggle('act', b.dataset.page === name));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('act', p.id === 'page-' + name));
  if (name === 'gfx') GFX.renderPage(); if (name === 'audio') AUD.renderPage(); if (name === 'color') GR.renderPage(); if (name === 'status') MON.render();
  POP.renderNav();
}

function bindEvents() {
  document.querySelectorAll('.tabs button[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('#bCut').onclick = () => take('cut'); $('#bFade').onclick = () => take('auto');
  document.querySelectorAll('#pages button').forEach(b => b.onclick = () => showPage(b.dataset.page));
  $('#tSwap').onchange = e => { S.trans.swap = e.target.checked; save(); };
  $('#bAddScene').onclick = addScene; $('#bDupScene').onclick = dupScene; $('#bDelScene').onclick = delScene;
  $('#bMvL').onclick = () => moveScene(-1); $('#bMvR').onclick = () => moveScene(1);
  $('#scenes').onclick = e => { const b = e.target.closest('.scene'); if (b) setPreview(b.dataset.id); };
  $('#scenes').ondblclick = e => { const b = e.target.closest('.scene'); if (b) takeScene(b.dataset.id, 'cut'); };
  $('#bWinPg').onclick = () => openCanvasWin('program', 'rz_program', L('Program – výstup'));
  $('#bWinMv').onclick = () => openCanvasWin('multi', 'rz_multi', 'Multiview');
  $('#bWinPr').onclick = openPrompter; $('#prOpen').onclick = openPrompter;
  $('#bRec').onclick = toggleRec; $('#bIso').onclick = toggleIso; $('#bStream').onclick = toggleStream;
  $('#bSet').onclick = () => CFG.open(); $('#bSave').onclick = exportProject; $('#bLoad').onclick = importProject; $('#bHelp').onclick = showHelp;

  // vrstvy
  $('#layers').onclick = e => {
    const row = e.target.closest('.layer'), sc = prevScene(); if (!row || !sc) return;
    const i = sc.layers.findIndex(l => l.id === row.dataset.id), l = sc.layers[i], act = e.target.dataset.act;
    if (act === 'vis') l.visible = !l.visible;
    else if (act === 'up') { if (i < sc.layers.length - 1) [sc.layers[i], sc.layers[i + 1]] = [sc.layers[i + 1], sc.layers[i]]; }
    else if (act === 'down') { if (i > 0) [sc.layers[i], sc.layers[i - 1]] = [sc.layers[i - 1], sc.layers[i]]; }
    else if (act === 'del') { sc.layers.splice(i, 1); if (S.selLayer === l.id) S.selLayer = null; }
    else { S.selLayer = l.id; showTab('props'); }
    renderLayers(); renderProps(); save();
  };
  $('#layers').onchange = e => { if (e.target.id === 'addLayerSel' && e.target.value) addToPreview(srcById(e.target.value)); };

  // vlastnosti
  const tp = $('#tab-props');
  tp.addEventListener('input', e => {
    const el = e.target, sc = prevScene();
    if (el.dataset.sc && sc) { sc[el.dataset.sc] = el.value || null; if (el.dataset.sc === 'name') renderScenes(); save(); return; }
    if (!el.dataset.l) return; const l = selLayerObj(); if (!l) return;
    let v = val(el); if (v === null) return; if (el.dataset.mul) v /= +el.dataset.mul;
    setPath(l, el.dataset.l, v);
    const o = el.parentElement.querySelector('output'); if (o) o.textContent = fmtN(v, +el.step || 1);
    if (el.dataset.l === 'key.on') renderLayers(); save();
  });
  tp.addEventListener('change', e => { if (e.target.dataset.sc === 'autoNext') { const sc = prevScene(); if (sc) { sc.autoNext = e.target.value || null; save(); } } });
  tp.addEventListener('click', e => { const a = e.target.dataset.do; if (!a) return; if (a === 'opencolor') { const l = selLayerObj(); if (l) GR.open(l.sourceId); } else layerAction(a); });

  // zdroje
  const ts = $('#tab-sources');
  ts.addEventListener('click', e => {
    const add = e.target.dataset.add; if (add) return addSource(add);
    const sa = e.target.dataset.sa; if (!sa) return; const card = e.target.closest('.src'), s = srcById(card.dataset.id); if (!s) return;
    if (sa === 'add') addToPreview(s);
    else if (sa === 'del') removeSource(s);
    else if (sa === 'reload') reloadSource(s);
    else if (sa === 'play' && s.el) { s._manual = true; s.el.play().catch(() => {}); }
    else if (sa === 'pause' && s.el) { s._manual = false; s.el.pause(); }
    else if (sa === 'rew' && s.el) s.el.currentTime = 0;
  });
  ts.addEventListener('input', e => {
    const el = e.target; if (!el.dataset.s) return; const s = srcById(el.closest('.src').dataset.id); if (!s) return;
    const v = val(el); if (v === null) return; setPath(s, el.dataset.s, v);
    if (s.type === 'text') renderText(s);
    if (s.type === 'color') renderColor(s);
    if (s.type === 'video' && el.dataset.s === 'props.loop' && s.el) s.el.loop = v;
    if (el.dataset.s === 'name') { renderLayers(); renderMixer(); renderProps(); }
    save();
  });

  // zvuk
  const ta = $('#tab-audio');
  ta.addEventListener('input', e => {
    const el = e.target, a = el.dataset.a; if (!a) return;
    if (a === 'mvol') { masterFader.gain.value = +el.value; el.nextElementSibling.textContent = dbTxt(+el.value) + ' dB'; save(); return; }
    const s = srcById(el.closest('.ch').dataset.id); if (!s) return;
    if (a === 'vol') { s.audio.vol = +el.value; el.nextElementSibling.textContent = dbTxt(+el.value) + ' dB'; }
    if (a === 'delay') { s.audio.delay = clamp(+el.value || 0, 0, 1000); s.audio.delayN.delayTime.value = s.audio.delay / 1000; }
    if (a === 'afv') s.props.afv = el.checked;
    save();
  });
  ta.addEventListener('click', e => {
    const a = e.target.dataset.a;
    if (a === 'mon') { AUD.setMonitor(!R.monitor); e.target.classList.toggle('on2', R.monitor); }
    if (a === 'mute') { const s = srcById(e.target.closest('.ch').dataset.id); s.audio.mute = !s.audio.mute; e.target.classList.toggle('on', s.audio.mute); save(); }
  });

  // čtečka
  $('#prPlay').onclick = togglePrompter; $('#prReset').onclick = () => { R.prompter.pos = 0; };
  $('#prSpeed').oninput = e => setPrSpeed(+e.target.value);
  $('#prSize').oninput = e => { R.prompter.size = +e.target.value; updatePrompterLook(); save(); };
  $('#prMirror').onchange = e => { R.prompter.mirror = e.target.checked; updatePrompterLook(); save(); };
  $('#prText').oninput = e => { R.prompter.text = e.target.value; updatePrompterLook(); save(); };

  // vysílání

  navigator.mediaDevices.ondevicechange = () => renderSources();
  document.addEventListener('pointerdown', () => { if (actx && actx.state === 'suspended') actx.resume(); });
  window.addEventListener('beforeunload', e => { if (!window.__rzRestart && (R.stream || R.rec || R.iso.length)) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('pagehide', () => { Object.values(R.wins).forEach(w => w && !w.closed && w.close()); if (R.prompter.win && !R.prompter.win.closed) R.prompter.win.close(); });
}

$('#startBtn').onclick = async () => {
  if (!gl) return alert('Tvůj prohlížeč nepodporuje WebGL. Použij Google Chrome.');
  if (!navigator.mediaDevices) return alert('Kamery nejdou použít. Otevři aplikaci přes http://localhost:8080 (spusť node server.js) nebo jako soubor v Chrome.');
  initAudio();
  try { const st = await navigator.mediaDevices.getUserMedia({video:true, audio:true}); st.getTracks().forEach(t => t.stop()); }
  catch (e) { try { const st = await navigator.mediaDevices.getUserMedia({audio:true}); st.getTracks().forEach(t => t.stop()); } catch (_) {} }
  $('#start').remove();
  await loadProject(); fillStatic(); bindEvents();
  for (const m of [TR, GFX, AUD, GR, CTL, RUN, DISK, STR, NDI, HLT, REM, ICM, MON, RPL, DAT, EXT, PTZ, AUT, OUTS, BUS, NIN, UPD, CUT, LIVE, V360, POP, LAY]) { try { m.init(); } catch (e) { console.error(e); } }
  renderAll(); showTab(S.sources.length ? 'props' : 'sources');
  if (typeof TR.tbar !== 'function') toast('Prohlížeč má uloženou starou verzi – načti stránku znovu: Ctrl+Shift+R (Mac: Cmd+Shift+R).');
  setInterval(tickClock, 500); startLoop();
};
// po pádu okna (desktopová aplikace) se studio spustí samo a naváže na běžící vysílání
if (/[?&]recover=1/.test(location.search)) { history.replaceState(null, '', location.pathname); setTimeout(() => { const b = $('#startBtn'); if (b) b.click(); }, 300); }
