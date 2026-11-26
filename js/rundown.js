'use strict';
/* ================= SCÉNÁŘ (rundown) ================= */
const RUN = (() => {
  const ST = {last:0};
  const mmss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const parse = v => { v = String(v).trim(); if (!v) return 0; if (v.includes(':')) { const [m, s] = v.split(':'); return (+m || 0) * 60 + (+s || 0); } return Math.round((+v || 0) * 60); };
  const R_ = () => S.rundown, items = () => S.rundown.items;
  const newItem = (title, dur) => ({id:uid(), title, dur, scene:'', gfx:'', prompt:'', notes:''});
  function go(i) {
    const r = R_(), old = items()[r.cur];
    if (old && old.gfx) { const G = GFX.byId(old.gfx); if (G) GFX.setIn(G, false); }
    r.cur = i; r.start = performance.now();
    const it = items()[i];
    if (it) {
      if (it.scene && sceneById(it.scene)) takeScene(it.scene, 'auto');
      if (it.gfx) { const G = GFX.byId(it.gfx); if (G) setTimeout(() => GFX.setIn(G, true), 400); }
      if (it.prompt) { R.prompter.text = it.prompt; R.prompter.pos = 0; $('#prText').value = it.prompt; updatePrompterLook(); }
    }
    renderTab(); save();
  }
  function startStop() {
    const r = R_();
    if (r.cur >= 0) { const old = items()[r.cur]; if (old && old.gfx) { const G = GFX.byId(old.gfx); if (G) GFX.setIn(G, false); } r.cur = -1; r.start = null; r.showStart = null; renderTab(); save(); return; }
    if (!items().length) return alert('Scénář je prázdný. Přidej bloky v záložce Scénář.');
    r.showStart = performance.now(); go(0);
  }
  function next() { const r = R_(); if (r.cur < 0) return startStop(); if (r.cur < items().length - 1) go(r.cur + 1); else startStop(); }
  function prev() { const r = R_(); if (r.cur > 0) go(r.cur - 1); }

  function timing() {
    const r = R_(), it = items()[r.cur]; if (!it) return null;
    const el = (performance.now() - r.start) / 1000, left = it.dur - el;
    let rest = 0; for (let i = r.cur + 1; i < items().length; i++) rest += items()[i].dur;
    const end = new Date(Date.now() + (Math.max(0, left) + rest) * 1000);
    return {it, el, left, over:left < 0, end, nextIt:items()[r.cur + 1], show:r.showStart ? (performance.now() - r.showStart) / 1000 : 0};
  }
  function renderTab() {
    const box = $('#tab-rundown'); if (!box || !S.rundown) return;
    const r = R_(), total = items().reduce((a, b) => a + b.dur, 0);
    const scOpt = v => `<option value="">—</option>` + S.scenes.map(s => `<option value="${s.id}" ${v === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const gOpt = v => `<option value="">—</option>` + (S.gfx ? S.gfx.list : []).map(g => `<option value="${g.id}" ${v === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
    box.innerHTML = `<div class="rdtop">
      <button id="rdStart" class="${r.cur >= 0 ? 'on' : 'primary'}">${r.cur >= 0 ? '■ Konec pořadu' : '▶ Start pořadu'}</button><button id="rdPrev">◀ Předchozí (B)</button><button id="rdNext" class="primary">Další blok ▶ (N)</button>
      <div class="rdnow" id="rdNow"></div><span class="dim">Plán celkem: ${mmss(total)}</span></div>
      <table class="rdt"><thead><tr><th>#</th><th>Blok</th><th>Délka</th><th>Přepnout na scénu</th><th>Zapnout grafiku</th><th>Text do čtečky</th><th>Poznámky</th><th></th></tr></thead><tbody>
      ${items().map((it, i) => `<tr data-id="${it.id}" class="${i === r.cur ? 'cur' : i < r.cur ? 'done' : ''}"><td><button data-ra="go" title="Skočit na tento blok">${i + 1}</button></td>
        <td><input data-rk="title" value="${esc(it.title)}"></td><td><input data-rk="dur" class="dur" value="${mmss(it.dur)}" title="minuty:sekundy"></td>
        <td><select data-rk="scene">${scOpt(it.scene)}</select></td><td><select data-rk="gfx">${gOpt(it.gfx)}</select></td>
        <td><textarea data-rk="prompt" rows="1" placeholder="(nechat stejný)">${esc(it.prompt)}</textarea></td><td><textarea data-rk="notes" rows="1">${esc(it.notes)}</textarea></td>
        <td><button data-ra="up">▲</button><button data-ra="down">▼</button><button data-ra="del">✕</button></td></tr>`).join('')}</tbody></table>
      <div class="btns"><button id="rdAdd">+ Přidat blok</button><span class="dim">Při přechodu na blok se sama přepne scéna, zapne grafika (a na konci bloku vypne) a do čtečky se nahraje text.</span></div>`;
    $('#rdStart').onclick = startStop; $('#rdNext').onclick = next; $('#rdPrev').onclick = prev;
    $('#rdAdd').onclick = () => { items().push(newItem('Nový blok', 120)); renderTab(); save(); };
    ST.last = 0; tick(performance.now());
  }
  function tick(now) {
    if (!S.rundown || now - ST.last < 250) return; ST.last = now;
    const t = timing(), mini = $('#rdMini'), nowEl = $('#rdNow');
    const txt = t ? `<b>${esc(t.it.title)}</b> <span class="${t.over ? 'over' : ''}">${t.over ? '+' : ''}${mmss(Math.abs(t.left))}</span>` : '';
    if (mini) mini.innerHTML = t ? `📋 ${txt}` : '';
    if (nowEl && nowEl.offsetParent) nowEl.innerHTML = t ? `<div class="rdbig ${t.over ? 'over' : ''}">${t.over ? 'PŘESAH +' : 'Zbývá '}${mmss(Math.abs(t.left))}</div>
      <div><b>${esc(t.it.title)}</b> · uběhlo ${mmss(t.el)} z ${mmss(t.it.dur)}<br><span class="dim">Další: ${t.nextIt ? esc(t.nextIt.title) : '— konec —'} · pořad běží ${mmss(t.show)} · konec v ${t.end.toLocaleTimeString('cs-CZ', {hour:'2-digit', minute:'2-digit'})}</span>${t.it.notes ? `<br>📝 ${esc(t.it.notes)}` : ''}</div>` : '<span class="dim">Pořad neběží.</span>';
  }
  function init() {
    const box = $('#tab-rundown');
    box.addEventListener('click', e => {
      const a = e.target.dataset.ra; if (!a) return; const id = e.target.closest('tr').dataset.id, i = items().findIndex(x => x.id === id);
      if (a === 'go') { if (R_().cur < 0) R_().showStart = performance.now(); go(i); return; }
      if (a === 'up' && i > 0) [items()[i - 1], items()[i]] = [items()[i], items()[i - 1]];
      if (a === 'down' && i < items().length - 1) [items()[i + 1], items()[i]] = [items()[i], items()[i + 1]];
      if (a === 'del' && confirm('Smazat blok?')) { items().splice(i, 1); if (R_().cur >= items().length) R_().cur = items().length - 1; }
      renderTab(); save();
    });
    box.addEventListener('change', e => {
      const k = e.target.dataset.rk; if (!k) return; const it = items().find(x => x.id === e.target.closest('tr').dataset.id); if (!it) return;
      it[k] = k === 'dur' ? parse(e.target.value) : e.target.value; if (k === 'dur') e.target.value = mmss(it.dur); save();
    });
  }
  const save_ = () => ({items:S.rundown.items});
  function load(d) {
    S.rundown = {items:d && d.items ? d.items : [newItem('Úvodní znělka', 15), newItem('Přivítání', 60), newItem('Hlavní téma', 600), newItem('Rozloučení', 60)], cur:-1, start:null, showStart:null};
  }
  return {init, load, save:save_, tick, renderTab, startStop, next, prev};
})();
