'use strict';
/* ================= Stránky v samostatných oknech (Grafika, Zvuk, Barvy → na druhý monitor) =================
   Jedno tlačítko ⧉ vedle přepínače stránek. Zavřením okna se stránka vrátí zpátky do hlavního okna. */
const POP = (() => {
  const W = new Map();   // 'page-audio' → {win, el, ph, name}
  const NAMES = {gfx:'✨ Grafika', audio:'🎚 Zvuk', color:'🎨 Barvy'};
  let keyFrom = null;
  const live = () => [...W.values()].filter(w => !w.win.closed);
  const q = s => { for (const w of live()) { const r = w.win.document.querySelector(s); if (r) return r; } return null; };
  const all = s => live().flatMap(w => [...w.win.document.querySelectorAll(s)]);
  const has = name => { const w = W.get('page-' + name); return !!(w && !w.win.closed); };
  const on = name => S.page === name || has(name);              // je stránka vidět (v hlavním okně nebo ve vlastním)
  const keyOn = name => keyFrom ? keyFrom === name : S.page === name;   // klávesové zkratky jen tam, kde se píše

  function open(name) {
    if (!NAMES[name]) return;
    const id = 'page-' + name;
    if (has(name)) { W.get(id).win.focus(); return; }
    const el = document.getElementById(id); if (!el) return;
    const win = window.open('', 'rz-' + id, 'width=1440,height=900');
    if (!win) { toast(L('Okno se nepodařilo otevřít – povol vyskakovací okna.')); return; }
    const d = win.document;
    d.open();
    d.write(`<!doctype html><html lang="${document.documentElement.lang}"><head><meta charset="utf-8"><title>${L(NAMES[name])} – Režie Live</title>
      ${[...document.querySelectorAll('link[rel=stylesheet]')].map(l => `<link rel="stylesheet" href="${l.href}">`).join('')}
      ${[...document.querySelectorAll('style')].map(s => `<style>${s.textContent}</style>`).join('')}</head>
      <body class="${document.body.className} popwin"><div id="pageWrap"></div></body></html>`);
    d.close();
    // v hlavním okně zůstane jen informace
    const ph = document.createElement('div'); ph.className = 'popph'; ph.dataset.pop = name;
    ph.innerHTML = `<div class="popmsg"><b>${L(NAMES[name])}</b> ${L('je otevřená v samostatném okně.')}<div class="btns"><button data-pp="focus">${L('Ukázat okno')}</button><button data-pp="back">${L('Vrátit do hlavního okna')}</button></div></div>`;
    ph.addEventListener('click', e => { const a = e.target.dataset.pp; if (a === 'focus') win.focus(); if (a === 'back') win.close(); });
    el.after(ph);
    d.getElementById('pageWrap').appendChild(d.adoptNode(el));
    el.classList.add('act');
    W.set(id, {win, el, ph, name});
    I18N.watch(d.body);
    // klávesové zkratky z okna jdou do režie (CUT, AUTO, scény…)
    win.addEventListener('keydown', e => { keyFrom = name; try { onKey(e); } finally { keyFrom = null; } });
    win.addEventListener('pagehide', () => back(id));
    win.addEventListener('beforeunload', () => back(id));
    if (S.page === name) showPage('rezie');
    renderNav();
    if (name === 'gfx') GFX.renderPage(); if (name === 'audio') AUD.renderPage(); if (name === 'color') GR.renderPage();
    save();
  }
  function back(id) {
    const w = W.get(id); if (!w) return; W.delete(id); try { I18N.unwatch(w.win.document.body); } catch (e) {}
    try { w.ph.replaceWith(document.adoptNode(w.el)); } catch (e) { w.ph.remove(); }
    w.el.classList.toggle('act', S.page === w.name);
    renderNav();
    if (S.page === w.name) showPage(w.name);
    try { save(); } catch (e) {}
  }
  // ⧉ u přepínače stránek: otevře aktuální stránku v okně (na Režii skryté); u stránky v okně ukazatel ↗
  function renderNav() {
    const b = $('#bPop'); if (b) b.hidden = !NAMES[S.page];
    document.querySelectorAll('#pages button').forEach(x => x.classList.toggle('popped', has(x.dataset.page)));
  }
  addEventListener('beforeunload', () => live().forEach(w => { try { w.win.close(); } catch (e) {} }));
  function init() { const b = $('#bPop'); if (b) b.onclick = () => open(S.page); renderNav(); }
  const save_ = () => live().map(w => w.name);
  function load(list) { if (Array.isArray(list) && list.length) setTimeout(() => list.forEach(n => open(n)), 600); }   // po spuštění otevřít okna jako minule
  return {init, open, q, all, has, on, keyOn, renderNav, save:save_, load};
})();
