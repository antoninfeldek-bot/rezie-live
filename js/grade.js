'use strict';
/* ================= BARVY: plný grading + scopy ================= */
const GR = (() => {
  const ST = {sel:null, view:'source', split:'off', scopes:['wave', 'vector'], clip:null, frame:0};
  const WHEELS = [['lift','liftY','Lift (stíny)',0.2,0.3],['gam','gamY','Gamma (středy)',0.4,0.6],['gain','gainY','Gain (světla)',0.4,0.6],['offs','offsY','Offset (vše)',0.2,0.3]];
  const SL = [['exp','Expozice (clony)',-3,3,0.05],['temp','Teplota',-1,1,0.01],['tint','Tint',-1,1,0.01],['con','Kontrast',0.5,2,0.01],['piv','Pivot kontrastu',0.2,0.7,0.005],
    ['sat','Saturace',0,2,0.01],['hue','Posun odstínů °',-180,180,1]];
  const SCOPES = {wave:'Waveform (jas)', parade:'RGB parade', vector:'Vektorskop', hist:'Histogram'};
  const ANG = [103, 223, 343].map(a => a * Math.PI / 180), UV = ANG.map(a => [Math.cos(a), -Math.sin(a)]);
  const gradable = s => s && s.hasVideo && ['camera','video','image','screen'].includes(s.type);
  const sel = () => { let s = srcById(ST.sel); if (!gradable(s)) { s = S.sources.find(gradable); ST.sel = s ? s.id : null; } return s; };

  /* ---------- křivky ---------- */
  function spline(pts) {
    const p = [...pts].sort((a, b) => a[0] - b[0]), n = p.length, out = new Float32Array(256);
    if (n < 2) { for (let i = 0; i < 256; i++) out[i] = i / 255; return out; }
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / Math.max(1e-6, p[i + 1][0] - p[i][0]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
    for (let k = 0; k < 256; k++) {
      const x = k / 255; let i = 0; while (i < n - 2 && x > p[i + 1][0]) i++;
      if (x <= p[0][0]) { out[k] = p[0][1]; continue; } if (x >= p[n - 1][0]) { out[k] = p[n - 1][1]; continue; }
      const h = p[i + 1][0] - p[i][0], t = (x - p[i][0]) / h, t2 = t * t, t3 = t2 * t;
      out[k] = clamp((2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1], 0, 1);
    }
    return out;
  }
  const defCurves = () => ({y:[[0, 0], [1, 1]], r:[[0, 0], [1, 1]], g:[[0, 0], [1, 1]], b:[[0, 0], [1, 1]]});
  function curveTexture(s) {
    const c = s.color; if (!c || !c.curves) return null;
    const ver = c._cv || 0;
    if (s._crvTex && s._crvVer === ver) return s._crvTex;
    const Y = spline(c.curves.y), Rr = spline(c.curves.r), Gg = spline(c.curves.g), Bb = spline(c.curves.b), px = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) { const y = Math.round(Y[i] * 255); px[i * 4] = Rr[y] * 255; px[i * 4 + 1] = Gg[y] * 255; px[i * 4 + 2] = Bb[y] * 255; px[i * 4 + 3] = 255; }
    if (!s._crvTex) { s._crvTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, s._crvTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); }
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, s._crvTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.activeTexture(gl.TEXTURE0);
    s._crvVer = ver; return s._crvTex;
  }

  /* ---------- stránka ---------- */
  let built = false, view, vx, scC = [], small, smx, wheelCv = [], crv, crvCh = 'y', crvDrag = -1;
  function build() {
    $('#page-color').innerHTML = `<div class="cx">
      <aside class="cx-src panel"><div class="ph">Zdroje</div><div id="cxSrc"></div>
        <div class="ph">Galerie gradů <span><button data-ca="gsave" title="Uložit aktuální grade">+</button></span></div><div id="cxLib"></div></aside>
      <section class="cx-view panel"><div class="gx-tools"><b id="cxName"></b><span class="sp"></span>
        <select id="cxView"><option value="source">Zobrazit: vybraný zdroj</option><option value="program">Zobrazit: program</option></select>
        <select id="cxSplit"><option value="off">Před / po: vypnuto</option><option value="split">Před / po: půlka</option><option value="before">Jen původní</option></select>
        <button data-ca="copy">Kopírovat grade</button><button data-ca="paste">Vložit</button><button data-ca="all">Na všechny kamery</button><button data-ca="reset">↺ Vynulovat vše</button></div>
        <div class="gx-cvw"><canvas id="cxCv" width="${W}" height="${H}"></canvas></div></section>
      <aside class="cx-scopes panel">${[0, 1].map(i => `<div class="scw"><select data-sc="${i}">${Object.entries(SCOPES).map(([k, n]) => `<option value="${k}" ${ST.scopes[i] === k ? 'selected' : ''}>${n}</option>`).join('')}</select><canvas class="scope" id="cxSc${i}" width="512" height="300"></canvas></div>`).join('')}</aside>
      <section class="cx-ctl panel"><div class="cx-wheels">${WHEELS.map((w, i) => `<div class="wh"><div class="whl">${w[2]} <button data-ca="wreset" data-w="${i}" title="Vynulovat">↺</button></div><canvas class="wheel" data-w="${i}" width="170" height="170"></canvas>
          <input type="range" class="whm" data-wm="${i}" min="${-w[4]}" max="${w[4]}" step="0.005"><div class="whv mono" data-wv="${i}"></div></div>`).join('')}</div>
        <div class="cx-curves"><div class="whl">Křivky <span class="crt">${['y','r','g','b'].map(c => `<button data-cc="${c}" class="${c === crvCh ? 'on2' : ''}">${c.toUpperCase()}</button>`).join('')}</span><button data-ca="creset" title="Vynulovat křivky">↺</button></div>
          <canvas id="cxCrv" width="256" height="256"></canvas><div class="dim" style="font-size:11px">klik = bod, táhni, dvojklik = smazat</div></div>
        <div class="cx-sl" id="cxSl"></div></section></div>`;
    view = $('#cxCv'); vx = view.getContext('2d');
    scC = [0, 1].map(i => $('#cxSc' + i)); small = document.createElement('canvas'); small.width = 256; small.height = 144; smx = small.getContext('2d', {willReadFrequently:true});
    wheelCv = $$('#page-color .wheel'); crv = $('#cxCrv');
    const pg = $('#page-color');
    pg.addEventListener('click', onClick); pg.addEventListener('input', onInput); pg.addEventListener('change', onChange);
    $('#cxView').onchange = e => ST.view = e.target.value; $('#cxSplit').onchange = e => ST.split = e.target.value;
    wheelEvents(); curveEvents(); built = true;
  }
  function renderPage() {
    if (!built) build();
    const s = sel();
    $('#cxSrc').innerHTML = S.sources.filter(gradable).map(x => `<div class="layer ${s && x.id === s.id ? 'sel' : ''}" data-cs="${x.id}"><canvas class="thumb" data-th="${x.id}" width="96" height="54"></canvas><span class="nm">${icon(x)} ${esc(x.name)}</span></div>`).join('') || '<p class="dim" style="padding:8px">Přidej kameru nebo video v Režii → Zdroje.</p>';
    $('#cxLib').innerHTML = Object.keys(S.grades || {}).map(k => `<div class="layer" data-gl="${esc(k)}"><span class="nm">🎞 ${esc(k)}</span><button data-ca="gapply">Použít</button><button data-ca="gdel">✕</button></div>`).join('') || '<p class="dim" style="padding:8px">Ulož si hotový look tlačítkem +.</p>';
    $('#cxName').textContent = s ? `${icon(s)} ${s.name}` : 'Žádný zdroj';
    renderSliders(); syncWheels(); drawCurves(); ST.frame = 0;
  }
  function renderSliders() {
    const s = sel(), box = $('#cxSl'); if (!box) return; if (!s) { box.innerHTML = ''; return; } const c = colorOf(s);
    box.innerHTML = `<div class="whl">Základní korekce</div>${SL.map(([k, l, mn, mx, st]) => `<label class="rng"><span>${l}</span><input type="range" data-cg="${k}" min="${mn}" max="${mx}" step="${st}" value="${c[k]}"><output>${fmtN(c[k], st)}</output></label>`).join('')}
      <div class="whl" style="margin-top:8px">LUT</div><div class="row"><label><select data-cg="lut"><option value="">— bez LUTu —</option>${S.luts.map(l => `<option value="${l.id}" ${c.lut === l.id ? 'selected' : ''}>${esc(l.name)} (${l.n}³)</option>`).join('')}</select></label>
      <button data-ca="lutload">📂 .cube</button>${c.lut ? '<button data-ca="lutdel" title="Smazat LUT z knihovny">🗑</button>' : ''}</div>
      <label class="rng"><span>Síla LUTu</span><input type="range" data-cg="mix" min="0" max="1" step="0.01" value="${c.mix}"><output>${fmtN(c.mix, 0.01)}</output></label>
      <p class="dim" style="font-size:11px">Pořadí: expozice/teplota → LUT → kola → kontrast → saturace → křivky.</p>`;
  }

  /* ---------- kola ---------- */
  function wheelBg(cv) {
    if (cv._bg) return cv._bg; const w = cv.width, r = w / 2 - 8, img = new ImageData(w, w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / r, dy = (y - w / 2) / r, d = Math.hypot(dx, dy), i = (y * w + x) * 4;
      if (d > 1) { img.data[i + 3] = 0; continue; }
      const c = UV.map(u => (2 / 3) * (dx * u[0] + dy * u[1]));
      for (let k = 0; k < 3; k++) img.data[i + k] = clamp(Math.round((0.32 + c[k] * 0.55) * 255), 0, 255);
      img.data[i + 3] = 255;
    }
    cv._bg = img; return img;
  }
  function drawWheel(i) {
    const cv = wheelCv[i]; if (!cv) return; const x = cv.getContext('2d'), w = cv.width, r = w / 2 - 8, s = sel();
    x.clearRect(0, 0, w, w); x.putImageData(wheelBg(cv), 0, 0);
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.beginPath(); x.moveTo(w / 2 - 8, w / 2); x.lineTo(w / 2 + 8, w / 2); x.moveTo(w / 2, w / 2 - 8); x.lineTo(w / 2, w / 2 + 8); x.stroke();
    x.strokeStyle = '#555'; x.beginPath(); x.arc(w / 2, w / 2, r, 0, 7); x.stroke();
    if (!s) return; const c = colorOf(s), [k, , , mx] = WHEELS[i], v = c[k];
    let px = 0, py = 0; for (let j = 0; j < 3; j++) { px += v[j] * UV[j][0]; py += v[j] * UV[j][1]; }
    px = w / 2 + px / mx * r; py = w / 2 + py / mx * r;
    x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.arc(px, py, 7, 0, 7); x.fill(); x.stroke(); x.lineWidth = 1;
  }
  function syncWheels() {
    const s = sel(); WHEELS.forEach((w, i) => { drawWheel(i); if (!s) return; const c = colorOf(s);
      const m = $(`[data-wm="${i}"]`); if (m && m !== document.activeElement) m.value = c[w[1]];
      const t = $(`[data-wv="${i}"]`); if (t) t.textContent = `R ${(c[w[0]][0] + c[w[1]]).toFixed(2)}  G ${(c[w[0]][1] + c[w[1]]).toFixed(2)}  B ${(c[w[0]][2] + c[w[1]]).toFixed(2)}`; });
  }
  function wheelEvents() {
    wheelCv.forEach((cv, i) => {
      let drag = false;
      const set = e => { const s = sel(); if (!s) return; const r = cv.getBoundingClientRect(), w = cv.width, rad = w / 2 - 8;
        let dx = ((e.clientX - r.left) / r.width * w - w / 2) / rad, dy = ((e.clientY - r.top) / r.height * w - w / 2) / rad;
        const d = Math.hypot(dx, dy); if (d > 1) { dx /= d; dy /= d; }
        const fine = e.shiftKey ? 0.25 : 1, [k, , , mx] = WHEELS[i], c = colorOf(s);
        c[k] = UV.map(u => +((2 / 3) * (dx * u[0] + dy * u[1]) * mx * fine).toFixed(4)); syncWheels(); };
      cv.addEventListener('pointerdown', e => { drag = true; cv.setPointerCapture(e.pointerId); set(e); });
      cv.addEventListener('pointermove', e => { if (drag) set(e); });
      cv.addEventListener('pointerup', () => { if (drag) { drag = false; save(); } });
      cv.addEventListener('dblclick', () => { const s = sel(); if (!s) return; colorOf(s)[WHEELS[i][0]] = [0, 0, 0]; syncWheels(); save(); });
    });
  }

  /* ---------- křivky UI ---------- */
  const crvCol = {y:'#e5e7eb', r:'#f87171', g:'#4ade80', b:'#60a5fa'};
  function drawCurves() {
    if (!crv) return; const x = crv.getContext('2d'), s = sel(); x.fillStyle = '#0a0b0e'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#23262c'; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, 256); x.moveTo(0, i * 64); x.lineTo(256, i * 64); x.stroke(); }
    x.strokeStyle = '#333'; x.beginPath(); x.moveTo(0, 256); x.lineTo(256, 0); x.stroke();
    if (!s) return; const cv = colorOf(s).curves || defCurves();
    ['y','r','g','b'].forEach(ch => { if (ch === crvCh) return; const L = spline(cv[ch]); if (cv[ch].length === 2 && cv[ch][0][1] === 0 && cv[ch][1][1] === 1 && cv[ch][0][0] === 0 && cv[ch][1][0] === 1) return;
      x.strokeStyle = crvCol[ch] + '66'; x.beginPath(); for (let i = 0; i < 256; i++) { const y = 255 - L[i] * 255; i ? x.lineTo(i, y) : x.moveTo(i, y); } x.stroke(); });
    const L = spline(cv[crvCh]); x.strokeStyle = crvCol[crvCh]; x.lineWidth = 2; x.beginPath();
    for (let i = 0; i < 256; i++) { const y = 255 - L[i] * 255; i ? x.lineTo(i, y) : x.moveTo(i, y); } x.stroke(); x.lineWidth = 1;
    cv[crvCh].forEach(p => { x.fillStyle = crvCol[crvCh]; x.beginPath(); x.arc(p[0] * 255, 255 - p[1] * 255, 5, 0, 7); x.fill(); });
  }
  function curveEvents() {
    const pt = e => { const r = crv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1)]; };
    const cur = () => { const s = sel(); if (!s) return null; const c = colorOf(s); if (!c.curves) c.curves = defCurves(); return c; };
    crv.addEventListener('pointerdown', e => {
      const c = cur(); if (!c) return; const [x, y] = pt(e), pts = c.curves[crvCh];
      crvDrag = pts.findIndex(p => Math.hypot(p[0] - x, p[1] - y) < 0.05);
      if (crvDrag < 0) { pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); crvDrag = pts.findIndex(p => p[0] === x && p[1] === y); }
      c._cv = (c._cv || 0) + 1; crv.setPointerCapture(e.pointerId); drawCurves();
    });
    crv.addEventListener('pointermove', e => {
      if (crvDrag < 0) return; const c = cur(), pts = c.curves[crvCh], [x, y] = pt(e), p = pts[crvDrag];
      const lo = crvDrag > 0 ? pts[crvDrag - 1][0] + 0.01 : 0, hi = crvDrag < pts.length - 1 ? pts[crvDrag + 1][0] - 0.01 : 1;
      p[0] = clamp(x, lo, hi); p[1] = y; c._cv++; drawCurves();
    });
    crv.addEventListener('pointerup', () => { if (crvDrag >= 0) { crvDrag = -1; save(); } });
    crv.addEventListener('dblclick', e => { const c = cur(); if (!c) return; const [x, y] = pt(e), pts = c.curves[crvCh]; const i = pts.findIndex(p => Math.hypot(p[0] - x, p[1] - y) < 0.05);
      if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); c._cv++; drawCurves(); save(); } });
  }

  /* ---------- události ---------- */
  async function onClick(e) {
    const t = e.target, s = sel();
    const row = t.closest('[data-cs]'); if (row && !t.dataset.ca) { ST.sel = row.dataset.cs; renderPage(); return; }
    if (t.dataset.cc) { crvCh = t.dataset.cc; $$('[data-cc]').forEach(b => b.classList.toggle('on2', b.dataset.cc === crvCh)); drawCurves(); return; }
    const a = t.dataset.ca; if (!a) return;
    if (a === 'gsave') { if (!s) return; const f = await dialog('Uložit grade', '<label>Název (např. „Studio teplé“)<input name="n"></label>'); if (f && f.n.trim()) { S.grades[f.n.trim()] = JSON.parse(JSON.stringify(colorOf(s))); renderPage(); save(); } return; }
    if (a === 'gapply' || a === 'gdel') { const k = t.closest('[data-gl]').dataset.gl;
      if (a === 'gdel') { if (confirm(`Smazat „${k}“?`)) { delete S.grades[k]; renderPage(); save(); } return; }
      if (s) { s.color = fixColor(S.grades[k]); s.color._cv = Date.now(); renderPage(); save(); } return; }
    if (!s) return; const c = colorOf(s);
    if (a === 'copy') { ST.clip = JSON.parse(JSON.stringify(c)); t.textContent = '✔ Zkopírováno'; setTimeout(() => t.textContent = 'Kopírovat grade', 1200); }
    if (a === 'paste' && ST.clip) { s.color = fixColor(ST.clip); s.color._cv = Date.now(); renderPage(); save(); }
    if (a === 'all') { const n = S.sources.filter(x => x !== s && x.type === 'camera'); if (!n.length) return alert('Žádná další kamera tu není.');
      n.forEach(x => { x.color = fixColor(c); x.color._cv = Date.now(); }); alert(`Grade zkopírován na ${n.length} kamer(y).`); save(); }
    if (a === 'reset' && confirm('Vynulovat celý grade tohoto zdroje?')) { s.color = colorDefault(); renderPage(); save(); }
    if (a === 'wreset') { const w = WHEELS[+t.dataset.w]; c[w[0]] = [0, 0, 0]; c[w[1]] = 0; syncWheels(); save(); }
    if (a === 'creset') { c.curves = null; drawCurves(); save(); }
    if (a === 'lutload') { const L = await loadLutFile(); if (L) { c.lut = L.id; c.mix = 1; renderSliders(); save(); } }
    if (a === 'lutdel') { const L = lutById(c.lut); if (!L || !confirm(`Smazat LUT „${L.name}“ ze všech zdrojů?`)) return;
      S.luts = S.luts.filter(x => x !== L); if (L.tex) gl.deleteTexture(L.tex); S.sources.forEach(x => { if (x.color && x.color.lut === L.id) x.color.lut = null; }); saveLuts(); renderSliders(); save(); }
  }
  function onInput(e) {
    const t = e.target, s = sel(); if (!s) return; const c = colorOf(s);
    if (t.dataset.cg) { if (t.dataset.cg === 'lut') { c.lut = t.value || null; renderSliders(); save(); return; }
      c[t.dataset.cg] = +t.value; const o = t.parentElement.querySelector('output'); if (o) o.textContent = fmtN(+t.value, +t.step); save(); }
    if (t.dataset.wm != null) { c[WHEELS[+t.dataset.wm][1]] = +t.value; syncWheels(); save(); }
  }
  function onChange(e) { if (e.target.dataset.sc != null) ST.scopes[+e.target.dataset.sc] = e.target.value; }
  function open(id) { ST.sel = id; showPage('color'); }

  /* ---------- náhled + scopy ---------- */
  const tmpScene = s => ({layers:[(() => { const a = s.aspect || 16 / 9; let w = W, h = W / a; if (h > H) { h = H; w = H * a; }
    return {sourceId:s.id, x:(W - w) / 2, y:(H - h) / 2, w, h, s:1, opacity:1, visible:true, crop:{l:0, t:0, r:0, b:0}, key:{on:false, color:'#00ff00', sim:0, smooth:0.1, spill:0.1}}; })()]});
  function tick(now) {
    if (S.page !== 'color' || !built || !gl) return;
    const s = sel(); ST.frame++;
    if (ST.view === 'program' || !s) vx.drawImage(pg, 0, 0);
    else {
      const sc = tmpScene(s);
      if (ST.split !== 'before') { renderScene(sc); vx.drawImage(glc, 0, 0); }
      if (ST.split !== 'off') { const keep = s.color; s.color = undefined; renderScene(sc); s.color = keep;
        if (ST.split === 'before') vx.drawImage(glc, 0, 0); else { vx.drawImage(glc, 0, 0, W / 2, H, 0, 0, W / 2, H); vx.fillStyle = '#facc15'; vx.fillRect(W / 2 - 1, 0, 3, H);
          vx.font = '600 30px system-ui'; vx.fillStyle = 'rgba(0,0,0,.6)'; vx.fillRect(20, 20, 150, 46); vx.fillRect(W - 170, 20, 150, 46); vx.fillStyle = '#fff'; vx.fillText(L('PŘED'), 50, 54); vx.fillText(L('PO'), W - 120, 54); } }
    }
    if (ST.frame % 3 === 0) { smx.drawImage(view, 0, 0, 256, 144); const d = smx.getImageData(0, 0, 256, 144).data; ST.scopes.forEach((k, i) => drawScope(scC[i], k, d)); }
    if (ST.frame % 30 === 1) $$('#cxSrc [data-th]').forEach(c => { const x = srcById(c.dataset.th); if (x) { const cx = c.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, 96, 54); drawContain(cx, x.el, 0, 0, 96, 54); } });
  }
  const acc = new Uint32Array(512 * 300 * 3);
  function drawScope(cv, kind, d) {
    if (!cv) return; const x = cv.getContext('2d'), w = cv.width, h = cv.height, img = x.createImageData(w, h), o = img.data; acc.fill(0);
    const n = d.length / 4, pw = 256;
    if (kind === 'wave' || kind === 'parade') {
      for (let i = 0; i < n; i++) {
        const px = i % pw, r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
        if (kind === 'wave') { const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, X = Math.floor(px / pw * w), yy = h - 1 - Math.floor(Y / 255 * (h - 1)), q = (yy * w + X) * 3; acc[q + 1]++; if (X + 1 < w) acc[q + 4]++; }
        else { const sw = w / 3; [r, g, b].forEach((v, c) => { const X = Math.floor(c * sw + px / pw * (sw - 2)), yy = h - 1 - Math.floor(v / 255 * (h - 1)); acc[(yy * w + X) * 3 + c]++; }); }
      }
      const f = v => v ? Math.min(255, 70 + v * 26) : 0;
      for (let p = 0; p < w * h; p++) { const a = acc[p * 3], b = acc[p * 3 + 1], c = acc[p * 3 + 2];
        if (kind === 'wave') { const v = f(b); o[p * 4] = v * 0.55; o[p * 4 + 1] = v; o[p * 4 + 2] = v * 0.55; o[p * 4 + 3] = v ? 255 : 0; }
        else { o[p * 4] = f(a); o[p * 4 + 1] = f(b); o[p * 4 + 2] = f(c); o[p * 4 + 3] = (a || b || c) ? 255 : 0; } }
      x.fillStyle = '#07080a'; x.fillRect(0, 0, w, h); const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').putImageData(img, 0, 0); x.drawImage(t, 0, 0);
      x.strokeStyle = 'rgba(255,255,255,.12)'; x.fillStyle = '#6b7280'; x.font = '10px system-ui';
      [0, 25, 50, 75, 100].forEach(pc => { const y = h - 1 - pc / 100 * (h - 1); x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); x.fillText(pc, 2, Math.max(9, y - 2)); });
      if (kind === 'parade') { x.strokeStyle = 'rgba(255,255,255,.2)'; [1, 2].forEach(i => { x.beginPath(); x.moveTo(i * w / 3, 0); x.lineTo(i * w / 3, h); x.stroke(); }); }
    } else if (kind === 'vector') {
      const S2 = Math.min(w, h), cx = w / 2, cy = h / 2, R2 = S2 / 2 - 6;
      for (let i = 0; i < n; i++) { const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
        const cb = -0.1146 * r - 0.3854 * g + 0.5 * b, cr = 0.5 * r - 0.4542 * g - 0.0458 * b, X = Math.round(cx + cb * 2 * R2), Y = Math.round(cy - cr * 2 * R2);
        if (X >= 0 && X < w && Y >= 0 && Y < h) acc[(Y * w + X) * 3]++; }
      for (let p = 0; p < w * h; p++) { const v = acc[p * 3] ? Math.min(255, 80 + acc[p * 3] * 30) : 0; o[p * 4] = v * 0.75; o[p * 4 + 1] = v; o[p * 4 + 2] = v * 0.8; o[p * 4 + 3] = v ? 255 : 0; }
      x.fillStyle = '#07080a'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(255,255,255,.15)'; x.beginPath(); x.arc(cx, cy, R2, 0, 7); x.moveTo(cx - R2, cy); x.lineTo(cx + R2, cy); x.moveTo(cx, cy - R2); x.lineTo(cx, cy + R2); x.stroke();
      const sk = [0.85, 0.62, 0.48], scb = -0.1146 * sk[0] - 0.3854 * sk[1] + 0.5 * sk[2], scr = 0.5 * sk[0] - 0.4542 * sk[1] - 0.0458 * sk[2], sl = Math.hypot(scb, scr);
      x.strokeStyle = 'rgba(251,191,36,.45)'; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + scb / sl * R2, cy - scr / sl * R2); x.stroke();
      [['R', [0.75, 0, 0]], ['Yl', [0.75, 0.75, 0]], ['G', [0, 0.75, 0]], ['Cy', [0, 0.75, 0.75]], ['B', [0, 0, 0.75]], ['Mg', [0.75, 0, 0.75]]].forEach(([l, c]) => {
        const cb = -0.1146 * c[0] - 0.3854 * c[1] + 0.5 * c[2], cr = 0.5 * c[0] - 0.4542 * c[1] - 0.0458 * c[2], X = cx + cb * 2 * R2, Y = cy - cr * 2 * R2;
        x.strokeStyle = 'rgba(255,255,255,.4)'; x.strokeRect(X - 5, Y - 5, 10, 10); x.fillStyle = '#9ca3af'; x.font = '10px system-ui'; x.fillText(l, X + 7, Y + 3); });
      const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').putImageData(img, 0, 0); x.globalCompositeOperation = 'lighter'; x.drawImage(t, 0, 0); x.globalCompositeOperation = 'source-over';
      x.fillStyle = '#6b7280'; x.fillText(L('žlutá čára = tón pleti'), 6, h - 6);
    } else {
      const hs = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
      for (let i = 0; i < n; i++) { hs[0][d[i * 4]]++; hs[1][d[i * 4 + 1]]++; hs[2][d[i * 4 + 2]]++; }
      let mx = 1; hs.forEach(a => { for (let i = 1; i < 255; i++) mx = Math.max(mx, a[i]); });
      x.fillStyle = '#07080a'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'lighter';
      ['rgba(248,113,113,.7)', 'rgba(74,222,128,.7)', 'rgba(96,165,250,.7)'].forEach((col, c) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, h);
        for (let i = 0; i < 256; i++) x.lineTo(i / 255 * w, h - Math.min(1, hs[c][i] / mx) * (h - 10)); x.lineTo(w, h); x.fill(); });
      x.globalCompositeOperation = 'source-over';
    }
  }
  const save_ = () => S.grades || {};
  function load(d) { S.grades = d || {}; }
  return {init() {}, open, renderPage, tick, curveTexture, save:save_, load};
})();
