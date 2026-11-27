'use strict';
/* ================= 🖥 VÝSTUP 2: jiný obraz na další obrazovku (sál, pódium, plátno) =================
   Nezávislý na programu: může ukazovat jinou scénu, náhled nebo jeden zdroj. Dvojklik = celá obrazovka. */
const OUT2 = (() => {
  const C = () => S.out2 || (S.out2 = {what:'program'});
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
    win = window.open('', 'rz-out2', 'width=960,height=560');
    if (!win) { toast(L('Okno se nepodařilo otevřít – povol vyskakovací okna.')); return; }
    const d = win.document;
    d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${L('Výstup 2')} – Režie Live</title><style>
      html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:system-ui,sans-serif}
      canvas{width:100%;height:100%;object-fit:contain;display:block}
      #bar{position:fixed;top:8px;left:8px;display:flex;gap:6px;align-items:center;background:rgba(20,22,28,.9);color:#fff;padding:6px 10px;border-radius:8px;font-size:13px;transition:opacity .3s}
      #bar.h{opacity:0;pointer-events:none} select{font-size:14px}</style></head>
      <body><canvas id="c"></canvas><div id="bar">${L('Výstup 2 ukazuje:')} <select id="o2sel"></select> <span style="opacity:.7">${L('dvojklik = celá obrazovka')}</span></div></body></html>`);
    d.close();
    cv = d.getElementById('c'); cv.width = W; cv.height = H; cx = cv.getContext('2d');
    fillSel();
    d.getElementById('o2sel').onchange = e => { C().what = e.target.value; save(); };
    let ht = 0; const bar = d.getElementById('bar'), show = () => { bar.classList.remove('h'); clearTimeout(ht); ht = setTimeout(() => bar.classList.add('h'), 2500); };
    d.addEventListener('mousemove', show); show();
    d.addEventListener('dblclick', () => { d.fullscreenElement ? d.exitFullscreen() : d.documentElement.requestFullscreen().catch(() => {}); });
    win.addEventListener('keydown', e => { if (!/INPUT|SELECT/.test(e.target.tagName)) document.dispatchEvent(new KeyboardEvent('keydown', {key:e.key, code:e.code, shiftKey:e.shiftKey, bubbles:true, cancelable:true})); });
    win.addEventListener('beforeunload', () => { win = null; updateBtn(); });
    updateBtn();
  }
  function close() { if (win && !win.closed) win.close(); win = null; updateBtn(); }
  const toggle = () => (win && !win.closed) ? close() : open();
  function updateBtn() { const b = $('#bWinOut2'); if (b) b.classList.toggle('on', !!(win && !win.closed)); }
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
  function init() { const b = $('#bWinOut2'); if (b) b.onclick = toggle; }
  const load = d => { S.out2 = Object.assign({what:'program'}, d || {}); };
  return {init, open, close, toggle, frame, load, save:() => C()};
})();
