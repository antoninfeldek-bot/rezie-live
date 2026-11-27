'use strict';
/* ================= 🖥 VÝSTUP 2: jiný obraz na další obrazovku (sál, pódium, plátno) =================
   Nezávislý na programu: může ukazovat jinou scénu, náhled nebo jeden zdroj. Dvojklik = celá obrazovka. */
function makeOut(N) {
  const KEY = 'out' + N, TITLE = L('Výstup') + ' ' + N;
  const C = () => S[KEY] || (S[KEY] = {what:'program'});
  let win = null, cv = null, cx = null;
  function options() {
    return [['program', L('Program (stejně jako vysílání)')], ['preview', L('Náhled')], ...S.scenes.map(sc => ['scene:' + sc.id, '🎬 ' + sc.name]), ...S.sources.filter(s => s.hasVideo).map(s => ['src:' + s.id, '▣ ' + s.name])];
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
    d.getElementById('o2sel').onchange = e => { C().what = e.target.value; save(); };
    // v aplikaci: rovnou na vybranou obrazovku přes celou plochu
    if (window.rzNative && window.rzNative.screens) window.rzNative.screens().then(list => {
      const sc = d.getElementById('o2scr'); if (!sc || !list || list.length < 2) return;
      sc.hidden = false; sc.innerHTML = `<option value="">${L('Na obrazovku…')}</option>` + list.map((x, i) => `<option value="${x.id}">${i + 1}: ${esc(x.label)} (${x.w}×${x.h})</option>`).join('');
      sc.onchange = () => { if (sc.value) { C().screen = sc.value; save(); window.rzNative.placeWin(TITLE + ' – Režie Live', sc.value); } };
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
  // volá se z hlavní smyčky (jen když je okno otevřené)
  let n = 0;
  function frame() {
    if (!win || win.closed || !cx) return;
    const w = C().what;
    if (w === 'program') cx.drawImage(pg, 0, 0, W, H);
    else if (w === 'preview') { const sc = prevScene(); renderScene(sc); cx.drawImage(glc, 0, 0); }
    else if (w.startsWith('scene:')) { const sc = sceneById(w.slice(6)); if (sc && sc.id === S.programId) cx.drawImage(pg, 0, 0, W, H); else { renderScene(sc); cx.drawImage(glc, 0, 0); } }
    else if (w.startsWith('src:')) { const s = srcById(w.slice(4)); cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H); if (s && s.el) drawContain(cx, s.el, 0, 0, W, H); }
    if (++n % 60 === 0) fillSel();   // nové scény/zdroje v nabídce
  }
  const load = d => { S[KEY] = Object.assign({what:'program'}, d || {}); };
  return {N, open, close, toggle, frame, load, isOpen, save:() => C()};
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
  const frame = () => { for (const o of all) o.frame(); };
  return {init, btn, frame, all};
})();
