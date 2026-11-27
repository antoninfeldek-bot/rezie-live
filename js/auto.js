'use strict';
/* ================= ⚙ AUTOMATIZACE: „když se stane X, udělej Y“ =================
   Spouštěče: scéna jde do vysílání, video skončilo, začal blok scénáře, čas, každých N s, start vysílání / nahrávání.
   Akce: cokoli ze seznamu v Ovládání (přepnout scénu, grafika, zvuk, replay, PTZ předvolba…), i se zpožděním. */
const AUT = (() => {
  const C = () => S.auto || (S.auto = {rules:[]});
  const WHEN = {scene:'🎬 Scéna jde do vysílání', vend:'🎞 Video skončilo', block:'📋 Začal blok scénáře', time:'🕐 V čase (HH:MM)', every:'🔁 Každých N sekund', stream:'📡 Začalo vysílání', rec:'⏺ Začalo nahrávání'};
  const fired = new Map();   // pravidlo → poslední spuštění
  function run(r) {
    if (!r.on || !r.act) return;
    const go = () => { try { CTL.run(r.act); } catch (e) { HLT.note('Automatizace: ' + e.message); } };
    r.delay > 0 ? setTimeout(go, r.delay * 1000) : go();
  }
  function emit(type, v) { for (const r of C().rules) if (r.when === type && (!r.v || String(r.v) === String(v))) run(r); }
  function tick() {
    const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), now = Date.now();
    for (const r of C().rules) {
      if (r.when === 'time' && r.v === hm && fired.get(r.id) !== d.toDateString() + hm) { fired.set(r.id, d.toDateString() + hm); run(r); }
      if (r.when === 'every' && +r.v > 0 && now - (fired.get(r.id) || 0) >= +r.v * 1000) { fired.set(r.id, now); if (fired.has(r.id + 'started')) run(r); else fired.set(r.id + 'started', 1); }
    }
  }
  function valueField(r) {
    if (r.when === 'scene') return `<select data-ak="v"><option value="">${L('jakákoli')}</option>${S.scenes.map(s => `<option value="${s.id}" ${s.id === r.v ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
    if (r.when === 'vend') return `<select data-ak="v"><option value="">${L('jakékoli')}</option>${S.sources.filter(s => s.type === 'video' || s.type === 'playlist').map(s => `<option value="${s.id}" ${s.id === r.v ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
    if (r.when === 'block') return `<input data-ak="v" value="${esc(r.v || '')}" placeholder="${L('číslo bloku (prázdné = každý)')}" style="width:150px">`;
    if (r.when === 'time') return `<input data-ak="v" type="time" value="${esc(r.v || '')}">`;
    if (r.when === 'every') return `<input data-ak="v" type="number" min="1" value="${esc(r.v || 30)}" style="width:80px"> s`;
    return '';
  }
  function render() {
    const host = $('#tab-control'); if (!host) return;
    let box = $('#autBox'); if (!box) { box = document.createElement('div'); box.id = 'autBox'; host.appendChild(box); }
    const acts = CTL.actions ? CTL.actions() : [];
    box.innerHTML = `<div class="sec"><h4>⚙ ${L('Automatizace – když se stane X, udělej Y')}</h4>
      ${C().rules.map(r => `<div class="autrow" data-rid="${r.id}"><input type="checkbox" data-ak="on" ${r.on ? 'checked' : ''} title="${L('zapnuto')}">
        <b>${L('Když')}</b><select data-ak="when">${Object.entries(WHEN).map(([k, n]) => `<option value="${k}" ${r.when === k ? 'selected' : ''}>${L(n)}</option>`).join('')}</select>${valueField(r)}
        <b>→</b><select data-ak="act"><option value="">— ${L('akce')} —</option>${acts.map(a => `<option value="${a.id}" ${a.id === r.act ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select>
        <span class="dim">${L('za')}</span><input data-ak="delay" type="number" min="0" step="0.5" value="${r.delay || 0}" style="width:60px"><span class="dim">s</span><button data-aa="test">▶</button><button data-aa="del">✕</button></div>`).join('') || `<p class="dim">${L('Např.: když skončí znělka → přepni na Kameru 1; když začne vysílání → pusť grafiku s logem; v 19:59 → scéna Odpočet.')}</p>`}
      <div class="btns"><button data-aa="add">+ ${L('Přidat pravidlo')}</button></div></div>`;
  }
  function init() {
    document.addEventListener('change', e => {
      const row = e.target.closest && e.target.closest('#autBox [data-rid]'); if (!row) return;
      const r = C().rules.find(x => x.id === row.dataset.rid), k = e.target.dataset.ak; if (!r || !k) return;
      r[k] = e.target.type === 'checkbox' ? e.target.checked : k === 'delay' ? +e.target.value : e.target.value;
      if (k === 'when') { r.v = ''; render(); }
      save();
    });
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('#autBox [data-aa]'); if (!b) return;
      const row = b.closest('[data-rid]'), r = row && C().rules.find(x => x.id === row.dataset.rid);
      if (b.dataset.aa === 'add') C().rules.push({id:uid(), on:true, when:'scene', v:'', act:'', delay:0});
      if (b.dataset.aa === 'del' && r) C().rules = C().rules.filter(x => x !== r);
      if (b.dataset.aa === 'test' && r) run(Object.assign({}, r, {on:true, delay:0}));
      save(); render();
    });
    setInterval(tick, 1000);
  }
  const load = d => { S.auto = {rules:(d && d.rules) || []}; };
  return {init, emit, render, load, save:() => C()};
})();
