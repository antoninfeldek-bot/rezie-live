'use strict';
/* ================= 🖥 VÝSTUPY 2–4 a VEDLEJŠÍ PROGRAMY =================
   Každý výstup může ukazovat program, náhled, scénu, jeden zdroj – nebo být VEDLEJŠÍ PROGRAM:
   má vlastní náhled a program a přepíná se stejně jako hlavní (scény, CUT, AUTO, T-bar, klávesy),
   když ho v režii vybereš přepínačem nad CUT. Hlavní vysílání a nahrávání jedou dál beze změny.
   Okno výstupu jde poslat na další monitor / projektor. Dvojklik = celá obrazovka. */
function makeOut(N) {
  const KEY = 'out' + N, TITLE = L('Výstup') + ' ' + N;
  const C = () => S[KEY] || (S[KEY] = {what:'program'});
  let win = null, cv = null, cx = null;
  // vlastní obraz výstupu (kreslí se, když je okno otevřené nebo je výstup vybraný v režii)
  const bc = document.createElement('canvas'); bc.width = W; bc.height = H; const bcx = bc.getContext('2d');
  const sv = document.createElement('canvas'), svx = sv.getContext('2d');   // zmenšený náhled vedlejšího programu
  let TRN = null;   // probíhající přechod {from, to, t0, dur, manual, p}
  const isBus = () => C().what === 'bus';
  const busName = () => C().name || TITLE;
  function options() {
    return [['bus', '🎛 ' + L('Vedlejší program (vlastní přepínání)')], ['program', L('Program (stejně jako vysílání)')], ['preview', L('Náhled')], ...S.scenes.map(sc => ['scene:' + sc.id, '🎬 ' + sc.name]), ...S.sources.filter(s => s.hasVideo).map(s => ['src:' + s.id, '▣ ' + s.name])];
  }
  function fillSel() {
    if (!win || win.closed) return; const sel = win.document.getElementById('o2sel'); if (!sel) return;
    const cur = C().what; sel.innerHTML = options().map(([v, n]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
  }
  function open() {
    if (win && !win.closed) { win.focus(); return; }
    win = window.open('', 'rz-out' + N, 'width=960,height=560');
    if (!win) { toast(L('Okno se nepodařilo otevřít – povol vyskakovací okna.')); return; }
    const d = win.document;
    d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${TITLE} – Režie Live</title><style>
      html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:system-ui,sans-serif}
      canvas{width:100%;height:100%;object-fit:contain;display:block}
      #bar{position:fixed;top:8px;left:8px;display:flex;gap:6px;align-items:center;background:rgba(20,22,28,.9);color:#fff;padding:6px 10px;border-radius:8px;font-size:13px;transition:opacity .3s}
      #bar.h{opacity:0;pointer-events:none} select{font-size:14px}</style></head>
      <body><canvas id="c"></canvas><div id="bar">${TITLE}: <select id="o2sel"></select> <select id="o2scr" hidden></select> <span style="opacity:.7">${L('dvojklik = celá obrazovka')}</span></div></body></html>`);
    d.close();
    cv = d.getElementById('c'); cv.width = W; cv.height = H; cx = cv.getContext('2d');
    fillSel();
    d.getElementById('o2sel').onchange = e => { setWhat(e.target.value); };
    // v aplikaci: rovnou na vybranou obrazovku přes celou plochu
    if (window.rzNative && window.rzNative.screens) window.rzNative.screens().then(list => {
      const sc = d.getElementById('o2scr'); if (!sc || !list || list.length < 2) return;
      sc.hidden = false; sc.innerHTML = `<option value="">${L('Na obrazovku…')}</option>` + list.map((x, i) => `<option value="${x.id}">${i + 1}: ${esc(x.label)} (${x.w}×${x.h})</option>`).join('');
      sc.onchange = () => { if (sc.value) place(sc.value); };
      if (C().screen && list.some(x => String(x.id) === String(C().screen))) setTimeout(() => window.rzNative.placeWin(TITLE + ' – Režie Live', C().screen), 400);
    }).catch(() => {});
    let ht = 0; const bar = d.getElementById('bar'), show = () => { bar.classList.remove('h'); clearTimeout(ht); ht = setTimeout(() => bar.classList.add('h'), 2500); };
    d.addEventListener('mousemove', show); show();
    d.addEventListener('dblclick', () => { d.fullscreenElement ? d.exitFullscreen() : d.documentElement.requestFullscreen().catch(() => {}); });
    win.addEventListener('keydown', e => { if (!/INPUT|SELECT/.test(e.target.tagName)) document.dispatchEvent(new KeyboardEvent('keydown', {key:e.key, code:e.code, shiftKey:e.shiftKey, bubbles:true, cancelable:true})); });
    win.addEventListener('beforeunload', () => { win = null; updateBtn(); });
    updateBtn();
  }
  function close() { if (win && !win.closed) win.close(); win = null; updateBtn(); }
  const toggle = () => (win && !win.closed) ? close() : open();
  function updateBtn() { OUTS.btn(); }
  const isOpen = () => !!(win && !win.closed);
  /* ---------- vedlejší program: vlastní náhled a program ---------- */
  function setWhat(v) {
    C().what = v;
    if (v === 'bus') { if (!sceneById(C().pg)) C().pg = S.programId; if (!sceneById(C().pv)) C().pv = S.previewId; }
    save(); fillSel(); SIDE.draw();
  }
  function setPv(id) { if (!sceneById(id)) return; if (!isBus()) setWhat('bus'); C().pv = id; save(); SIDE.draw(); }
  const trDur = () => { const t = TR.cur && TR.cur(); return t && t.type !== 'cut' ? Math.max(100, +t.dur || 600) : 0; };
  function take(mode) {
    if (!isBus()) setWhat('bus');
    const c = C(), to = c.pv, from = c.pg; if (!to || to === from) { if (mode !== 'manual') toast(L('V náhledu výstupu je stejná scéna jako v jeho programu.')); return false; }
    const dur = mode === 'cut' ? 0 : trDur();
    if (dur && from) TRN = {from, to, t0:performance.now(), dur, manual:mode === 'manual', p:0};
    c.pg = to; if (S.trans && S.trans.swap && from) c.pv = from;   // „Prohodit“ platí i tady
    save(); SIDE.draw(); return true;
  }
  // T-bar: v = 0..1; vrací true, když je přechod hotový
  function tbar(v) {
    if (!TRN || !TRN.manual) { if (v <= 0.002) return false; if (!take('manual')) return false; if (!TRN) { TRN = {from:C().pv, to:C().pg, t0:0, dur:1, manual:true, p:0}; } }
    TRN.p = v;
    if (v >= 0.998) { TRN = null; return true; }
    if (v <= 0) { const a = TRN; TRN = null; C().pg = a.from; C().pv = a.to; save(); SIDE.draw(); }
    return false;
  }
  const tbarActive = () => !!(TRN && TRN.manual);
  function renderTo(sc, ctx) {
    if (!sc) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
    if (sc.id === S.programId && !S.active && !C().gfx) { renderScene(sc); ctx.drawImage(glc, 0, 0); return; }
    renderScene(sc); ctx.drawImage(glc, 0, 0);
  }
  function renderBus(now) {
    const c = C();
    if (TRN) {
      const p = TRN.manual ? TRN.p : Math.min(1, (now - TRN.t0) / TRN.dur), k = p * p * (3 - 2 * p);
      renderTo(sceneById(TRN.from), bcx);
      renderScene(sceneById(TRN.to)); bcx.globalAlpha = k; bcx.drawImage(glc, 0, 0); bcx.globalAlpha = 1;
      if (!TRN.manual && p >= 1) TRN = null;
    } else renderTo(sceneById(c.pg), bcx);
    if (c.gfx) GFX.drawOverlay(bcx, now);   // grafika i ve vedlejším programu (volitelně)
  }
  // volá se z hlavní smyčky: kreslí, jen když je okno otevřené nebo je výstup vybraný v režii
  let n = 0;
  function frame(now) {
    const shown = SIDE.cur() === api, open = !!(win && !win.closed && cx);
    if (!open && !shown) return;
    const w = C().what;
    if (w === 'bus') renderBus(now || performance.now());
    else if (w === 'program') bcx.drawImage(pg, 0, 0, W, H);
    else if (w === 'preview') { renderScene(prevScene()); bcx.drawImage(glc, 0, 0); }
    else if (w.startsWith('scene:')) { const sc = sceneById(w.slice(6)); if (sc && sc.id === S.programId) bcx.drawImage(pg, 0, 0, W, H); else { renderScene(sc); bcx.drawImage(glc, 0, 0); } }
    else if (w.startsWith('src:')) { const s = srcById(w.slice(4)); bcx.fillStyle = '#000'; bcx.fillRect(0, 0, W, H); if (s && s.el) drawContain(bcx, s.el, 0, 0, W, H); }
    if (open) cx.drawImage(bc, 0, 0);
    // náhled vedlejšího programu do monitoru NÁHLED v režii (zmenšeně, každý 2. snímek)
    if (shown && w === 'bus' && frameNo % 2 === 0) {
      const pvSc = sceneById(C().pv); sv.width = PVW; sv.height = PVH;
      if (pvSc) { renderScene(pvSc, true); svx.drawImage(glc, 0, H - PVH, PVW, PVH, 0, 0, PVW, PVH); } else { svx.fillStyle = '#000'; svx.fillRect(0, 0, PVW, PVH); }
    }
    if (open && ++n % 60 === 0) fillSel();   // nové scény/zdroje v nabídce
  }
  function place(id) {
    if (!window.rzNative || !window.rzNative.placeWin) return;
    if (!isOpen()) open();
    C().screen = id; save();
    setTimeout(() => window.rzNative.placeWin(TITLE + ' – Režie Live', id), isOpen() ? 300 : 600);
  }
  const load = d => { S[KEY] = Object.assign({what:'program'}, d || {}); TRN = null; };
  const api = {N, TITLE, open, close, toggle, frame, load, isOpen, save:() => C(), C, isBus, busName, setPv, take, tbar, tbarActive, setWhat, place, bc, sv,
    pv:() => C().pv, pg:() => C().pg, busy:() => !!TRN};
  return api;
}
const OUT2 = makeOut(2), OUT3 = makeOut(3), OUT4 = makeOut(4);
// tlačítko 2️⃣ v liště: nabídka výstupů 2–4
const OUTS = (() => {
  const all = [OUT2, OUT3, OUT4];
  function btn() { const b = $('#bWinOut2'); if (b) b.classList.toggle('on', all.some(o => o.isOpen())); }
  function menu(e) {
    let m = document.getElementById('outMenu'); if (m) { m.remove(); return; }
    m = document.createElement('div'); m.id = 'outMenu'; m.className = 'outmenu';
    m.innerHTML = all.map(o => `<button data-out="${o.N}">${o.isOpen() ? '✓ ' : ''}${L('Výstup')} ${o.N}</button>`).join('') + `<p class="dim">${L('Každý výstup může ukazovat něco jiného – program, náhled, scénu nebo jeden zdroj.')}</p>`;
    const r = e.currentTarget.getBoundingClientRect(); m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(m);
    m.onclick = ev => { const b = ev.target.closest('[data-out]'); if (!b) return; all[+b.dataset.out - 2].toggle(); m.remove(); };
    setTimeout(() => document.addEventListener('click', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
  }
  function init() { const b = $('#bWinOut2'); if (b) b.onclick = menu; }
  const frame = now => { for (const o of all) o.frame(now); };
  return {init, btn, frame, all};
})();

/* ---------- přepínač v režii: Hlavní program / Výstup 2 / 3 / 4 ----------
   Když je vybraný vedlejší výstup, scény, CUT, AUTO, T-bar, klávesy a MIDI v režii ovládají JEHO
   (makra, automatizace, scénář, Stream Deck a mobilní ovladač dál ovládají hlavní program). */
const SIDE = (() => {
  let curN = 0;
  const cur = () => curN ? OUTS.all[curN - 2] : null;
  const route = () => !!cur() && !!R.ui;   // jen z ovládání v režii
  let pvO = null, pgO = null;
  function select(n) {
    curN = n || 0; const o = cur();
    if (o && !o.isBus()) o.setWhat('bus');
    document.body.classList.toggle('sidebus', !!o);
    draw(); renderScenes();
  }
  function bar() {
    let b = $('#busBar');
    if (!b) { b = document.createElement('div'); b.id = 'busBar'; b.className = 'busbar'; $('#trans').prepend(b); }
    const o = cur();
    b.innerHTML = `<div class="bussel">${[0, 2, 3, 4].map(n => `<button data-bus="${n}" class="${n === curN ? 'act' : ''}" title="${n ? L('Ovládat výstup') + ' ' + n : L('Ovládat hlavní program (vysílání)')}">${n ? n : 'PGM'}</button>`).join('')}</div>
      ${o ? `<div class="busops"><button data-busa="win" class="${o.isOpen() ? 'on2' : ''}" title="${L('Otevřít / zavřít okno výstupu')}">🪟</button><button data-busa="scr" title="${L('Poslat na monitor / projektor')}">↗🖥</button>
        <button data-busa="gfx" class="${o.C().gfx ? 'on2' : ''}" title="${L('Grafika (titulky) i ve vedlejším programu')}">✨</button></div>` : ''}`;
  }
  // překryvy na monitorech NÁHLED / PROGRAM, když je vybraný vedlejší program (hlavní plátna se dál kreslí pro vysílání)
  function overlays() {
    if (!pvO) { pvO = document.createElement('canvas'); pvO.className = 'busov'; pv.parentElement.appendChild(pvO); }
    if (!pgO) { pgO = document.createElement('canvas'); pgO.className = 'busov'; pg.parentElement.appendChild(pgO); }
    const on = !!cur(); pvO.hidden = pgO.hidden = !on;
  }
  function draw() {
    bar(); overlays();
    const o = cur(), pvl = document.querySelector('.lbl.pvl'), pgl = document.querySelector('.lbl.pgl');
    const tag = o ? ` · ${o.TITLE}` : '';
    if (pvl) pvl.firstChild.textContent = L('NÁHLED') + tag + ' ';
    if (pgl) pgl.firstChild.textContent = L('PROGRAM') + tag + ' ';
    const pvs = o ? sceneById(o.pv()) : prevScene(), pgs = o ? sceneById(o.pg()) : sceneById(S.programId);
    const pn = $('#pvName'), gn = $('#pgName'); if (pn) pn.textContent = pvs ? '– ' + pvs.name : ''; if (gn) gn.textContent = pgs ? '– ' + pgs.name : '';
    document.querySelectorAll('#scenes .scene').forEach(b => {
      if (!o) return;
      b.classList.toggle('pv', b.dataset.id === o.pv()); b.classList.toggle('pg', b.dataset.id === o.pg());
    });
  }
  // každý snímek: překryvy na monitorech
  function tick() {
    const o = cur(); if (!o || !pgO) return;
    if (pgO.width !== W) { pgO.width = W; pgO.height = H; }
    pgO.getContext('2d').drawImage(o.bc, 0, 0);
    if (o.isBus() && o.sv.width) { if (pvO.width !== PVW) { pvO.width = PVW; pvO.height = PVH; } pvO.getContext('2d').drawImage(o.sv, 0, 0); }
    else if (pvO.width) { pvO.width = PVW; pvO.height = PVH; pvO.getContext('2d').drawImage(o.bc, 0, 0, PVW, PVH); }
  }
  async function screenMenu(btn) {
    const o = cur(); if (!o) return;
    if (!window.rzNative || !window.rzNative.screens) { o.open(); toast(L('Okno přetáhni na druhý monitor a dej dvojklik (celá obrazovka).')); return; }
    const list = await window.rzNative.screens().catch(() => []);
    if (!list || list.length < 2) { o.open(); toast(L('Připoj druhý monitor nebo projektor – zatím je jen jedna obrazovka.')); return; }
    let m = document.getElementById('busScr'); if (m) m.remove();
    m = document.createElement('div'); m.id = 'busScr'; m.className = 'outmenu';
    m.innerHTML = list.map((x, i) => `<button data-scr="${x.id}">${i + 1}: ${esc(x.label)} (${x.w}×${x.h})</button>`).join('');
    const r = btn.getBoundingClientRect(); m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px'; document.body.appendChild(m);
    m.onclick = ev => { const b = ev.target.closest('[data-scr]'); if (b) { o.place(b.dataset.scr); setTimeout(draw, 700); } m.remove(); };
    setTimeout(() => document.addEventListener('click', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
  }
  function init() {
    draw();
    $('#trans').addEventListener('click', e => {
      const b = e.target.closest('[data-bus]'); if (b) return select(+b.dataset.bus);
      const a = e.target.closest('[data-busa]'); if (!a) return;
      if (a.dataset.busa === 'gfx') { cur().C().gfx = !cur().C().gfx; save(); return draw(); }
      if (a.dataset.busa === 'win') { cur().toggle(); setTimeout(draw, 300); }
      if (a.dataset.busa === 'scr') screenMenu(a);
    });
  }
  // akce pro klávesy, MIDI, Stream Deck a makra – vždy na konkrétní výstup
  function ctl(add) {
    add('bus.0', '🎛 ' + L('Ovládat hlavní program'), () => select(0), 'Vedlejší programy');
    for (const o of OUTS.all) {
      add('bus.' + o.N, `🎛 ${L('Ovládat')} ${o.TITLE}`, () => select(o.N), 'Vedlejší programy');
      add(`out${o.N}.cut`, `${o.TITLE}: CUT`, () => o.take('cut'), 'Vedlejší programy');
      add(`out${o.N}.auto`, `${o.TITLE}: AUTO`, () => o.take('auto'), 'Vedlejší programy');
      for (let i = 0; i < 9; i++) {
        const sc = S.scenes[i]; if (!sc) continue;
        add(`out${o.N}.pv.${i}`, `${o.TITLE}: ${L('scéna')} ${i + 1} ${L('do náhledu')} – ${sc.name}`, () => S.scenes[i] && o.setPv(S.scenes[i].id), 'Vedlejší programy');
        add(`out${o.N}.pg.${i}`, `${o.TITLE}: ${L('scéna')} ${i + 1} ${L('rovnou do programu')} – ${sc.name}`, () => { if (S.scenes[i]) { o.setPv(S.scenes[i].id); o.take('cut'); } }, 'Vedlejší programy');
      }
      add(`out${o.N}.win`, `${o.TITLE}: ${L('okno otevřít / zavřít')}`, () => o.toggle(), 'Vedlejší programy');
    }
  }
  return {cur, route, select, draw, tick, init, ctl, N:() => curN};
})();
