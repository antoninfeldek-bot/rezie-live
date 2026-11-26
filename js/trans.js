'use strict';
/* ================= PŘECHODY ================= */
const TR = (() => {
  const TYPES = {cut:'Střih', fade:'Prolínačka', dip:'Přes barvu', wipe:'Stíračka', slide:'Najetí',
    push:'Vytlačení', zoom:'Zoom', iris:'Kruh', blur:'Rozmazání', stinger:'Stinger (video)'};
  const DIRS = {left:'zleva', right:'zprava', up:'zdola', down:'shora'};
  const EASES = {inout:'plynule', out:'zpomalit', in:'zrychlit', linear:'rovnoměrně'};
  const EF = {linear:t => t, in:t => t * t * t, out:t => 1 - Math.pow(1 - t, 3), inout:ease};
  const mk = (name, type, dur, extra) => Object.assign({id:uid(), name, type, dur, ease:'inout', dir:'left', soft:0.08, color:'#000000', cut:0.5, sound:true}, extra || {});
  const defaults = () => [mk('Prolínačka', 'fade', 600), mk('Přes černou', 'dip', 1000), mk('Stíračka', 'wipe', 700),
    mk('Vytlačení', 'push', 650), mk('Zoom', 'zoom', 700), mk('Kruh', 'iris', 800, {soft:0.04}), mk('Rozmazání', 'blur', 700)];

  const cv = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const A = cv(), B = cv(), T = cv(), ax = A.getContext('2d'), bx = B.getContext('2d'), tx = T.getContext('2d');
  let tbDir = 1, tbVal = 0, tbSet = () => {};
  const cur = () => S.trs.list.find(t => t.id === S.trs.cur) || S.trs.list[0];

  function start(from, to, manual) {
    const tr = cur(); if (!tr || tr.type === 'cut') return;
    let dur = tr.dur;
    if (tr.type === 'stinger') {
      const v = tr._v;
      if (!v || !isFinite(v.duration)) { S.active = {from, to, start:performance.now(), dur:500, tr:{type:'fade', ease:'inout'}, manual}; return; }
      dur = v.duration * 1000; v.currentTime = 0; v.play().catch(() => {});
    }
    S.active = {from, to, start:performance.now(), dur:Math.max(1, dur), tr, manual, p:0};
  }

  function compose(now) {
    const a = S.active, tr = a.tr;
    let p = a.manual ? a.p : (now - a.start) / a.dur;
    if (tr.type === 'stinger' && !a.manual && tr._v && tr._v.ended) p = 1;
    if (p >= 1) return false;
    p = clamp(p, 0, 1); const e = (EF[tr.ease] || ease)(p);
    renderScene(sceneById(a.from)); ax.drawImage(glc, 0, 0);
    renderScene(sceneById(a.to)); bx.drawImage(glc, 0, 0);
    const X = pgx; X.save(); X.globalAlpha = 1; X.fillStyle = '#000'; X.fillRect(0, 0, W, H);
    switch (tr.type) {
      case 'dip':
        X.drawImage(e < 0.5 ? A : B, 0, 0); X.globalAlpha = e < 0.5 ? e * 2 : (1 - e) * 2; X.fillStyle = tr.color; X.fillRect(0, 0, W, H); break;
      case 'wipe': {
        X.drawImage(A, 0, 0);
        const horiz = tr.dir === 'left' || tr.dir === 'right', L = horiz ? W : H, sp = Math.max(1, tr.soft * L), pos = -sp + e * (L + sp);
        let g;
        if (tr.dir === 'left') g = tx.createLinearGradient(pos, 0, pos + sp, 0);
        else if (tr.dir === 'right') g = tx.createLinearGradient(W - pos, 0, W - pos - sp, 0);
        else if (tr.dir === 'down') g = tx.createLinearGradient(0, pos, 0, pos + sp);
        else g = tx.createLinearGradient(0, H - pos, 0, H - pos - sp);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        maskDraw(g); break;
      }
      case 'iris': {
        X.drawImage(A, 0, 0);
        const R0 = Math.hypot(W, H) / 2, sp = Math.max(1, tr.soft * R0), r = e * (R0 + sp);
        const g = tx.createRadialGradient(W / 2, H / 2, Math.max(0, r - sp), W / 2, H / 2, Math.max(0.1, r));
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        maskDraw(g); break;
      }
      case 'slide': {
        X.drawImage(A, 0, 0); const [dx, dy] = off(tr.dir, 1 - e); X.drawImage(B, -dx, -dy); break;
      }
      case 'push': {
        const [dx, dy] = off(tr.dir, 1); X.drawImage(A, dx * e, dy * e); X.drawImage(B, -dx * (1 - e), -dy * (1 - e)); break;
      }
      case 'zoom': {
        X.drawImage(B, 0, 0); const s = 1 + e * 0.6; X.globalAlpha = 1 - e;
        X.drawImage(A, W / 2 - W * s / 2, H / 2 - H * s / 2, W * s, H * s); break;
      }
      case 'blur': {
        const b = Math.sin(Math.PI * e) * 28; X.filter = `blur(${b.toFixed(1)}px)`;
        X.drawImage(A, 0, 0); X.globalAlpha = e; X.drawImage(B, 0, 0); X.filter = 'none'; break;
      }
      case 'stinger': {
        const t = a.manual ? p * a.dur / 1000 : (now - a.start) / 1000;
        X.drawImage(t < tr.cut ? A : B, 0, 0);
        const v = tr._v; if (v && v.readyState >= 2) { if (a.manual) { const want = p * v.duration; if (Math.abs(v.currentTime - want) > 0.08) v.currentTime = want; } X.drawImage(v, 0, 0, W, H); }
        break;
      }
      default: X.drawImage(A, 0, 0); X.globalAlpha = e; X.drawImage(B, 0, 0);
    }
    X.restore();
    return true;
  }
  function off(dir, k) { return dir === 'left' ? [-W * k, 0] : dir === 'right' ? [W * k, 0] : dir === 'down' ? [0, -H * k] : [0, H * k]; }
  function maskDraw(g) {
    tx.globalCompositeOperation = 'copy'; tx.drawImage(B, 0, 0);
    tx.globalCompositeOperation = 'destination-in'; tx.fillStyle = g; tx.fillRect(0, 0, W, H);
    tx.globalCompositeOperation = 'source-over'; pgx.drawImage(T, 0, 0);
  }

  function loadStinger(tr, file) {
    let v = tr._v;
    if (!v) {
      v = document.createElement('video'); v.playsInline = true; v.preload = 'auto'; poolAdd(v); tr._v = v;
      try { const n = actx.createMediaElementSource(v); tr._g = actx.createGain(); n.connect(tr._g); tr._g.connect(master); } catch (e) { v.muted = true; }
    }
    if (v.src.startsWith('blob:')) URL.revokeObjectURL(v.src);
    v.src = URL.createObjectURL(file); tr.file = file.name;
    v.onloadedmetadata = () => { tr.dur = Math.round(v.duration * 1000); renderTab(); save(); };
  }

  function renderSel() {
    const sel = $('#trSel'); if (!sel || !S.trs) return;
    sel.innerHTML = S.trs.list.map(t => `<option value="${t.id}" ${t.id === S.trs.cur ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    const c = cur(); $('#trName').textContent = c ? c.name : '';
  }
  function select(id) { if (S.trs.list.find(t => t.id === id)) { S.trs.cur = id; renderSel(); renderTab(); save(); } }

  function card(t) {
    const opt = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${n}</option>`).join('');
    const hasDir = ['wipe','slide','push'].includes(t.type), hasSoft = ['wipe','iris'].includes(t.type);
    return `<div class="src trc ${t.id === S.trs.cur ? 'cur' : ''}" data-id="${t.id}">
      <div class="srch"><button data-ta="sel" class="${t.id === S.trs.cur ? 'on2' : ''}" title="Použít jako hlavní přechod">${t.id === S.trs.cur ? '● Vybráno' : '○ Vybrat'}</button>
        <input class="nm" data-tk="name" value="${esc(t.name)}"><button data-ta="test" title="Vyzkoušet (pošle náhled do programu)">▶</button><button data-ta="dup" title="Duplikovat">⧉</button><button data-ta="del" title="Smazat">✕</button></div>
      <div class="grid4">
        <label>Typ<select data-tk="type">${opt(TYPES, t.type)}</select></label>
        ${t.type === 'stinger' ? `<label>Bod střihu (s)<input type="number" step="0.05" min="0" data-tk="cut" value="${t.cut}"></label>` : `<label>Délka (ms)<input type="number" step="50" min="0" data-tk="dur" value="${t.dur}"></label>`}
        <label>Průběh<select data-tk="ease">${opt(EASES, t.ease)}</select></label>
        ${hasDir ? `<label>Směr<select data-tk="dir">${opt(DIRS, t.dir)}</select></label>` : t.type === 'dip' ? `<label>Barva<input type="color" data-tk="color" value="${t.color}"></label>` : '<span></span>'}
      </div>
      ${hasSoft ? `<label class="rng"><span>Měkkost hrany</span><input type="range" min="0" max="0.5" step="0.01" data-tk="soft" value="${t.soft}"><output>${t.soft}</output></label>` : ''}
      ${t.type === 'stinger' ? `<div class="btns"><button data-ta="stfile">🎞 ${t._v ? 'Vyměnit video' : 'Nahrát video'}</button><span class="dim">${t._v ? esc(t.file) + ` (${(t.dur / 1000).toFixed(2)} s)` : t.file ? '⚠ připoj znovu: ' + esc(t.file) : 'Video s průhledností (WebM VP9 s alfa kanálem, např. z After Effects)'}</span>
        <label class="chk"><input type="checkbox" data-tk="sound" ${t.sound ? 'checked' : ''}> se zvukem</label></div>` : ''}
    </div>`;
  }
  function renderTab() {
    const box = $('#tab-trans'); if (!box || !S.trs) return;
    box.innerHTML = `<div class="addbar"><button data-ta="new">+ Nový přechod</button><span class="dim">Vybraný přechod se použije na tlačítko AUTO (Enter) a T-bar. Klávesy jdou nastavit v záložce Ovládání.</span></div>
      <div class="srclist">${S.trs.list.map(card).join('')}</div>`;
  }

  function init() {
    renderSel();
    $('#trSel').onchange = e => select(e.target.value);
    // T-bar jako v televizi: po dokončení zůstane nahoře a další přechod se dělá stažením dolů.
    // Vlastní ovládací prvek (ne <input type=range>), aby fungoval v každém prohlížeči.
    const tb = $('#tbar'), fill = tb.querySelector('.tbfill'), handle = tb.querySelector('.tbhandle');
    const show = () => { const pct = tbVal / 10; handle.style.bottom = `calc(${pct}% - ${pct * 0.34}px)`; fill.style.height = pct + '%'; };
    const rest = () => { tbVal = tbDir > 0 ? 0 : 1000; show(); };
    const blocked = () => {
      if (!S.previewId || S.previewId === S.programId) return 'V náhledu je stejná scéna jako v programu – nejdřív vyber jinou scénu do náhledu.';
      if (cur() && cur().type === 'cut') return 'Vybraný přechod je „Střih“ – T-bar potřebuje přechod s délkou (např. Prolínačka).';
      return '';
    };
    tbSet = raw => {   // raw 0..1000 (0 = dole)
      tbVal = clamp(raw, 0, 1000); show();
      const v = tbDir > 0 ? tbVal / 1000 : 1 - tbVal / 1000;
      if (!S.active) {
        if (v <= 0.002) return;
        if (blocked()) { rest(); return; }
        take('manual'); if (!S.active || !S.active.manual) { S.active = null; rest(); return; }
      }
      if (!S.active.manual) return;
      S.active.p = v;
      if (v >= 0.998) { S.active = null; tbDir = -tbDir; rest(); }
      else if (v <= 0) { const a = S.active; S.active = null; S.programId = a.from; S.previewId = a.to; renderScenes(); renderLayers(); renderProps(); }
    };
    let dragging = false;
    const fromY = e => { const r = tb.getBoundingClientRect(), hh = 34; return (1 - (e.clientY - r.top - hh / 2) / Math.max(1, r.height - hh)) * 1000; };
    tb.addEventListener('pointerdown', e => {
      if (!(S.active && S.active.manual)) { const why = blocked(); if (why) { toast(why); return; } }
      dragging = true; tb.setPointerCapture(e.pointerId); tb.classList.add('drag'); tbSet(fromY(e)); e.preventDefault();
    });
    tb.addEventListener('pointermove', e => { if (dragging) tbSet(fromY(e)); });
    const end = () => {
      if (!dragging) return; dragging = false; tb.classList.remove('drag');
      if (S.active && S.active.manual) { const v = S.active.p; if (v >= 0.95) tbSet(tbDir > 0 ? 1000 : 0); else if (v <= 0.05) tbSet(tbDir > 0 ? 0 : 1000); }   // dotažení až na konec
      if (!S.active) rest();
    };
    tb.addEventListener('pointerup', end); tb.addEventListener('pointercancel', end);
    show();
    const box = $('#tab-trans');
    box.addEventListener('click', async e => {
      const act = e.target.dataset.ta; if (!act) return;
      if (act === 'new') { const t = mk('Nový přechod', 'fade', 600); S.trs.list.push(t); renderTab(); renderSel(); save(); return; }
      const t = S.trs.list.find(x => x.id === e.target.closest('.trc').dataset.id); if (!t) return;
      if (act === 'sel') select(t.id);
      else if (act === 'test') { const old = S.trs.cur; S.trs.cur = t.id; take('auto'); S.trs.cur = old; }
      else if (act === 'dup') { const c = JSON.parse(JSON.stringify({...t, _v:undefined, _g:undefined})); c.id = uid(); c.name += ' (kopie)'; S.trs.list.splice(S.trs.list.indexOf(t) + 1, 0, c); renderTab(); renderSel(); save(); }
      else if (act === 'del') { if (S.trs.list.length < 2) return alert('Aspoň jeden přechod musí zůstat.'); if (!confirm(`Smazat přechod „${t.name}“?`)) return; S.trs.list = S.trs.list.filter(x => x !== t); if (S.trs.cur === t.id) S.trs.cur = S.trs.list[0].id; renderTab(); renderSel(); save(); }
      else if (act === 'stfile') { const f = await pickFile('video/*'); if (f) { loadStinger(t, f); renderTab(); save(); } }
    });
    box.addEventListener('input', e => {
      const k = e.target.dataset.tk; if (!k) return;
      const t = S.trs.list.find(x => x.id === e.target.closest('.trc').dataset.id); if (!t) return;
      const v = val(e.target); if (v === null) return; t[k] = v;
      const o = e.target.parentElement.querySelector('output'); if (o) o.textContent = v;
      if (k === 'sound' && t._g) t._g.gain.value = v ? 1 : 0;
      if (k === 'type') renderTab(); if (k === 'name' || k === 'type') renderSel();
      save();
    });
  }
  const save_ = () => ({cur:S.trs.cur, list:S.trs.list.map(t => { const c = {...t}; delete c._v; delete c._g; return c; })});
  function load(d) {
    S.trs = d && d.list && d.list.length ? {cur:d.cur, list:d.list.map(t => Object.assign(mk(t.name, t.type, t.dur), t))} : {list:defaults(), cur:null};
    if (!S.trs.list.find(t => t.id === S.trs.cur)) S.trs.cur = S.trs.list[0].id;
  }
  return {start, compose, init, renderTab, renderSel, select, save:save_, load, cur, TYPES, tbar:v => tbSet(v)};
})();
