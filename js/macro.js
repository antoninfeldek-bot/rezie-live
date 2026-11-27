'use strict';
/* ================= 🎬 MAKRA: řetězení akcí s časováním =================
   Makro = seznam kroků: akce (cokoli z Ovládání), čekej N s, čekej na konec přechodu / videa, čekej na další stisk.
   Spouští se tlačítkem, klávesou, MIDI, Stream Deckem / Companion, z mobilního ovladače nebo automatizací (všechno přes akci „macro.ID“).
   Časování: každý krok se počítá od plánovaného času předchozího (ne od „teď“), takže se dlouhé makro nezpožďuje. */
const MAC = (() => {
  const C = () => S.macros || (S.macros = {list:[]});
  const RUN = new Map();     // id makra → {i, at, wait, t0}
  let sel = null;
  const STEP = {act:'▶ Akce', wait:'⏱ Čekej (s)', trans:'⏳ Čekej na konec přechodu', video:'🎞 Čekej na konec videa', press:'✋ Čekej na další stisk'};
  const byId = id => C().list.find(m => m.id === id);
  const label = id => { const a = (CTL.actions ? CTL.actions() : []).find(x => x.id === id); return a ? a.label : id ? '(' + L('chybí') + ') ' + id : '—'; };

  /* ---------- běh ---------- */
  function run(id) {
    const m = byId(id); if (!m || !m.steps.length) return;
    const r = RUN.get(id);
    if (r) {
      if (r.wait === 'press') { r.wait = null; r.i++; r.at = performance.now(); return step(id); }   // „další stisk“ pokračuje
      if (m.again === 'stop') return stop(id);
      if (m.again === 'ignore') return;
      stop(id);                                                     // restart
    }
    RUN.set(id, {i:0, at:performance.now(), wait:null, t0:performance.now()});
    draw(); step(id);
  }
  function stop(id) {
    if (id) RUN.delete(id); else RUN.clear();
    draw();
  }
  function step(id) {
    const m = byId(id), r = RUN.get(id); if (!m || !r) return;
    let guard = 0;
    while (r.i < m.steps.length && guard++ < 200) {
      const s = m.steps[r.i];
      if (s.t === 'act') { if (s.a && !String(s.a).startsWith('macro.' + id)) { try { CTL.run(s.a, s.v); } catch (e) { HLT.note(L('Makro') + ': ' + e.message); } } r.i++; continue; }
      if (s.t === 'wait') { r.wait = 'time'; r.until = r.at + Math.max(0, +s.s || 0) * 1000; break; }
      if (s.t === 'trans') { r.wait = 'trans'; r.since = performance.now(); break; }
      if (s.t === 'video') { r.wait = 'video'; r.src = s.src; r.since = performance.now(); break; }
      if (s.t === 'press') { r.wait = 'press'; break; }
      r.i++;
    }
    if (r.i >= m.steps.length && !r.wait) {
      if (m.loop) { r.i = 0; r.at = performance.now(); setTimeout(() => step(id), 0); }
      else RUN.delete(id);
    }
    draw();
  }
  function tick() {
    if (!RUN.size) return;
    const now = performance.now();
    for (const [id, r] of RUN) {
      let done = false;
      if (r.wait === 'time' && now >= r.until) { done = true; r.at = r.until; }
      else if (r.wait === 'trans' && !S.active && now - r.since > 60) { done = true; r.at = now; }
      else if (r.wait === 'video') {
        const s = srcById(r.src), v = s && s.el;
        if (!v || !(v instanceof HTMLVideoElement) || v.ended || (v.duration && v.currentTime >= v.duration - 0.05)) { done = true; r.at = now; }
        else if (now - r.since > 6 * 3600e3) done = true;
      }
      if (done) { r.wait = null; r.i++; step(id); }
    }
    if (RUN.size) progress();
  }

  /* ---------- akce pro Ovládání (klávesy, MIDI, Companion, mobil, automatizace) ---------- */
  function ctl(add) {
    C().list.forEach(m => add('macro.' + m.id, `🎬 ${L('Makro')}: ${m.name}`, () => run(m.id), 'Makra'));
    add('macro.stopall', '■ ' + L('Zastavit všechna makra'), () => stop(), 'Makra');
  }

  /* ---------- editor ---------- */
  function stepRow(m, s, i) {
    const r = RUN.get(m.id), cur = r && r.i === i;
    const acts = CTL.actions ? CTL.actions().filter(a => a.id !== 'macro.' + m.id) : [];
    let p = '';
    if (s.t === 'act') {
      const cats = [...new Set(acts.map(a => a.cat))];
      p = `<select data-ms="a" style="flex:1;min-width:220px"><option value="">— ${L('vyber akci')} —</option>${cats.map(c => `<optgroup label="${esc(L(c))}">${acts.filter(a => a.cat === c).map(a => `<option value="${esc(a.id)}" ${a.id === s.a ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</optgroup>`).join('')}
        ${s.a && !acts.some(a => a.id === s.a) ? `<option selected value="${esc(s.a)}">${esc(label(s.a))}</option>` : ''}</select>`;
      const a = acts.find(x => x.id === s.a);
      if (a && a.cont) p += `<input data-ms="v" type="number" min="0" max="1" step="0.05" value="${s.v ?? 1}" style="width:70px" title="0–1">`;
    }
    if (s.t === 'wait') p = `<input data-ms="s" type="number" min="0" step="0.1" value="${s.s ?? 1}" style="width:80px"><span class="dim">s</span>`;
    if (s.t === 'video') p = `<select data-ms="src"><option value="">— ${L('video')} —</option>${S.sources.filter(x => x.type === 'video' || x.type === 'playlist').map(x => `<option value="${x.id}" ${x.id === s.src ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
    return `<div class="mstep ${cur ? 'run' : ''}" data-i="${i}"><span class="mn mono">${i + 1}</span>
      <select data-ms="t">${Object.entries(STEP).map(([k, n]) => `<option value="${k}" ${k === s.t ? 'selected' : ''}>${L(n)}</option>`).join('')}</select>${p}
      <span class="sp"></span><button class="ghost" data-mx="up" ${i ? '' : 'disabled'} title="${L('Výš')}">↑</button><button class="ghost" data-mx="down" ${i < m.steps.length - 1 ? '' : 'disabled'} title="${L('Níž')}">↓</button>
      <button class="ghost" data-mx="test" title="${L('Vyzkoušet jen tenhle krok')}">▶</button><button class="ghost" data-mx="del" title="${L('Smazat krok')}">✕</button></div>`;
  }
  function render() {
    const host = $('#tab-control'); if (!host) return;
    let box = $('#macBox'); if (!box) { box = document.createElement('div'); box.id = 'macBox'; host.insertBefore(box, host.firstChild); }
    const L_ = C().list; if (sel && !byId(sel)) sel = null; if (!sel && L_.length) sel = L_[0].id;
    const m = byId(sel);
    box.innerHTML = `<div class="sec"><h4>🎬 ${L('Makra – řetězení akcí')}</h4>
      <div class="mlist">${L_.map(x => `<button class="mbtn ${x.id === sel ? 'sel' : ''} ${RUN.has(x.id) ? 'running' : ''}" data-mid="${x.id}"><span>${esc(x.name)}</span><small class="dim">${x.steps.length} ${L('kroků')}</small></button>`).join('')}
        <button data-mx="new">+ ${L('Nové makro')}</button><button data-mx="tpl">✨ ${L('Ze šablony')}</button></div>
      ${m ? `<div class="medit">
        <div class="row"><label style="flex:2">${L('Název')}<input data-mm="name" value="${esc(m.name)}"></label>
          <label>${L('Když už běží a spustíš ho znovu')}<select data-mm="again">${[['restart', L('začne znovu')], ['stop', L('zastaví se')], ['ignore', L('nic')]].map(([k, n]) => `<option value="${k}" ${m.again === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="chk"><input type="checkbox" data-mm="loop" ${m.loop ? 'checked' : ''}> ${L('Opakovat dokola')}</label></div>
        <div class="msteps">${m.steps.map((s, i) => stepRow(m, s, i)).join('') || `<p class="dim">${L('Zatím žádné kroky.')}</p>`}</div>
        <div class="btns"><button data-mx="add" data-t="act">+ ${L('Akce')}</button><button data-mx="add" data-t="wait">+ ${L('Čekej')}</button><button data-mx="add" data-t="trans">+ ${L('Konec přechodu')}</button><button data-mx="add" data-t="video">+ ${L('Konec videa')}</button><button data-mx="add" data-t="press">+ ${L('Další stisk')}</button>
          <span class="sp" style="flex:1"></span>
          ${RUN.has(m.id) ? `<button class="on2" data-mx="stop">■ ${L('Zastavit')}</button>` : `<button class="primary" data-mx="run">▶ ${L('Spustit')}</button>`}
          <button data-mx="dup">⧉ ${L('Duplikovat')}</button><button data-mx="delm">✕ ${L('Smazat makro')}</button></div>
        <div class="mprog"><i id="macProg"></i></div>
        <p class="dim" style="margin:6px 0 0">${L('Klávesu, MIDI nebo tlačítko Stream Decku přiřadíš níž v seznamu akcí (skupina „Makra“). Makro jde spustit i z mobilního ovladače a z automatizace.')}</p>
      </div>` : `<p class="dim">${L('Makro spustí víc věcí po sobě jedním stiskem – třeba: titulek IN → počkej 4 s → titulek OUT → přepni scénu → ztlum mikrofon.')}</p>`}</div>`;
  }
  function draw() {
    if ($('#macBox')) render();

  }
  function progress() {
    const el = $('#macProg'); if (!el || !sel) return; const r = RUN.get(sel); const m = byId(sel);
    if (!r || !m) { el.style.width = '0'; return; }
    let f = r.i / Math.max(1, m.steps.length);
    if (r.wait === 'time') { const s = m.steps[r.i]; const d = Math.max(1, (+s.s || 0) * 1000); f += Math.min(1, (performance.now() - r.at) / d) / m.steps.length; }
    el.style.width = (f * 100).toFixed(1) + '%';
  }
  const TPL = () => {
    const g0 = S.gfx && S.gfx.list[0], sc = S.scenes[1] || S.scenes[0], mic = S.sources.find(s => s.type === 'mic' || (s.audio && s.type === 'camera'));
    return [
      {name:L('Titulek na 4 s'), steps:[{t:'act', a:g0 ? 'gfx.in.0' : ''}, {t:'wait', s:4}, {t:'act', a:g0 ? 'gfx.out.0' : ''}]},
      {name:L('Přestávka'), steps:[{t:'act', a:'gfx.allout'}, {t:'act', a:sc ? 'scene.pv.' + S.scenes.indexOf(sc) : ''}, {t:'act', a:'take.auto'}, {t:'trans'}, {t:'act', a:mic ? 'mute.on.' + mic.id : ''}]},
      {name:L('Krok za krokem (další stisk)'), steps:[{t:'act', a:'scene.pv.0'}, {t:'act', a:'take.auto'}, {t:'press'}, {t:'act', a:'scene.pv.1'}, {t:'act', a:'take.auto'}]}];
  };
  function init() {
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('#macBox [data-mid],#macBox [data-mx]'); if (!b) return;
      if (b.dataset.mid) { sel = b.dataset.mid; return render(); }
      const m = byId(sel), x = b.dataset.mx, row = b.closest('[data-i]'), i = row ? +row.dataset.i : -1;
      if (x === 'new') { const n = {id:uid(), name:L('Makro') + ' ' + (C().list.length + 1), again:'restart', loop:false, steps:[{t:'act', a:''}]}; C().list.push(n); sel = n.id; }
      if (x === 'tpl') { const t = TPL(); const pick = prompt(t.map((x, i) => `${i + 1} = ${x.name}`).join('\n'), '1'); const tp = t[(+pick || 0) - 1]; if (!tp) return; const n = Object.assign({id:uid(), again:'restart', loop:false}, JSON.parse(JSON.stringify(tp))); C().list.push(n); sel = n.id; }
      if (!m && !['new', 'tpl'].includes(x)) return;
      if (x === 'add') m.steps.push(b.dataset.t === 'wait' ? {t:'wait', s:2} : {t:b.dataset.t});
      if (x === 'del') m.steps.splice(i, 1);
      if (x === 'up' && i > 0) [m.steps[i - 1], m.steps[i]] = [m.steps[i], m.steps[i - 1]];
      if (x === 'down' && i < m.steps.length - 1) [m.steps[i + 1], m.steps[i]] = [m.steps[i], m.steps[i + 1]];
      if (x === 'test') { const s = m.steps[i]; if (s.t === 'act' && s.a) CTL.run(s.a, s.v); return; }
      if (x === 'run') return run(m.id);
      if (x === 'stop') return stop(m.id);
      if (x === 'dup') { const n = JSON.parse(JSON.stringify(m)); n.id = uid(); n.name += ' (2)'; C().list.push(n); sel = n.id; }
      if (x === 'delm') { if (!confirm(L('Smazat makro?'))) return; stop(m.id); C().list = C().list.filter(y => y !== m); sel = null; }
      save(); render(); if (CTL.renderTab) CTL.renderTab();
    });
    document.addEventListener('change', e => {
      const t = e.target; if (!t.closest || !t.closest('#macBox')) return;
      const m = byId(sel); if (!m) return;
      if (t.dataset.mm) { m[t.dataset.mm] = t.type === 'checkbox' ? t.checked : t.value; save(); if (t.dataset.mm === 'name') setTimeout(() => CTL.renderTab(), 0); return; }
      const row = t.closest('[data-i]'); if (!row || !t.dataset.ms) return; const s = m.steps[+row.dataset.i];
      const k = t.dataset.ms; s[k] = t.type === 'number' ? +t.value : t.value;
      if (k === 't') { for (const kk of ['a', 'v', 's', 'src']) delete s[kk]; if (s.t === 'wait') s.s = 2; }
      save(); if (k === 't' || k === 'a') setTimeout(render, 0);
    });
    setInterval(tick, 20);
  }
  const load = d => { S.macros = {list:((d && d.list) || []).map(m => Object.assign({again:'restart', loop:false, steps:[]}, m))}; RUN.clear(); };
  const list = () => C().list.map(m => ({id:m.id, name:m.name, run:RUN.has(m.id)}));
  return {init, load, render, run, stop, ctl, list, running:id => RUN.has(id)};
})();
