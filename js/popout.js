'use strict';
/* ================= Ovládací panely v samostatných oknech (⧉) =================
   Čtečka, scénář, interkom, mix pult a stav vysílání se dají otevřít ve vlastním okně (třeba na druhý monitor).
   Zavřením okna se panel vrátí zpátky na své místo. */
const POP = (() => {
  const REG = {
    'page-audio':   {title:'🎚 Mix pult', page:'audio', show:() => AUD.renderPage()},
    'page-status':  {title:'📊 Stav vysílání', page:'status', show:() => MON.render()},
    'tab-prompter': {title:'📜 Čtečka', tab:'prompter', show:() => updatePrompterLook()},
    'tab-rundown':  {title:'📋 Scénář', tab:'rundown', show:() => RUN.renderTab()},
    'icom':         {title:'🎙 Interkom', panel:true, show:() => ICM.render()},
    'tab-sources':  {title:'Zdroje', tab:'sources', show:() => renderSources()},
    'tab-gfxctl':   {title:'✨ Grafika – ovládání', tab:'gfxctl', show:() => { GFX.renderCtl(); DAT.render(); }},
    'tab-live':     {title:'🏆 Živě', tab:'live', show:() => LIVE.renderTab()},
    'tab-replay':   {title:'⏪ Replay', tab:'replay', show:() => RPL.renderTab()},
    'tab-ptz':      {title:'🎥 PTZ', tab:'ptz', show:() => PTZ.renderTab()},
    'tab-control':  {title:'Ovládání', tab:'control', show:() => { CTL.renderTab(); }},
    'tab-stream':   {title:'Vysílání', tab:'stream', show:() => STR.renderTab()},
  };
  const W = new Map();   // id → {win, el, ph}
  let keyFrom = null;
  const live = () => [...W.values()].filter(w => !w.win.closed);
  const q = s => { for (const w of live()) { const r = w.win.document.querySelector(s); if (r) return r; } return null; };
  const all = s => live().flatMap(w => [...w.win.document.querySelectorAll(s)]);
  const hasId = id => { const w = W.get(id); return !!(w && !w.win.closed); };
  const has = name => hasId('page-' + name);                       // stránka (audio / status)
  const hasTab = name => hasId('tab-' + name);
  const on = name => S.page === name || has(name);                 // je stránka vidět
  const tabOn = name => (typeof LAY !== 'undefined' ? LAY.isShown(name) : S.tabCur === name) || hasTab(name);
  const keyOn = name => keyFrom ? keyFrom === name : S.page === name;
  const editable = t => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

  function open(id) {
    const R_ = REG[id]; if (!R_) return;
    if (hasId(id)) { W.get(id).win.focus(); return; }
    if (R_.panel && !document.getElementById('icom')) ICM.open();
    const el = document.getElementById(id); if (!el) return;
    const win = window.open('', 'rz-' + id, R_.panel ? 'width=680,height=760' : R_.tab ? 'width=900,height=760' : 'width=1440,height=900');
    if (!win) { toast(L('Okno se nepodařilo otevřít – povol vyskakovací okna.')); return; }
    const d = win.document;
    d.open();
    d.write(`<!doctype html><html lang="${document.documentElement.lang}"><head><meta charset="utf-8"><title>${L(R_.title)} – Režie Live</title>
      ${[...document.querySelectorAll('link[rel=stylesheet]')].map(l => `<link rel="stylesheet" href="${l.href}">`).join('')}
      ${[...document.querySelectorAll('style')].map(s => `<style>${s.textContent}</style>`).join('')}</head>
      <body class="${document.body.className} popwin ${R_.tab ? 'poptab' : R_.panel ? 'poppanel' : ''}"><div id="pageWrap"></div></body></html>`);
    d.close();
    const ph = document.createComment('pop ' + id);   // místo, kam se panel vrátí
    el.after(ph);
    d.getElementById('pageWrap').appendChild(d.adoptNode(el));
    el.classList.add('act'); el.hidden = false;
    W.set(id, {win, el, ph});
    I18N.watch(d.body);
    // klávesové zkratky z okna jdou do režie (CUT, AUTO, scény, § interkom…) – ale ne při psaní textu
    const fwd = e => {
      if (editable(e.target)) return;
      keyFrom = R_.page || R_.tab || 'panel';
      try {
        const k = new KeyboardEvent(e.type, {key:e.key, code:e.code, shiftKey:e.shiftKey, ctrlKey:e.ctrlKey, altKey:e.altKey, metaKey:e.metaKey, repeat:e.repeat, bubbles:true, cancelable:true});
        document.dispatchEvent(k); if (k.defaultPrevented) e.preventDefault();
      } finally { keyFrom = null; }
    };
    win.addEventListener('keydown', fwd); win.addEventListener('keyup', fwd);
    win.addEventListener('pagehide', () => back(id));
    win.addEventListener('beforeunload', () => back(id));
    if (R_.page && S.page === R_.page) showPage('rezie');
    if (R_.tab && S.tabCur === R_.tab) showTab('props');
    renderNav();
    try { R_.show(); } catch (e) {}
    try { save(); } catch (e) {}
  }
  function back(id) {
    const w = W.get(id); if (!w) return; W.delete(id); try { I18N.unwatch(w.win.document.body); } catch (e) {}
    const R_ = REG[id];
    try { w.ph.replaceWith(document.adoptNode(w.el)); } catch (e) { w.ph.remove(); }
    if (R_.page) w.el.classList.toggle('act', S.page === R_.page);
    if (R_.tab) w.el.classList.toggle('act', S.tabCur === R_.tab);
    if (R_.panel) ICM.close();
    renderNav();
    try { R_.show(); } catch (e) {}
    try { save(); } catch (e) {}
  }
  const close = id => { const w = W.get(id); if (w) w.win.close(); };
  // tlačítka ⧉: u stránek (Mix pult, Stav) a u záložek (Čtečka, Scénář); panel, který je v okně, má u názvu ↗
  function renderNav() {
    const b = $('#bPop'); if (b) b.hidden = !REG['page-' + S.page];
    const t = $('#bPopTab'); if (t) t.hidden = !REG['tab-' + S.tabCur];
    document.querySelectorAll('#pages button').forEach(x => x.classList.toggle('popped', has(x.dataset.page)));
    document.querySelectorAll('.tabs button[data-tab]').forEach(x => x.classList.toggle('popped', hasTab(x.dataset.tab)));
    const ic = $('#bIcom'); if (ic) ic.classList.toggle('popped', hasId('icom'));
  }
  addEventListener('beforeunload', () => live().forEach(w => { try { w.win.close(); } catch (e) {} }));
  function init() {
    const b = $('#bPop'); if (b) b.onclick = () => open('page-' + S.page);
    const t = $('#bPopTab'); if (t) t.onclick = e => { e.stopPropagation(); open('tab-' + S.tabCur); };
    renderNav();
  }
  const save_ = () => [...W].filter(([, w]) => !w.win.closed).map(([id]) => id);
  function load(list) { if (Array.isArray(list) && list.length) setTimeout(() => list.forEach(id => REG[id] && open(id)), 700); }   // po spuštění otevřít okna jako minule
  return {init, open, close, q, all, has, hasTab, hasId, on, tabOn, keyOn, renderNav, save:save_, load};
})();
