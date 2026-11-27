'use strict';
/* ================= ▦ SUPERSOURCE: rozložení 2 / 3 / 4 zdrojů vedle sebe =================
   Šablona rozmístí video vrstvy scény (kamery, hosty, videa, NDI…) do boxů. Každý box: výřez „vyplnit“ (bez deformace),
   zaoblení, rámeček, stín – kreslí se v shaderu na grafice, takže to skoro nic nestojí.
   Změna rozložení se plynule animuje – i ve scéně, která je právě ve vysílání. */
const SS = (() => {
  const NOT = new Set(['text', 'color', 'web', 'image']);
  const C = () => S.ss || (S.ss = {tpl:'auto', gap:24, margin:48, r:16, bw:0, bc:'#ffffff', sh:24, sho:0.55, dur:0.5, fit:'cover'});
  const TPL = {
    auto:{n:'Automaticky (podle počtu)', ic:'⚡'},
    full:{n:'1 – celá obrazovka', ic:'▣'},
    two:{n:'2 – vedle sebe (na výšku)', ic:'▥'},
    two169:{n:'2 – vedle sebe (16:9)', ic:'⧉'},
    big3:{n:'3 – velký + 2 malé', ic:'◧'},
    cols3:{n:'3 – tři sloupce', ic:'▦'},
    grid4:{n:'4 – mřížka 2 × 2', ic:'⊞'},
    grid6:{n:'6 – mřížka 3 × 2', ic:'▤'},
    pip:{n:'Obraz v obraze', ic:'◲'},
    side:{n:'Velký vlevo + pruh vpravo', ic:'◨'}};
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* animovaný obdélník vrstvy (volá render každý snímek) */
  function rect(l, r) {
    const a = l._anim; if (!a) return r;
    const t = (performance.now() - a.t0) / a.dur;
    if (t >= 1) { l._anim = null; return r; }
    const k = ease(Math.max(0, t)), f = a.from;
    return {x:f.x + (r.x - f.x) * k, y:f.y + (r.y - f.y) * k, w:f.w + (r.w - f.w) * k, h:f.h + (r.h - f.h) * k};
  }
  const boxes = (sc) => sc.layers.filter(l => { const s = srcById(l.sourceId); return (l.visible || l._ssHidden) && s && !NOT.has(s.type); });

  /* rozměry boxů v pixelech plátna */
  function layout(tpl, n, o) {
    const m = +o.margin || 0, g = +o.gap || 0, AW = W - 2 * m, AH = H - 2 * m;
    const grid = (cols, rows, ar) => {
      let cw = (AW - g * (cols - 1)) / cols, ch = (AH - g * (rows - 1)) / rows;
      if (ar) { if (cw / ch > ar) cw = ch * ar; else ch = cw / ar; }
      const tw = cols * cw + (cols - 1) * g, th = rows * ch + (rows - 1) * g, ox = m + (AW - tw) / 2, oy = m + (AH - th) / 2, R = [];
      for (let i = 0; i < cols * rows; i++) R.push({x:ox + (i % cols) * (cw + g), y:oy + Math.floor(i / cols) * (ch + g), w:cw, h:ch});
      return R;
    };
    if (tpl === 'auto') tpl = n <= 1 ? 'full' : n === 2 ? 'two169' : n === 3 ? 'big3' : n === 4 ? 'grid4' : 'grid6';
    switch (tpl) {
      case 'full': return [{x:m, y:m, w:AW, h:AH}];
      case 'two': return grid(2, 1);
      case 'two169': return grid(2, 1, 16 / 9);
      case 'cols3': return grid(3, 1);
      case 'grid4': return grid(2, 2, 16 / 9);
      case 'grid6': return n > 6 ? grid(3, 3, 16 / 9) : grid(3, 2, 16 / 9);
      case 'big3': { const bw = (AW - g) * 0.62, sw = AW - g - bw, sh = (AH - g) / 2; return [{x:m, y:m, w:bw, h:AH}, {x:m + bw + g, y:m, w:sw, h:sh}, {x:m + bw + g, y:m + sh + g, w:sw, h:sh}]; }
      case 'side': { const k = Math.max(1, n - 1), bw = (AW - g) * 0.74, sw = AW - g - bw, sh = (AH - g * (k - 1)) / k, R = [{x:m, y:m, w:bw, h:AH}]; for (let i = 0; i < k; i++) R.push({x:m + bw + g, y:m + i * (sh + g), w:sw, h:sh}); return R; }
      case 'pip': { const pw = W * 0.28, ph = pw * 9 / 16; return [{x:0, y:0, w:W, h:H}, {x:W - pw - m, y:H - ph - m, w:pw, h:ph}]; }
    }
    return grid(2, 2);
  }

  /* použít šablonu na scénu; animovat z dosavadních pozic */
  function apply(sc, tpl, opt) {
    if (!sc) return false;
    const o = Object.assign({}, C(), opt || {}); tpl = tpl || o.tpl;
    const LS = boxes(sc); if (!LS.length) { toast(L_('Ve scéně nejsou žádné kamery ani videa – přidej je do scény.')); return false; }
    const R = layout(tpl, LS.length, o), now = performance.now(), dur = Math.max(0, +o.dur || 0) * 1000;
    LS.forEach((l, i) => {
      const s = srcById(l.sourceId), from = rect(l, layerRect(l, s)), to = R[i];
      if (!to) { l.visible = false; l._ssHidden = true; return; }
      if (dur > 0 && l.visible) l._anim = {from, t0:now, dur};
      l.visible = true; l._ssHidden = false;
      Object.assign(l, {x:Math.round(to.x), y:Math.round(to.y), w:Math.round(to.w), h:Math.round(to.h)});
      const full = tpl === 'pip' && i === 0;
      l.box = Object.assign({px:0.5, py:0.5}, l.box, {on:!full, fit:o.fit, r:+o.r, bw:+o.bw, bc:o.bc, sh:+o.sh, sho:+o.sho});
    });
    sc.ssTpl = tpl; save(); renderLayers(); renderProps();
    return true;
  }
  const L_ = t => (typeof L === 'function' ? L(t) : t);

  /* dialog */
  async function open(sc) {
    sc = sc || sceneById(S.previewId); if (!sc) return;
    const o = C(), n = boxes(sc).length;
    const f = await dialog('▦ ' + L_('Rozložení scény (SuperSource)'), `
      <p class="dim">${L_('Scéna')}: <b>${esc(sc.name)}</b> · ${n} ${L_('zdrojů s obrazem')}</p>
      <div class="sstpl">${Object.entries(TPL).map(([k, t]) => `<label class="sst"><input type="radio" name="tpl" value="${k}" ${(sc.ssTpl || o.tpl) === k ? 'checked' : ''}><span><i>${t.ic}</i>${L_(t.n)}</span></label>`).join('')}</div>
      <div class="grid4"><label>${L_('Okraj')}<input type="number" name="margin" value="${o.margin}" min="0"></label><label>${L_('Mezera')}<input type="number" name="gap" value="${o.gap}" min="0"></label>
        <label>${L_('Zaoblení')}<input type="number" name="r" value="${o.r}" min="0"></label><label>${L_('Animace (s)')}<input type="number" name="dur" value="${o.dur}" min="0" step="0.1"></label></div>
      <div class="grid4"><label>${L_('Rámeček (px)')}<input type="number" name="bw" value="${o.bw}" min="0"></label><label>${L_('Barva rámečku')}<input type="color" name="bc" value="${o.bc}"></label>
        <label>${L_('Stín (px)')}<input type="number" name="sh" value="${o.sh}" min="0"></label><label>${L_('Síla stínu')}<input type="number" name="sho" value="${o.sho}" min="0" max="1" step="0.05"></label></div>
      <label>${L_('Obraz v boxu')}<select name="fit"><option value="cover" ${o.fit === 'cover' ? 'selected' : ''}>${L_('Vyplnit box (ořízne okraje, bez deformace)')}</option><option value="stretch" ${o.fit !== 'cover' ? 'selected' : ''}>${L_('Roztáhnout')}</option></select></label>
      <p class="dim">${L_('Pořadí boxů = pořadí vrstev. Výřez v boxu posuneš u vrstvy (Rámeček → posun výřezu). Rozložení jde přepínat i makrem nebo klávesou – plynule, i když je scéna ve vysílání.')}</p>`);
    if (!f) return;
    Object.assign(o, {tpl:f.tpl || o.tpl, margin:+f.margin, gap:+f.gap, r:+f.r, dur:+f.dur, bw:+f.bw, bc:f.bc, sh:+f.sh, sho:+f.sho, fit:f.fit});
    apply(sc, o.tpl);
  }

  /* akce pro Ovládání / makra */
  function ctl(add) {
    for (const [k, t] of Object.entries(TPL)) {
      add('ss.pg.' + k, `▦ ${L_('Rozložení')} ${L_(t.n)} – ${L_('scéna ve vysílání')}`, () => apply(sceneById(S.programId), k), 'Rozložení');
      add('ss.pv.' + k, `▦ ${L_('Rozložení')} ${L_(t.n)} – ${L_('scéna v náhledu')}`, () => apply(sceneById(S.previewId), k), 'Rozložení');
    }
  }
  function init() { const b = document.getElementById('bSS'); if (b) b.onclick = () => open(); }
  return {rect, apply, open, ctl, init, layout, TPL};
})();
