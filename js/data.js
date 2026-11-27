'use strict';
/* ================= 📑 DATA PRO TITULKY: Google Sheets / CSV / JSON =================
   Do textu grafiky napiš {Název!B2} (buňka), {Název!Jméno} (sloupec „Jméno“ v aktuálním řádku)
   nebo {Název!B@} (sloupec B v aktuálním řádku), {Název!B@+1} (další řádek). Data se sama obnovují.
   Aktuální řádek přepínáš ◀ ▶ (nebo klávesou / Stream Deckem) – ideální na jmenovky, výsledky, ankety. */
const DAT = (() => {
  const C = () => S.data || (S.data = {list:[]});
  const RT = new Map();   // id → {rows, t, err, busy}
  const colIdx = s => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  // běžný odkaz na Google tabulku → export CSV (stačí sdílení „kdokoli s odkazem“)
  function normUrl(u) {
    const m = /docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(u || '');
    if (m && !/output=csv|format=csv/.test(u)) { const g = /[#&?]gid=(\d+)/.exec(u); return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${g ? '&gid=' + g[1] : ''}`; }
    return u;
  }
  function parseCSV(t) {
    const rows = []; let row = [], f = '', q = false;
    const sep = (t.split('\n')[0].match(/;/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }
  function parse(text) {
    const s = text.trim();
    if (s[0] === '[' || s[0] === '{') {
      let j = JSON.parse(s); if (!Array.isArray(j)) j = j.data || j.rows || j.items || Object.values(j).find(Array.isArray) || [j];
      if (j.length && typeof j[0] === 'object' && !Array.isArray(j[0])) { const keys = [...new Set(j.flatMap(o => Object.keys(o)))]; return [keys, ...j.map(o => keys.map(k => o[k] == null ? '' : String(o[k])))]; }
      return j.map(r => [].concat(r).map(String));
    }
    return parseCSV(s);
  }
  async function load(d) {
    const r = RT.get(d.id) || {}; RT.set(d.id, r); if (r.busy) return; r.busy = true;
    try {
      let text;
      if (d.file) text = d.text || '';
      else {
        const u = normUrl(d.url); if (!/^https?:\/\//.test(u)) throw new Error(L('Adresa musí začínat https://'));
        const base = REM.base && REM.base();
        const res = base ? await fetch(base + '/data/fetch?url=' + encodeURIComponent(u), {cache:'no-store'}) : await fetch(u, {cache:'no-store'});
        if (!res.ok) throw new Error((await res.text()).slice(0, 120) || res.status);
        text = await res.text();
        if (/^\s*<!doctype html|<html/i.test(text)) throw new Error(L('Tabulka není sdílená – v Google tabulce dej Sdílet → Kdokoli s odkazem.'));
      }
      r.rows = parse(text); r.err = ''; r.t = Date.now();
    } catch (e) { r.err = e.message; }
    r.busy = false; if (LAY.isShown('gfxctl')) render();
  }
  // hodnota pro token {Název!…}
  function get(name, ref) {
    const d = C().list.find(x => x.name.toLowerCase() === name.toLowerCase()); if (!d) return null;
    const rows = (RT.get(d.id) || {}).rows; if (!rows) return '…';
    const cur = Math.max(1, Math.min(rows.length - 1, d.cur || 1));
    let m = /^([A-Za-z]{1,3})(\d+)$/.exec(ref);
    if (m) { const r = rows[+m[2] - 1]; return r ? r[colIdx(m[1])] || '' : ''; }
    m = /^([A-Za-z]{1,3})@([+-]\d+)?$/.exec(ref);
    if (m) { const r = rows[cur + (+m[2] || 0)]; return r ? r[colIdx(m[1])] || '' : ''; }
    m = /^(.+?)(@([+-]\d+))?$/.exec(ref);   // název sloupce z prvního řádku
    const ci = rows[0].findIndex(h => h.trim().toLowerCase() === m[1].trim().toLowerCase());
    if (ci < 0) return null; const r = rows[cur + (+m[3] || 0)]; return r ? r[ci] || '' : '';
  }
  const resolve = s => String(s).replace(/\{([^{}!]+)!([^{}]+)\}/g, (all, n, ref) => { const v = get(n.trim(), ref.trim()); return v == null ? all : v; });
  function step(id, k) {
    const list = id ? C().list.filter(d => d.id === id) : C().list;
    list.forEach(d => { const rows = (RT.get(d.id) || {}).rows || []; d.cur = Math.max(1, Math.min(Math.max(1, rows.length - 1), (d.cur || 1) + k)); });
    save(); if (LAY.isShown('gfxctl')) render();
  }

  /* ---------- UI (v záložce Grafika) ---------- */
  function render() {
    let box = $('#datBox'); const host = $('#tab-gfxctl'); if (!host) return;
    if (!box) { box = document.createElement('div'); box.id = 'datBox'; host.appendChild(box); }
    box.innerHTML = `<div class="sec"><h4>📑 ${L('Data pro titulky (Google tabulka, CSV)')}</h4>
      ${C().list.map(d => { const r = RT.get(d.id) || {}, rows = r.rows || [], cur = Math.max(1, Math.min(rows.length - 1, d.cur || 1));
        return `<div class="datrow" data-did="${d.id}">
          <div class="dathead"><input data-dk="name" value="${esc(d.name)}" title="${L('Název – používá se v {Název!B2}')}" style="width:110px">
            ${d.file ? `<span class="dim">📄 ${esc(d.fileName || 'CSV')}</span><button data-da="file">${L('Načíst znovu')}</button>` : `<input data-dk="url" value="${esc(d.url || '')}" placeholder="${L('Odkaz na Google tabulku nebo CSV/JSON')}">
            <select data-dk="every">${[[0, L('ručně')], [5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min']].map(([v, n]) => `<option value="${v}" ${+d.every === v ? 'selected' : ''}>${n}</option>`).join('')}</select><button data-da="reload">⟳</button>`}
            <button data-da="del" title="${L('Smazat')}">✕</button></div>
          <div class="dim">${r.err ? '⚠ ' + esc(r.err) : r.rows ? `${rows.length - 1} ${L('řádků')} · ${L('aktualizováno')} ${new Date(r.t).toLocaleTimeString().slice(0, 8)}` : L('Načítám…')}</div>
          ${rows.length > 1 ? `<div class="datcur"><button data-da="prev">◀</button><b>${L('Řádek')} ${cur} / ${rows.length - 1}</b><button data-da="next">▶</button>
            <span class="dim">${rows[0].slice(0, 6).map((h, i) => `{${esc(d.name)}!${esc(h || String.fromCharCode(65 + i) + '@')}} = <b>${esc((rows[cur] || [])[i] || '')}</b>`).join(' · ')}</span></div>` : ''}
        </div>`; }).join('')}
      <div class="btns"><button data-da="add">+ ${L('Přidat odkaz')}</button><button data-da="addfile">+ ${L('Přidat soubor CSV')}</button></div>
      <p class="dim">${L('Do textu v editoru grafiky napiš např.')} <code>{${esc((C().list[0] || {}).name || 'Data')}!B2}</code> ${L('(buňka),')} <code>{${esc((C().list[0] || {}).name || 'Data')}!${I18N.lang === 'en' ? 'Name' : 'Jméno'}}</code> ${L('(sloupec v aktuálním řádku) nebo')} <code>{…!B@+1}</code> ${L('(další řádek). Google tabulku stačí sdílet „Kdokoli s odkazem“.')}</p></div>`;
  }
  let timer = 0;
  function init() {
    document.addEventListener('change', e => {
      const row = e.target.closest && e.target.closest('#datBox .datrow'); if (!row) return;
      const d = C().list.find(x => x.id === row.dataset.did), k = e.target.dataset.dk; if (!d || !k) return;
      d[k] = k === 'every' ? +e.target.value : e.target.value.trim(); if (k === 'name') d.name = d.name.replace(/[{}!]/g, '') || 'Data';
      save(); if (k === 'url') load(d);
    });
    document.addEventListener('click', async e => {
      const b = e.target.closest && e.target.closest('#datBox [data-da]'); if (!b) return;
      const a = b.dataset.da, row = b.closest('.datrow'), d = row && C().list.find(x => x.id === row.dataset.did);
      if (a === 'add') { const n = {id:uid(), name:'Data' + (C().list.length + 1), url:'', every:10, cur:1}; C().list.push(n); save(); render(); }
      if (a === 'addfile' || a === 'file') {
        const f = await pickFile('.csv,.tsv,.txt,.json,text/csv,application/json'); if (!f) return;
        const text = await f.text();
        const t = d || (C().list.push({id:uid(), name:f.name.replace(/\.[^.]+$/, '').replace(/[{}!\s]/g, '') || 'Data', file:true, every:0, cur:1}), C().list[C().list.length - 1]);
        t.file = true; t.fileName = f.name; t.text = text.length < 400000 ? text : text.slice(0, 400000); save(); load(t);
      }
      if (!d) return;
      if (a === 'reload') load(d); if (a === 'del') { C().list = C().list.filter(x => x !== d); RT.delete(d.id); save(); render(); }
      if (a === 'next') step(d.id, 1); if (a === 'prev') step(d.id, -1);
    });
    C().list.forEach(load);
    clearInterval(timer);
    timer = setInterval(() => { const now = Date.now(); C().list.forEach(d => { const r = RT.get(d.id); if (!d.file && d.every > 0 && d.url && (!r || !r.t || now - r.t > d.every * 1000)) load(d); }); }, 1000);
  }
  const loadCfg = d => { S.data = {list:(d && d.list) || []}; RT.clear(); };
  return {init, render, resolve, get, step, load:loadCfg, save:() => C(), parse, normUrl};
})();
