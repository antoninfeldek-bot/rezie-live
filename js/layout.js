'use strict';
/* ================= ⊞ Rozložení: velikost panelů, dvě záložky vedle sebe =================
   – okraje mezi panely jdou táhnout myší (dvojklik = výchozí velikost)
   – „Dvě záložky vedle sebe“: dole se ukážou dvě záložky najednou (třeba Zdroje + Grafika)
   – na stránce Grafika jde měnit šířku seznamu, vlastností a výšku časové osy
   Rozložení se pamatuje v tomhle počítači. */
const LAY = (() => {
  const KEY = 'rz_layout';
  const DEF = {bh:0, a:220, b:250, gl:230, gp:340, gt:250, split:false, tab2:''};
  let C = Object.assign({}, DEF);
  try { Object.assign(C, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify(C)); } catch (e) {} };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mk = (cls, k) => { const d = document.createElement('div'); d.className = 'split ' + cls; d.dataset.k = k; d.title = L('Táhni pro změnu velikosti, dvojklik = výchozí'); return d; };

  /* ---------- stránka Režie ---------- */
  function buildRezie() {
    const pr = $('#page-rezie'), mon = $('#monitors'), bot = $('#bottom'); if (!pr || !bot || pr.querySelector('.split')) return;
    mon.after(mk('h', 'bh'));
    const panels = [...bot.children].filter(x => x.classList.contains('panel'));
    if (panels.length >= 3) { panels[0].after(mk('v', 'a')); panels[1].after(mk('v', 'b')); }
  }
  function applyRezie() {
    const pr = $('#page-rezie'), bot = $('#bottom'); if (!pr || !bot) return;
    pr.style.gridTemplateRows = `minmax(0,1fr) 6px ${C.bh ? C.bh + 'px' : 'clamp(250px,36vh,400px)'}`;
    bot.style.gridTemplateColumns = `${C.a}px 6px ${C.b}px 6px minmax(0,1fr)`;
    bot.style.gap = '2px';
  }
  /* ---------- stránka Grafika ---------- */
  function buildGfx() {
    const gx = document.querySelector('#page-gfx .gx'); if (!gx || gx.querySelector('.split')) return !!gx;
    const list = gx.querySelector('.gx-list'), stage = gx.querySelector('.gx-stage'), props = gx.querySelector('.gx-props'), tl = gx.querySelector('.gx-tl');
    if (!list || !stage || !props || !tl) return false;
    const s1 = mk('v', 'gl'), s2 = mk('v', 'gp'), s3 = mk('h', 'gt');
    list.after(s1); stage.after(s2); props.after(s3);
    const place = (el, c, r) => { el.style.gridColumn = c; el.style.gridRow = r; };
    place(list, '1', '1'); place(s1, '2', '1'); place(stage, '3', '1'); place(s2, '4', '1'); place(props, '5', '1'); place(s3, '1 / -1', '2'); place(tl, '1 / -1', '3');
    return true;
  }
  function applyGfx() {
    const gx = document.querySelector('#page-gfx .gx'); if (!gx) return;
    gx.style.gridTemplateColumns = `${C.gl}px 6px minmax(0,1fr) 6px ${C.gp}px`;
    gx.style.gridTemplateRows = `minmax(0,1fr) 6px ${C.gt}px`; gx.style.gap = '2px';
  }
  function apply() { applyRezie(); if (buildGfx()) applyGfx(); setTimeout(() => dispatchEvent(new Event('resize')), 0); }

  /* ---------- tažení za okraj ---------- */
  function drag(e) {
    const sp = e.target.closest && e.target.closest('.split'); if (!sp) return;
    e.preventDefault(); sp.setPointerCapture(e.pointerId); sp.classList.add('on');
    const k = sp.dataset.k, x0 = e.clientX, y0 = e.clientY;
    const v0 = k === 'bh' ? (C.bh || $('#bottom').getBoundingClientRect().height) : C[k];
    const move = ev => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (k === 'bh') C.bh = Math.round(clamp(v0 - dy, 140, innerHeight - 220));
      if (k === 'a' || k === 'b') C[k] = Math.round(clamp(v0 + dx, 120, 560));
      if (k === 'gl') C.gl = Math.round(clamp(v0 + dx, 140, 520));
      if (k === 'gp') C.gp = Math.round(clamp(v0 - dx, 220, 700));
      if (k === 'gt') C.gt = Math.round(clamp(v0 - dy, 120, innerHeight - 260));
      k.startsWith('g') ? applyGfx() : applyRezie();
      dispatchEvent(new Event('resize'));
    };
    const up = () => { sp.classList.remove('on'); sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); store(); };
    sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up);
  }

  /* ---------- dvě záložky vedle sebe ---------- */
  const tabPanel = () => { const t = document.querySelector('#bottom .tabs'); return t && t.closest('.panel'); };
  function buildTabs2() {
    const p = tabPanel(); if (!p) return;
    let t2 = p.querySelector('.tabs2');
    if (!C.split) { if (t2) t2.remove(); p.classList.remove('tabsplit'); document.querySelectorAll('.tabc.act2').forEach(c => c.classList.remove('act2')); return; }
    if (!t2) {
      t2 = document.createElement('div'); t2.className = 'tabs tabs2';
      t2.innerHTML = [...p.querySelectorAll('.tabs:not(.tabs2) [data-tab]')].map(b => `<button data-tab2="${b.dataset.tab}">${b.innerHTML}</button>`).join('');
      p.querySelector('.tabs').after(t2);
    }
    p.classList.add('tabsplit');
    if (!C.tab2 || C.tab2 === S.tabCur || POP.hasTab(C.tab2)) C.tab2 = ['sources', 'gfxctl', 'audio', 'props'].find(n => n !== S.tabCur && !POP.hasTab(n));
    showTab2(C.tab2);
  }
  function showTab2(name) {
    if (!C.split || !name) return;
    if (name === S.tabCur) { const old = C.tab2; showTab(old && old !== name ? old : 'props'); }   // stejná záložka vlevo → prohodit
    if (POP.hasTab(name)) { POP.open('tab-' + name); return; }
    C.tab2 = name; store();
    document.querySelectorAll('.tabs2 [data-tab2]').forEach(b => b.classList.toggle('act', b.dataset.tab2 === name));
    document.querySelectorAll('.tabc').forEach(c => c.classList.toggle('act2', c.id === 'tab-' + name));
    try { if (TAB_RENDER[name]) TAB_RENDER[name](); else if (name === 'sources') renderSources(); else if (name === 'props') renderProps(); } catch (e) { console.warn(e); }
  }
  const isShown = name => S.tabCur === name || (C.split && C.tab2 === name);

  /* ---------- nabídka ⊞ ---------- */
  function menu(e) {
    let m = document.getElementById('layMenu'); if (m) { m.remove(); return; }
    m = document.createElement('div'); m.id = 'layMenu'; m.className = 'outmenu';
    m.innerHTML = `<b>⊞ ${L('Rozložení')}</b>
      <label class="chk"><input type="checkbox" data-lay="split" ${C.split ? 'checked' : ''}> ${L('Dvě záložky vedle sebe')}</label>
      <button data-lay="reset">${L('Výchozí velikosti panelů')}</button>
      <p class="dim">${L('Velikost panelů změníš tažením za okraje mezi nimi (dvojklik = výchozí). Záložky Zdroje, Grafika, Živě, Replay, PTZ, Ovládání, Vysílání, Čtečka a Scénář jdou otevřít v samostatném okně tlačítkem ⧉ – třeba na druhý monitor.')}</p>`;
    const r = e.currentTarget.getBoundingClientRect(); m.style.left = Math.min(r.left, innerWidth - 260) + 'px'; m.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(m);
    m.addEventListener('change', ev => { if (ev.target.dataset.lay === 'split') { C.split = ev.target.checked; store(); buildTabs2(); apply(); } });
    m.addEventListener('click', ev => { const b = ev.target.closest('[data-lay=reset]'); if (!b) return; Object.assign(C, {bh:0, a:DEF.a, b:DEF.b, gl:DEF.gl, gp:DEF.gp, gt:DEF.gt}); store(); apply(); toast(L('Rozložení vráceno na výchozí')); });
    setTimeout(() => document.addEventListener('click', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
  }

  function init() {
    buildRezie(); apply(); buildTabs2();
    document.addEventListener('pointerdown', drag);
    document.addEventListener('dblclick', e => {
      const sp = e.target.closest && e.target.closest('.split'); if (!sp) return;
      const k = sp.dataset.k; C[k] = DEF[k]; store(); apply();
    });
    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-tab2]'); if (b) showTab2(b.dataset.tab2); });
    // stránka Grafika se staví až při prvním otevření
    const gp = $('#page-gfx'); if (gp) new MutationObserver(() => { if (buildGfx()) applyGfx(); }).observe(gp, {childList:true});
    // levá záložka → když je stejná jako pravá, pravá se prohodí
    const orig = window.showTab;
    window.showTab = name => { const prev = S.tabCur; orig(name); if (C.split && name === C.tab2 && prev && prev !== name) showTab2(prev); };
    const b = $('#bLayout'); if (b) b.onclick = menu;
  }
  return {init, isShown, apply};
})();
