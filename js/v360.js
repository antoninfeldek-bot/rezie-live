'use strict';
/* ================= 🌐 360° záběry: virtuální kamery z 360° obrazu =================
   Zdroj s obrazem 2:1 (Insta360, Ricoh Theta… jako webkamera, video, NDI/SRT) → libovolně záběrů:
   – Záběr (jako PTZ kamera): otáčení, náklon, přiblížení
   – Malá planeta, Panoráma (široký pruh), Celý 360° obraz (otočený na střed)
   Počítá se na grafice v jednom společném WebGL2 – snímek ze 360° kamery se nahraje jen jednou. */
const V360 = (() => {
  const MODES = {flat:'🎥 Záběr (virtuální kamera)', planet:'🪐 Malá planeta', pano:'🌅 Panoráma (široký pruh)', full:'🌐 Celý 360° obraz'};
  const D2R = Math.PI / 180;
  let g = null, cv = null, prog = null, U = {}, vao = null, fail = false;
  const tex = new Map();   // id zdroje 360° → {t, vf, w, h}
  const isV = s => s && s.type === 'v360';

  /* ---------- WebGL ---------- */
  const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
  const FS = `#version 300 es
precision highp float;
uniform sampler2D T; uniform vec2 R; uniform float yaw, pitch, roll, fov; uniform int mode;
out vec4 o;
const float PI = 3.14159265359;
vec4 eq(vec3 d) { d = normalize(d); float lon = atan(d.x, d.z), lat = asin(clamp(d.y, -1., 1.)); return texture(T, vec2(lon / (2. * PI) + .5, .5 - lat / PI)); }
mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, -s, 0., s, c); }
mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
void main() {
  vec2 uv = gl_FragCoord.xy / R, q = uv * 2. - 1.; q.x *= R.x / R.y;
  if (mode == 0) { float t = tan(fov * .5); o = eq(rY(yaw) * rX(pitch) * rZ(roll) * vec3(q.x * t, q.y * t, 1.)); }
  else if (mode == 1) {
    float r = length(q), k = tan(fov * .25) * .9;
    float lat = -PI * .5 + 2. * atan(r * k), lon = atan(q.x, -q.y) + yaw;
    o = eq(rX(pitch) * vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon)));
  }
  else if (mode == 2) {
    float span = fov * 2.5, lon = yaw + (uv.x - .5) * span, lat = pitch + (uv.y - .5) * span * R.y / R.x;
    o = texture(T, vec2(fract(lon / (2. * PI) + .5), clamp(.5 - lat / PI, 0., 1.)));
  }
  else o = texture(T, vec2(fract(uv.x + yaw / (2. * PI)), 1. - uv.y));
}`;
  function init_() {
    if (g || fail) return g;
    cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
    g = cv.getContext('webgl2', {premultipliedAlpha:false, preserveDrawingBuffer:true, antialias:false, powerPreference:'high-performance'});
    if (!g) { fail = true; HLT.note('360°: grafika neumí WebGL2'); return null; }
    const sh = (t, src) => { const x = g.createShader(t); g.shaderSource(x, src); g.compileShader(x); if (!g.getShaderParameter(x, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(x)); return x; };
    try {
      prog = g.createProgram(); g.attachShader(prog, sh(g.VERTEX_SHADER, VS)); g.attachShader(prog, sh(g.FRAGMENT_SHADER, FS)); g.linkProgram(prog);
      if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog));
    } catch (e) { fail = true; g = null; HLT.note('360°: ' + e.message); return null; }
    for (const n of ['T', 'R', 'yaw', 'pitch', 'roll', 'fov', 'mode']) U[n] = g.getUniformLocation(prog, n);
    vao = g.createVertexArray(); g.bindVertexArray(vao);
    const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    const loc = g.getAttribLocation(prog, 'p'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    return g;
  }
  // snímek 360° zdroje do textury (jen když je nový)
  function srcTex(p) {
    const el = p.el; if (!el) return null;
    let e = tex.get(p.id);
    if (!e) {
      const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      e = {t, vf:-1, ok:false}; tex.set(p.id, e);
    }
    let fresh = true;
    if (el instanceof HTMLVideoElement) {
      if (el.readyState < 2 || !el.videoWidth) return e.ok ? e : null;
      if (el.requestVideoFrameCallback && !el._v3) { el._v3 = 1; el._v3f = 1; const cb = () => { el._v3f++; el.requestVideoFrameCallback(cb); }; el.requestVideoFrameCallback(cb); }
      fresh = el.requestVideoFrameCallback ? e.vf !== el._v3f : true; if (fresh) e.vf = el._v3f;
    } else if (el instanceof HTMLCanvasElement) { fresh = e.vf !== (p._frames || 0) || !e.ok || p.type === 'replay' || p.type === 'web'; e.vf = p._frames || 0; }
    else if (el instanceof HTMLImageElement) { if (!(el.complete && el.naturalWidth)) return null; fresh = !e.ok; }
    if (fresh) { g.bindTexture(g.TEXTURE_2D, e.t); try { g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, el); e.ok = true; e.fresh = true; } catch (er) { return null; } }
    return e;
  }

  /* ---------- každý snímek ---------- */
  const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
  function animate(s, now) {
    const A = s._anim; if (!A) return false;
    const k = Math.min(1, (now - A.t0) / A.dur), e = ease(k), p = s.props;
    p.yaw = A.from.yaw + angDiff(A.from.yaw, A.to.yaw) * e; p.pitch = A.from.pitch + (A.to.pitch - A.from.pitch) * e; p.fov = A.from.fov + (A.to.fov - A.from.fov) * e;
    if (k >= 1) { s._anim = null; p.yaw = ((A.to.yaw + 540) % 360) - 180; save(); }
    return true;
  }
  function tick() {
    const list = S.sources.filter(isV); if (!list.length) return;
    if (!init_()) return;
    const now = performance.now();
    for (const e of tex.values()) e.fresh = false;
    for (const s of list) {
      const p = s.props, par = srcById(p.src);
      if (!par || !par.el || par === s) { s.missing = true; continue; }
      const moving = animate(s, now);
      const t = srcTex(par); if (!t) continue;
      if (!t.fresh && !moving && !s._chg && s._drawn) continue;   // nic nového → nepřekreslovat
      const [w, h] = outWH(s);
      if (!(s.el instanceof HTMLCanvasElement)) s.el = document.createElement('canvas');
      if (s.el.width !== w || s.el.height !== h) { s.el.width = w; s.el.height = h; s.aspect = w / h; }
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      g.viewport(0, 0, w, h); g.useProgram(prog); g.bindVertexArray(vao);
      g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, t.t); g.uniform1i(U.T, 0);
      g.uniform2f(U.R, w, h); g.uniform1f(U.yaw, p.yaw * D2R); g.uniform1f(U.pitch, p.pitch * D2R); g.uniform1f(U.roll, (p.roll || 0) * D2R); g.uniform1f(U.fov, p.fov * D2R);
      g.uniform1i(U.mode, ['flat', 'planet', 'pano', 'full'].indexOf(p.mode));
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      const x = s.el.getContext('2d'); x.drawImage(cv, 0, 0);
      s.dirty = true; s.hasVideo = true; s.missing = false; s._chg = false; s._drawn = true;
    }
  }
  function outWH(s) {
    const o = s.props.out || 'canvas';
    if (s.props.mode === 'full') { const par = srcById(s.props.src), el = par && par.el; const w = Math.min(3840, (el && (el.videoWidth || el.width)) || 3840); return [w & ~1, (w / 2) & ~1]; }
    if (o === 'canvas') { const k = Math.min(1, 1920 / Math.max(W, H)); return [Math.round(W * k / 2) * 2, Math.round(H * k / 2) * 2]; }
    return o.split('x').map(Number);
  }

  /* ---------- přidání ---------- */
  const cands = () => S.sources.filter(s => s.hasVideo && !isV(s) && s.el);
  function guess() { return cands().find(s => { const el = s.el, w = el.videoWidth || el.width, h = el.videoHeight || el.height; return w && h && Math.abs(w / h - 2) < 0.05; }) || cands()[0]; }
  async function add(type) {
    if (type !== 'v360') return false;
    const list = cands(); if (!list.length) { alert(L('Nejdřív přidej 360° kameru nebo video (obraz 2:1).')); return true; }
    const def = guess();
    const f = await dialog(L('360° záběr'), `<label>${L('Z jakého 360° zdroje')}<select name="src">${list.map(s => { const el = s.el, w = el.videoWidth || el.width, h = el.videoHeight || el.height; return `<option value="${s.id}" ${s === def ? 'selected' : ''}>${esc(s.name)}${w ? ` (${w}×${h}${Math.abs(w / h - 2) < 0.05 ? ' · 360°' : ''})` : ''}</option>`; }).join('')}</select></label>
      <label>${L('Režim')}<select name="mode">${Object.entries(MODES).map(([k, n]) => `<option value="${k}">${L(n)}</option>`).join('')}</select></label>
      <label>${L('Kolik záběrů vytvořit')}<select name="n"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
      <p class="dim">${L('Jedna 360° kamera = víc kamer: každý záběr můžeš natočit jinam (moderátor, host, celek) a přepínat mezi nimi jako mezi kamerami. 360° kameru přepni do režimu webkamery (USB) a v aplikaci jí dej formát 2:1 nebo „Maximum zařízení“.')}</p>`);
    if (!f) return true;
    const n = +f.n || 1, base = S.sources.filter(isV).length;
    for (let i = 0; i < n; i++) {
      const s = newSource('v360', '🌐 ' + L('360° záběr') + ' ' + (base + i + 1));
      s.props = {src:f.src, mode:f.mode, yaw:n > 1 ? -180 + (360 / n) * i + 180 / n : 0, pitch:f.mode === 'planet' ? 0 : 0, fov:f.mode === 'planet' ? 120 : f.mode === 'pano' ? 70 : 75, roll:0, out:'canvas', presets:[]};
      s.el = document.createElement('canvas'); const [ow, oh] = outWH(s); s.el.width = ow; s.el.height = oh; s.aspect = ow / oh; s.hasVideo = true; s._chg = true;
      S.sources.push(s);
      if (i === 0) addToPreview(s);
      else newSceneFor(s);
    }
    renderSources(); save(); return true;
  }
  // další záběry dostanou vlastní scénu (jako další kamera)
  function newSceneFor(s) {
    if (typeof addScene !== 'function') return null;
    const keep = S.previewId; addScene(); const sc = prevScene(); if (!sc) return null;
    sc.name = s.name.replace(/^🌐\s*/, ''); addToPreview(s); setPreview(keep); renderScenes(); return sc;
  }
  function restore(s) { if (!isV(s)) return false; s.el = document.createElement('canvas'); s.props.presets = s.props.presets || []; { const [ow, oh] = outWH(s); s.el.width = ow; s.el.height = oh; s.aspect = ow / oh; } s.hasVideo = true; s._chg = true; s.props.presets = s.props.presets || []; return true; }
  function remove(s) { if (!isV(s)) { const e = tex.get(s.id); if (e && g) { g.deleteTexture(e.t); tex.delete(s.id); } } }

  /* ---------- karta zdroje ---------- */
  function card(s) {
    if (!isV(s)) {
      const el = s.el, w = el && (el.videoWidth || el.width), h = el && (el.videoHeight || el.height);
      return s.hasVideo && w && h && Math.abs(w / h - 2) < 0.05 ? `<div class="btns"><button data-v3new="${s.id}">🌐 ${L('Udělat 360° záběry')}</button></div>` : '';
    }
    const p = s.props, par = srcById(p.src);
    const sl = (k, label, min, max, step) => `<label class="v3sl">${label} <b data-v3val="${k}">${Math.round(p[k])}°</b><input type="range" data-v3="${k}" min="${min}" max="${max}" step="${step}" value="${p[k]}"></label>`;
    return `<div class="sec"><label>${L('Zdroj')}<select data-v3="src">${cands().map(c => `<option value="${c.id}" ${c.id === p.src ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${par ? '' : `<p class="warn">${L('Zdroj 360° chybí – vyber jiný.')}</p>`}
      <label>${L('Režim')}<select data-v3="mode">${Object.entries(MODES).map(([k, n]) => `<option value="${k}" ${k === p.mode ? 'selected' : ''}>${L(n)}</option>`).join('')}</select></label>
      <div class="v3pad" data-v3pad title="${L('Táhni = natočit, kolečko = přiblížit')}">✥ ${L('Táhni sem myší = natočit · kolečko = přiblížit')}</div>
      ${sl('yaw', L('Otočení'), -180, 180, 1)}${p.mode === 'full' ? '' : sl('pitch', L('Náklon'), -90, 90, 1)}${p.mode === 'full' ? '' : sl('fov', L('Záběr (zoom)'), 20, 150, 1)}${p.mode === 'flat' ? sl('roll', L('Natočení obrazu'), -45, 45, 1) : ''}
      ${p.mode === 'full' ? '' : `<label>${L('Velikost')}<select data-v3="out"><option value="canvas" ${p.out === 'canvas' ? 'selected' : ''}>${L('Jako plátno')}</option><option value="1920x1080" ${p.out === '1920x1080' ? 'selected' : ''}>1920×1080</option><option value="1280x720" ${p.out === '1280x720' ? 'selected' : ''}>1280×720</option><option value="1080x1920" ${p.out === '1080x1920' ? 'selected' : ''}>1080×1920 (${L('na výšku')})</option><option value="1080x1080" ${p.out === '1080x1080' ? 'selected' : ''}>1080×1080</option></select></label>`}
      <div class="btns v3pre">${[1, 2, 3, 4, 5, 6].map(n => `<button data-v3go="${n}" class="${p.presets[n - 1] ? 'on' : ''}" title="${L('Klik = jet na předvolbu, Shift+klik = uložit')}">${n}</button>`).join('')}<button data-v3save>💾 ${L('Uložit předvolbu')}</button></div>
      <label class="chk"><input type="checkbox" data-v3="smooth" ${p.smooth !== false ? 'checked' : ''}> ${L('Plynulý přejezd na předvolbu')}</label>
      <p class="dim">${L('Předvolby: Shift+klik na číslo nebo „Uložit předvolbu“ a pak číslo. Na klávesy a Stream Deck je dáš v záložce Ovládání.')}</p></div>`;
  }
  function go(s, n) {
    const pr = s.props.presets[n - 1]; if (!pr) { toast(L('Předvolba') + ' ' + n + ' ' + L('není uložená')); return; }
    if (s.props.smooth === false) { Object.assign(s.props, pr); s._chg = true; save(); return; }
    s._anim = {t0:performance.now(), dur:900, from:{yaw:s.props.yaw, pitch:s.props.pitch, fov:s.props.fov}, to:pr};
  }
  function savePre(s, n) { s.props.presets[n - 1] = {yaw:Math.round(s.props.yaw), pitch:Math.round(s.props.pitch), fov:Math.round(s.props.fov)}; toast(L('Předvolba uložena') + ' ' + n); save(); renderSources(); }
  let saving = null;
  function init() {
    document.addEventListener('input', e => {
      const k = e.target.dataset && e.target.dataset.v3; if (!k || e.target.type !== 'range') return;
      const c = e.target.closest('[data-id]'), s = c && srcById(c.dataset.id); if (!isV(s)) return;
      s.props[k] = +e.target.value; s._anim = null; s._chg = true; const v = c.querySelector(`[data-v3val="${k}"]`); if (v) v.textContent = Math.round(s.props[k]) + '°';
    });
    document.addEventListener('change', e => {
      const k = e.target.dataset && e.target.dataset.v3; if (!k) return;
      const c = e.target.closest('[data-id]'), s = c && srcById(c.dataset.id); if (!isV(s)) return;
      if (e.target.type === 'range') { save(); return; }
      s.props[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; s._chg = true;
      if (k === 'mode') { s.props.fov = s.props.mode === 'planet' ? 120 : s.props.mode === 'pano' ? 70 : 75; renderSources(); }
      save();
    });
    document.addEventListener('click', e => {
      const nw = e.target.closest && e.target.closest('[data-v3new]'); if (nw) { add('v360'); return; }
      const b = e.target.closest && e.target.closest('[data-v3go],[data-v3save]'); if (!b) return;
      const c = b.closest('[data-id]'), s = c && srcById(c.dataset.id); if (!isV(s)) return;
      if (b.dataset.v3save !== undefined) { saving = s.id; toast(L('Klikni na číslo předvolby, kam uložit')); return; }
      const n = +b.dataset.v3go;
      if (e.shiftKey || saving === s.id) { saving = null; savePre(s, n); } else go(s, n);
    });
    // tažení = natočení, kolečko = přiblížení
    document.addEventListener('pointerdown', e => {
      const pad = e.target.closest && e.target.closest('[data-v3pad]'); if (!pad) return;
      const c = pad.closest('[data-id]'), s = c && srcById(c.dataset.id); if (!isV(s)) return;
      e.preventDefault(); pad.setPointerCapture(e.pointerId); s._anim = null;
      let x0 = e.clientX, y0 = e.clientY;
      const mv = ev => {
        const k = s.props.fov / 300;
        s.props.yaw = ((s.props.yaw - (ev.clientX - x0) * k * 1.5 + 540) % 360) - 180;
        s.props.pitch = Math.max(-90, Math.min(90, s.props.pitch + (ev.clientY - y0) * k * 1.5));
        x0 = ev.clientX; y0 = ev.clientY; s._chg = true; syncSl(c, s);
      };
      const up = () => { pad.removeEventListener('pointermove', mv); pad.removeEventListener('pointerup', up); save(); };
      pad.addEventListener('pointermove', mv); pad.addEventListener('pointerup', up);
    });
    document.addEventListener('wheel', e => {
      const pad = e.target.closest && e.target.closest('[data-v3pad]'); if (!pad) return;
      const c = pad.closest('[data-id]'), s = c && srcById(c.dataset.id); if (!isV(s)) return;
      e.preventDefault(); s._anim = null; s.props.fov = Math.max(20, Math.min(150, s.props.fov * (e.deltaY > 0 ? 1.06 : 0.94))); s._chg = true; syncSl(c, s); save();
    }, {passive:false});
  }
  function syncSl(c, s) { for (const k of ['yaw', 'pitch', 'fov', 'roll']) { const r = c.querySelector(`[data-v3="${k}"]`), v = c.querySelector(`[data-v3val="${k}"]`); if (r) r.value = s.props[k]; if (v) v.textContent = Math.round(s.props[k]) + '°'; } }
  const ctl = add_ => {
    S.sources.filter(isV).slice(0, 6).forEach(s => {
      for (let n = 1; n <= 6; n++) add_(`v360.${s.id}.${n}`, `🌐 ${s.name} – ${L('předvolba')} ${n}`, () => go(s, n), '360°');
    });
  };
  return {init, tick, add, restore, remove, card, ctl, go, isV};
})();
