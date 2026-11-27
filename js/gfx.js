'use strict';
/* ================= GRAFIKA: modulární titulky + editor animací ================= */
const GFX = (() => {
  const ANIM = ['x','y','w','h','sx','sy','rot','op','clipL','clipR','clipT','clipB','blur'];
  const AL = {x:'X', y:'Y', w:'Šířka', h:'Výška', sx:'Měřítko X', sy:'Měřítko Y', rot:'Rotace °', op:'Krytí',
    clipL:'Ořez zleva', clipR:'Ořez zprava', clipT:'Ořez shora', clipB:'Ořez zdola', blur:'Rozostření'};
  const ASTEP = {x:1, y:1, w:1, h:1, sx:0.01, sy:0.01, rot:0.5, op:0.01, clipL:0.01, clipR:0.01, clipT:0.01, clipB:0.01, blur:0.5};
  const EZ = {linear:u => u, inout:ease, out:u => 1 - Math.pow(1 - u, 3), in:u => u * u * u,
    back:u => { const c = 1.70158, d = u - 1; return 1 + (c + 1) * d * d * d + c * d * d; }, hold:() => 0};
  const EZN = {inout:'Plynule', out:'Zpomalit (vjezd)', in:'Zrychlit (odjezd)', back:'S překmitem', linear:'Lineárně', hold:'Skok (hold)'};
  const FONTS = [['system-ui, sans-serif','Systémové'],['Inter, Arial, sans-serif','Arial / Inter'],['"Arial Black", sans-serif','Arial Black'],['Impact, sans-serif','Impact'],
    ['"Segoe UI", Roboto, sans-serif','Segoe / Roboto'],['Georgia, serif','Georgia'],['"Times New Roman", serif','Times'],['"Courier New", monospace','Courier']];
  const PRE_IN = {none:'— žádná —', fade:'Prolnutí', slideL:'Vjezd zleva', slideR:'Vjezd zprava', slideU:'Vjezd zdola', slideD:'Vjezd shora',
    revealL:'Odkrytí zleva', revealR:'Odkrytí zprava', revealU:'Odkrytí zdola', revealD:'Odkrytí shora', zoom:'Zvětšení', pop:'Vyskočení', blur:'Z rozostření'};
  const BASE = {x:100, y:100, w:600, h:120, sx:1, sy:1, rot:0, op:1, clipL:0, clipR:0, clipT:0, clipB:0, blur:0};
  const TYPEDEF = {
    text:{text:'Text', font:'system-ui, sans-serif', size:64, weight:700, color:'#ffffff', align:'left', valign:'middle', ls:0, upper:false, shadow:false, shColor:'#000000', shBlur:12, stroke:0, strokeColor:'#000000'},
    rect:{fill:'#1d4ed8', grad:false, fill2:'#0f172a', gradAngle:0, radius:0, stroke:0, strokeColor:'#ffffff'},
    image:{src:'', fit:'contain'},
    ticker:{text:'Tady běží text lišty  •  další zpráva', font:'system-ui, sans-serif', size:40, weight:600, color:'#ffffff', speed:140, gap:140}
  };
  const TNAME = {text:'Text', rect:'Obdélník', image:'Obrázek', ticker:'Běžící lišta'};
  const IMG = new Map();
  const RT = {};              // stav grafik ve vysílání: id → {ph, t, hold, cdStart}
  const ED = {gid:null, sel:null, t:0, playing:false, stopAt:null, loop:true, selKf:null, bg:'checker', safe:false, expanded:{}};
  const UNDO = {stack:[], redo:[]};
  const gById = id => S.gfx.list.find(g => g.id === id);
  const curG = () => gById(ED.gid) || S.gfx.list[0];
  const elById = (G, id) => G && G.els.find(e => e.id === id);

  /* ---------- model ---------- */
  function newEl(type, extra) {
    const E = {id:uid(), type, name:L(TNAME[type]), vis:true, p:Object.assign({}, BASE, JSON.parse(JSON.stringify(TYPEDEF[type]))), kf:{}};
    if (type === 'ticker') Object.assign(E.p, {x:0, y:H - 100, w:W, h:70});
    if (typeof E.p.text === 'string' && !/^\{/.test(E.p.text)) E.p.text = L(E.p.text);
    if (extra) { if (extra.name) E.name = L(extra.name); if (extra.p && typeof extra.p.text === 'string' && !/^\{/.test(extra.p.text)) extra.p.text = L(extra.p.text); Object.assign(E.p, extra.p || {}); }
    return E;
  }
  function kv(E, prop, t) {
    const ks = E.kf[prop]; if (!ks || !ks.length) return E.p[prop];
    if (t <= ks[0].t) return ks[0].v;
    for (let i = 0; i < ks.length - 1; i++) {
      const a = ks[i], b = ks[i + 1];
      if (t < b.t) { if (a.e === 'hold') return a.v; const u = (t - a.t) / Math.max(1e-6, b.t - a.t); return a.v + (b.v - a.v) * (EZ[a.e] || ease)(u); }
    }
    return ks[ks.length - 1].v;
  }
  function setAnim(E, prop, v, t) {
    const ks = E.kf[prop];
    if (ks && ks.length) {
      const k = ks.find(k => Math.abs(k.t - t) < 1 / 120);
      if (k) k.v = v; else { const prev = [...ks].reverse().find(k => k.t < t); ks.push({t, v, e:prev ? prev.e : 'inout'}); ks.sort((a, b) => a.t - b.t); }
    } else E.p[prop] = v;
  }
  function toggleKey(E, prop, t) {
    const ks = E.kf[prop] || (E.kf[prop] = []);
    const i = ks.findIndex(k => Math.abs(k.t - t) < 1 / 120);
    if (i >= 0) { ks.splice(i, 1); if (!ks.length) delete E.kf[prop]; }
    else { ks.push({t, v:kv(E, prop, t), e:'inout'}); ks.sort((a, b) => a.t - b.t); }
  }
  const hasKeyAt = (E, prop, t) => (E.kf[prop] || []).some(k => Math.abs(k.t - t) < 1 / 120);

  function applyPreset(G, E, pin, pout, o) {
    const d = o.delay || 0, D = Math.max(0.05, o.dur || 0.5), dist = o.dist || 300;
    const base = {}; ANIM.forEach(p => base[p] = kv(E, p, G.inEnd));
    const fromOf = name => {
      const f = {};
      if (name === 'fade') f.op = 0;
      if (name === 'slideL') { f.x = base.x - dist; f.op = 0; } if (name === 'slideR') { f.x = base.x + dist; f.op = 0; }
      if (name === 'slideU') { f.y = base.y + dist * 0.4; f.op = 0; } if (name === 'slideD') { f.y = base.y - dist * 0.4; f.op = 0; }
      if (name === 'revealL') f.clipR = 1; if (name === 'revealR') f.clipL = 1; if (name === 'revealU') f.clipT = 1; if (name === 'revealD') f.clipB = 1;
      if (name === 'zoom') { f.sx = 0.6; f.sy = 0.6; f.op = 0; } if (name === 'pop') { f.sx = 0; f.sy = 0; }
      if (name === 'blur') { f.blur = 30; f.op = 0; }
      return f;
    };
    const fi = pin && pin !== 'none' ? fromOf(pin) : {}, fo = pout && pout !== 'none' ? fromOf(pout) : {};
    const touched = new Set([...Object.keys(fi), ...Object.keys(fo)]);
    touched.forEach(p => {
      const ks = [];
      if (p in fi) { const t0 = Math.min(d, G.inEnd), t1 = Math.min(d + D, G.inEnd); ks.push({t:t0, v:fi[p], e:pin === 'pop' ? 'back' : 'out'}, {t:Math.max(t1, t0 + 0.01), v:base[p], e:'inout'}); }
      if (p in fo) { const o0 = Math.min(G.outStart + d, G.dur), o1 = Math.min(G.outStart + d + D, G.dur); ks.push({t:o0, v:base[p], e:'in'}, {t:Math.max(o1, o0 + 0.01), v:fo[p], e:'inout'}); }
      ks.sort((a, b) => a.t - b.t); E.kf[p] = ks; E.p[p] = base[p];
    });
  }

  /* ---------- šablony ---------- */
  function newG(name) { return {id:uid(), name:L(name), dur:5, inEnd:1, outStart:4, autoOut:0, cdMin:5, fields:{}, els:[]}; }
  const TEMPLATES = {
    lower:['Jmenovka (dolní třetina)', () => {
      const G = newG('Jmenovka'); G.fields = {jmeno:L('Jan Novák'), funkce:L('moderátor')};
      const acc = newEl('rect', {name:'Proužek', p:{x:110, y:812, w:14, h:150, fill:'#3b82f6'}});
      const bg = newEl('rect', {name:'Pozadí', p:{x:124, y:812, w:780, h:150, fill:'#0f172a', op:0.92}});
      const n = newEl('text', {name:'Jméno', p:{x:164, y:826, w:720, h:76, text:'{jmeno}', size:58}});
      const r = newEl('text', {name:'Funkce', p:{x:164, y:898, w:720, h:52, text:'{funkce}', size:34, weight:400, color:'#cbd5e1'}});
      G.els = [bg, acc, n, r];
      applyPreset(G, acc, 'revealU', 'fade', {delay:0, dur:0.35}); applyPreset(G, bg, 'revealL', 'revealL', {delay:0.15, dur:0.5});
      applyPreset(G, n, 'slideL', 'fade', {delay:0.35, dur:0.5, dist:60}); applyPreset(G, r, 'slideL', 'fade', {delay:0.45, dur:0.5, dist:60});
      return G;
    }],
    bug:['Logo v rohu', () => {
      const G = newG('Logo v rohu'); G.fields = {logo:L('MOJE TV')};
      const bg = newEl('rect', {name:'Podklad', p:{x:1560, y:50, w:300, h:84, fill:'#111827', op:0.8, radius:14}});
      const t = newEl('text', {name:'Logo', p:{x:1560, y:50, w:300, h:84, text:'{logo}', size:42, align:'center', ls:2}});
      G.els = [bg, t]; applyPreset(G, bg, 'fade', 'fade', {dur:0.6}); applyPreset(G, t, 'zoom', 'fade', {delay:0.1, dur:0.6}); return G;
    }],
    live:['ŽIVĚ štítek', () => {
      const G = newG('ŽIVĚ'); const bg = newEl('rect', {name:'Červená', p:{x:60, y:50, w:170, h:64, fill:'#dc2626', radius:8}});
      const t = newEl('text', {name:'ŽIVĚ', p:{x:60, y:50, w:170, h:64, text:'● ŽIVĚ', size:36, align:'center'}});
      G.els = [bg, t]; applyPreset(G, bg, 'pop', 'fade', {dur:0.45}); applyPreset(G, t, 'fade', 'fade', {delay:0.2, dur:0.3}); return G;
    }],
    ticker:['Lišta se zprávami', () => {
      const G = newG('Lišta'); G.fields = {zpravy:L('Vítejte u živého vysílání  •  Pište nám do komentářů  •  Sledujte nás i příště')};
      const bar = newEl('rect', {name:'Lišta', p:{x:0, y:H - 90, w:W, h:70, fill:'#0b1220', op:0.95}});
      const lab = newEl('rect', {name:'Štítek', p:{x:0, y:990, w:200, h:70, fill:'#dc2626'}});
      const lt = newEl('text', {name:'Štítek text', p:{x:0, y:990, w:200, h:70, text:'ZPRÁVY', size:34, align:'center'}});
      const tk = newEl('ticker', {name:'Běžící text', p:{x:210, y:H - 90, w:W - 210, h:70, text:'{zpravy}'}});
      G.els = [bar, lab, lt, tk];
      applyPreset(G, bar, 'revealL', 'revealR', {dur:0.5}); applyPreset(G, lab, 'slideL', 'slideL', {delay:0.2, dur:0.4, dist:220});
      applyPreset(G, lt, 'slideL', 'slideL', {delay:0.2, dur:0.4, dist:220}); applyPreset(G, tk, 'fade', 'fade', {delay:0.4, dur:0.4});
      return G;
    }],
    full:['Velký titulek přes celou obrazovku', () => {
      const G = newG('Velký titulek'); G.fields = {titulek:L('NÁZEV POŘADU'), podtitulek:L('díl 1')};
      const bg = newEl('rect', {name:'Pozadí', p:{x:0, y:0, w:W, h:H, fill:'#0b1220', op:0.88}});
      const t = newEl('text', {name:'Titulek', p:{x:160, y:400, w:1600, h:170, text:'{titulek}', size:130, align:'center', weight:800, ls:4}});
      const s = newEl('text', {name:'Podtitulek', p:{x:160, y:590, w:1600, h:80, text:'{podtitulek}', size:52, align:'center', weight:400, color:'#93c5fd'}});
      G.els = [bg, t, s]; applyPreset(G, bg, 'fade', 'fade', {dur:0.6}); applyPreset(G, t, 'blur', 'zoom', {delay:0.2, dur:0.7});
      applyPreset(G, s, 'slideU', 'fade', {delay:0.5, dur:0.5, dist:100}); return G;
    }],
    countdown:['Odpočet', () => {
      const G = newG('Odpočet'); G.cdMin = 5;
      const bg = newEl('rect', {name:'Pozadí', p:{x:0, y:0, w:W, h:H, fill:'#0b1220', grad:true, fill2:'#1e3a8a', gradAngle:90}});
      const l = newEl('text', {name:'Popisek', p:{x:0, y:Math.round(H * 0.35), w:W, h:80, text:'ZAČÍNÁME ZA', size:56, align:'center', weight:600, ls:8, color:'#93c5fd'}});
      const c = newEl('text', {name:'Čas', p:{x:0, y:Math.round(H * 0.435), w:W, h:220, text:'{cd}', size:Math.round(Math.min(200, W / 6)), align:'center', weight:800}});
      G.els = [bg, l, c]; applyPreset(G, bg, 'fade', 'fade', {dur:0.5}); applyPreset(G, l, 'slideD', 'fade', {delay:0.2, dur:0.5, dist:80}); applyPreset(G, c, 'zoom', 'fade', {delay:0.3, dur:0.6});
      return G;
    }],
    clock:['Hodiny v rohu', () => {
      const G = newG('Hodiny'); const bg = newEl('rect', {name:'Podklad', p:{x:60, y:50, w:200, h:64, fill:'#111827', op:0.8, radius:10}});
      const t = newEl('text', {name:'Čas', p:{x:60, y:50, w:200, h:64, text:'{hm}', size:38, align:'center'}});
      G.els = [bg, t]; applyPreset(G, bg, 'revealL', 'revealL', {dur:0.4}); applyPreset(G, t, 'fade', 'fade', {delay:0.2, dur:0.3}); return G;
    }],
    score:['Skóre (sport)', () => {
      const G = newG('Skóre'); G.autoOut = 0;
      const bg = newEl('rect', {name:'Podklad', p:{x:60, y:50, w:640, h:72, fill:'#0b1220', op:0.92, radius:10}});
      const h = newEl('text', {name:'Domácí', p:{x:72, y:50, w:200, h:72, text:'{skore.domaci}', size:34, align:'left', weight:700}});
      const sc = newEl('rect', {name:'Skóre podklad', p:{x:280, y:56, w:150, h:60, fill:'#1e40af', radius:8}});
      const st = newEl('text', {name:'Stav', p:{x:280, y:50, w:150, h:72, text:'{skore.D} : {skore.H}', size:40, align:'center', weight:800}});
      const a = newEl('text', {name:'Hosté', p:{x:440, y:50, w:150, h:72, text:'{skore.hoste}', size:34, align:'left', weight:700}});
      const t = newEl('text', {name:'Čas', p:{x:590, y:50, w:110, h:72, text:'{skore.cas}', size:30, align:'center', color:'#fde68a'}});
      const pe = newEl('text', {name:'Perioda', p:{x:590, y:118, w:110, h:36, text:'{skore.perioda}', size:22, align:'center', color:'#cbd5e1'}});
      G.els = [bg, sc, h, st, a, t, pe]; applyPreset(G, bg, 'revealL', 'revealR', {dur:0.45}); for (const e of [sc, h, st, a, t, pe]) applyPreset(G, e, 'fade', 'fade', {delay:0.25, dur:0.3}); return G;
    }],
    chatmsg:['Zpráva z chatu', () => {
      const G = newG('Zpráva z chatu');
      const bg = newEl('rect', {name:'Podklad', p:{x:110, y:760, w:1100, h:200, fill:'#0f172a', op:0.92, radius:16}});
      const acc = newEl('rect', {name:'Proužek', p:{x:110, y:760, w:12, h:200, fill:'#a855f7'}});
      const n = newEl('text', {name:'Jméno', p:{x:150, y:778, w:1040, h:56, text:'{chat.jmeno}', size:36, align:'left', weight:700, color:'#c4b5fd'}});
      const t = newEl('text', {name:'Zpráva', p:{x:150, y:836, w:1040, h:110, text:'{chat.text}', size:40, align:'left', weight:500}});
      G.els = [bg, acc, n, t]; applyPreset(G, bg, 'revealL', 'fade', {dur:0.45}); applyPreset(G, acc, 'revealU', 'fade', {dur:0.3});
      applyPreset(G, n, 'slideL', 'fade', {delay:0.2, dur:0.4, dist:50}); applyPreset(G, t, 'slideL', 'fade', {delay:0.3, dur:0.4, dist:50}); return G;
    }],
    poll:['Anketa (výsledky z chatu)', () => {
      const G = newG('Anketa');
      const bg = newEl('rect', {name:'Podklad', p:{x:1260, y:250, w:600, h:560, fill:'#0f172a', op:0.92, radius:18}});
      const q = newEl('text', {name:'Otázka', p:{x:1290, y:270, w:540, h:110, text:'{anketa.otazka}', size:38, align:'left', weight:700}});
      const els = [bg, q];
      for (let i = 1; i <= 4; i++) {
        const y = 390 + (i - 1) * 100;
        els.push(newEl('text', {name:'Možnost ' + i, p:{x:1290, y, w:440, h:50, text:'{anketa.' + i + 'k} {anketa.' + i + '}', size:30, align:'left'}}));
        els.push(newEl('text', {name:'Procenta ' + i, p:{x:1730, y, w:110, h:50, text:'{anketa.' + i + '%}', size:30, align:'right', weight:700, color:'#86efac'}}));
        els.push(newEl('text', {name:'Pruh ' + i, p:{x:1290, y:y + 50, w:550, h:30, text:'{anketa.' + i + 'pruh}', size:24, align:'left', color:'#22c55e'}}));
      }
      els.push(newEl('text', {name:'Hlasů', p:{x:1290, y:765, w:540, h:36, text:'{anketa.hlasu}', size:22, align:'left', color:'#94a3b8'}}));
      G.els = els; applyPreset(G, bg, 'revealL', 'revealR', {dur:0.5}); for (const e of els.slice(1)) applyPreset(G, e, 'fade', 'fade', {delay:0.25, dur:0.35}); return G;
    }],
    empty:['Prázdná grafika', () => newG('Nová grafika')]
  };

  /* ---------- kreslení ---------- */
  const p2 = v => String(v).padStart(2, '0');
  function tokens(G, s, st, now) {
    return LIVE.resolve(DAT.resolve(String(s))).replace(/\{(\w+)\}/g, (m, k) => {
      const d = new Date();
      if (k === 'time') return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
      if (k === 'hm') return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
      if (k === 'date') return d.toLocaleDateString('cs-CZ');
      if (k === 'cd') { const start = st ? st.cdStart : now; const left = Math.max(0, G.cdMin * 60 - (now - start) / 1000); return `${p2(Math.floor(left / 60))}:${p2(Math.floor(left % 60))}`; }
      if (k === 'elapsed') { const e = st ? (now - st.cdStart) / 1000 : 0; return `${p2(Math.floor(e / 60))}:${p2(Math.floor(e % 60))}`; }
      return G.fields && k in G.fields ? G.fields[k] : m;
    });
  }
  function imgFor(src) { if (!src) return null; let i = IMG.get(src); if (!i) { i = new Image(); i.src = src; IMG.set(src, i); } return i.complete && i.naturalWidth ? i : null; }
  function drawG(ctx, G, t, now, st) {
    for (const E of G.els) {
      if (!E.vis) continue;
      const v = {}; for (const k of ANIM) v[k] = kv(E, k, t);
      if (v.op <= 0.002 || v.w < 0.5 || v.h < 0.5) continue;
      const P = E.p;
      ctx.save(); ctx.globalAlpha = clamp(v.op, 0, 1);
      ctx.translate(v.x + v.w / 2, v.y + v.h / 2); ctx.rotate(v.rot * Math.PI / 180); ctx.scale(v.sx || 0.0001, v.sy || 0.0001); ctx.translate(-v.w / 2, -v.h / 2);
      if (v.clipL || v.clipR || v.clipT || v.clipB || E.type === 'ticker') {
        ctx.beginPath(); ctx.rect(v.clipL * v.w, v.clipT * v.h, Math.max(0, v.w * (1 - v.clipL - v.clipR)), Math.max(0, v.h * (1 - v.clipT - v.clipB))); ctx.clip();
      }
      if (v.blur > 0.2) ctx.filter = `blur(${v.blur.toFixed(1)}px)`;
      if (E.type === 'rect') {
        let fill = P.fill;
        if (P.grad) { const a = P.gradAngle * Math.PI / 180, cx = v.w / 2, cy = v.h / 2, r = Math.hypot(v.w, v.h) / 2;
          fill = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r); fill.addColorStop(0, P.fill); fill.addColorStop(1, P.fill2); }
        ctx.fillStyle = fill; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(0, 0, v.w, v.h, Math.min(P.radius, v.w / 2, v.h / 2)); else ctx.rect(0, 0, v.w, v.h);
        ctx.fill(); if (P.stroke > 0) { ctx.lineWidth = P.stroke; ctx.strokeStyle = P.strokeColor; ctx.stroke(); }
      } else if (E.type === 'text') {
        let s = tokens(G, P.text, st, now); if (P.upper) s = s.toUpperCase();
        const lines = s.split('\n'), lh = P.size * 1.2, total = lines.length * lh;
        ctx.font = `${P.weight} ${P.size}px ${P.font}`; ctx.textBaseline = 'middle'; ctx.textAlign = P.align;
        try { ctx.letterSpacing = (P.ls || 0) + 'px'; } catch (e) {}
        const x = P.align === 'center' ? v.w / 2 : P.align === 'right' ? v.w : 0;
        let y = P.valign === 'top' ? lh / 2 : P.valign === 'bottom' ? v.h - total + lh / 2 : v.h / 2 - total / 2 + lh / 2;
        if (P.shadow) { ctx.shadowColor = P.shColor; ctx.shadowBlur = P.shBlur; ctx.shadowOffsetY = P.shBlur / 4; }
        for (const ln of lines) {
          if (P.stroke > 0) { ctx.lineWidth = P.stroke; ctx.strokeStyle = P.strokeColor; ctx.lineJoin = 'round'; ctx.strokeText(ln, x, y); }
          ctx.fillStyle = P.color; ctx.fillText(ln, x, y); y += lh;
        }
      } else if (E.type === 'image') {
        const im = imgFor(P.src);
        if (im) {
          const iw = im.naturalWidth, ih = im.naturalHeight;
          if (P.fit === 'stretch') ctx.drawImage(im, 0, 0, v.w, v.h);
          else { const k = P.fit === 'cover' ? Math.max(v.w / iw, v.h / ih) : Math.min(v.w / iw, v.h / ih), dw = iw * k, dh = ih * k;
            if (P.fit === 'cover') { ctx.beginPath(); ctx.rect(0, 0, v.w, v.h); ctx.clip(); }
            ctx.drawImage(im, (v.w - dw) / 2, (v.h - dh) / 2, dw, dh); }
        } else if (ctx === ED.ctx) { ctx.strokeStyle = '#666'; ctx.setLineDash([8, 6]); ctx.strokeRect(0, 0, v.w, v.h); ctx.setLineDash([]); ctx.fillStyle = '#888'; ctx.font = '28px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(L('obrázek – nahraj ho vpravo'), v.w / 2, v.h / 2); }
      } else if (E.type === 'ticker') {
        const s = tokens(G, P.text, st, now).replace(/\n/g, '   ');
        ctx.font = `${P.weight} ${P.size}px ${P.font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = P.color;
        const tw = ctx.measureText(s).width + P.gap; if (tw > 1) { let x = -((now / 1000) * P.speed % tw); for (; x < v.w; x += tw) ctx.fillText(s, x, v.h / 2); }
      }
      ctx.restore();
    }
  }

  /* ---------- vysílání (DSK) ---------- */
  function toggle(G) {
    if (!G) return; const st = RT[G.id];
    if (!st || st.ph === 'out') RT[G.id] = {ph:'in', t:0, hold:0, cdStart:performance.now()};
    else { st.ph = 'out'; st.t = Math.max(st.t, G.outStart); }
    renderCtlState();
  }
  function setIn(G, on) { if (!G) return; const st = RT[G.id], isOn = st && st.ph !== 'out'; if (on !== isOn) toggle(G); }
  function kill(G) { delete RT[G.id]; renderCtlState(); }
  function tick(dt) {
    for (const id in RT) {
      const G = gById(id), st = RT[id]; if (!G) { delete RT[id]; continue; }
      if (st.ph === 'in') { st.t += dt; if (st.t >= G.inEnd) { st.t = G.inEnd; st.ph = 'hold'; } }
      else if (st.ph === 'hold') { st.hold += dt; if (G.autoOut > 0 && st.hold >= G.autoOut) { st.ph = 'out'; st.t = G.outStart; renderCtlState(); } }
      else { st.t += dt; if (st.t >= G.dur) { delete RT[id]; renderCtlState(); } }
    }
  }
  function drawOverlay(ctx, now) { for (const G of S.gfx.list) { const st = RT[G.id]; if (st) drawG(ctx, G, st.t, now, st); } }
  const onAirNames = () => S.gfx.list.filter(G => RT[G.id] && RT[G.id].ph !== 'out').map(G => G.name);

  /* ---------- ovládací záložka v Režii ---------- */
  const fieldKeys = G => { const set = new Set(Object.keys(G.fields || {})); G.els.forEach(E => String(E.p.text || '').replace(/\{(\w+)\}/g, (m, k) => { if (!['time','hm','date','cd','elapsed'].includes(k)) set.add(k); })); return [...set]; };
  function renderCtl() {
    const box = $('#tab-gfxctl'); if (!box || !S.gfx) return;
    box.innerHTML = `<div class="addbar"><button data-gc="new">+ Nová grafika</button><button data-gc="editor">✨ Otevřít editor grafiky</button><span class="dim">F1–F8 = zapnout/vypnout grafiku 1–8. Grafika jde přes všechny scény (jako DSK v televizi).</span></div>
    <div class="srclist">${S.gfx.list.map((G, i) => {
      const fk = fieldKeys(G), uses = G.els.some(E => /\{cd\}/.test(E.p.text || ''));
      return `<div class="src gcard" data-id="${G.id}"><div class="srch"><span class="fkey">${i < 8 ? 'F' + (i + 1) : ''}</span><b class="nm">${esc(G.name)}</b>
        <button data-gc="kill" title="Skrýt hned bez animace">✕ hned</button><button data-gc="edit">✏ Upravit</button></div>
        <button class="gon" data-gc="toggle">ON AIR</button>
        ${fk.map(k => `<label>${esc(k)}<input data-gf="${esc(k)}" value="${esc((G.fields || {})[k] ?? '')}"></label>`).join('')}
        <div class="grid2"><label>Sama zmizí po (s, 0 = ne)<input type="number" min="0" step="1" data-gg="autoOut" value="${G.autoOut}"></label>
        ${uses ? `<label>Odpočet (minuty)<input type="number" min="0" step="0.5" data-gg="cdMin" value="${G.cdMin}"></label>` : '<span></span>'}</div></div>`;
    }).join('') || '<p class="dim">Zatím žádná grafika.</p>'}</div>`;
    renderCtlState();
  }
  function renderCtlState() {
    document.querySelectorAll('#tab-gfxctl .gcard').forEach(c => {
      const st = RT[c.dataset.id], on = st && st.ph !== 'out', b = c.querySelector('.gon');
      b.classList.toggle('on', !!on); b.textContent = on ? '● ON AIR – klikni pro OUT' : st ? 'odjíždí…' : '▶ IN – poslat do vysílání';
    });
    const n = onAirNames(), el = $('#gfxOnAir'); if (el) el.textContent = n.length ? '✨ ' + n.join(', ') : '';
    const eb = $('#gxOnAirBtn'); if (eb) { const G = curG(); const on = G && RT[G.id] && RT[G.id].ph !== 'out'; eb.classList.toggle('on', !!on); eb.textContent = on ? '● ON AIR (OUT)' : '▶ Do vysílání'; }
  }
  async function newFromTemplate() {
    const f = await dialog('Nová grafika', `<label>Šablona<select name="tpl">${Object.entries(TEMPLATES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label>
      <p class="dim">Šablonu pak můžeš libovolně upravit v editoru – texty, barvy, animace.</p>`);
    if (!f) return null; const G = TEMPLATES[f.tpl][1](); S.gfx.list.push(G); save(); renderCtl(); return G;
  }

  /* ---------- editor ---------- */
  function pushUndo() { const G = curG(); if (!G) return; UNDO.stack.push({id:G.id, j:JSON.stringify(G)}); if (UNDO.stack.length > 60) UNDO.stack.shift(); UNDO.redo = []; }
  function undo(redo) {
    const from = redo ? UNDO.redo : UNDO.stack, to = redo ? UNDO.stack : UNDO.redo; const u = from.pop(); if (!u) return;
    const i = S.gfx.list.findIndex(g => g.id === u.id); if (i < 0) return;
    to.push({id:u.id, j:JSON.stringify(S.gfx.list[i])}); S.gfx.list[i] = JSON.parse(u.j);
    ED.selKf = null; renderPage(); save();
  }
  let pageBuilt = false;
  function buildPage() {
    const pg = $('#page-gfx');
    pg.innerHTML = `<div class="gx">
      <aside class="gx-list panel"><div class="ph">Grafiky <span><button data-ge="new" title="Nová ze šablony">+</button><button data-ge="dup" title="Duplikovat">⧉</button><button data-ge="up">▲</button><button data-ge="down">▼</button><button data-ge="del" title="Smazat">✕</button></span></div><div id="gxList"></div>
        <div class="ph">Vrstvy</div><div id="gxEls"></div></aside>
      <section class="gx-stage panel"><div class="gx-tools">
        <button data-ge="add-text">+ Text</button><button data-ge="add-rect">+ Obdélník</button><button data-ge="add-image">+ Obrázek</button><button data-ge="add-ticker">+ Lišta</button>
        <span class="sp"></span><select id="gxBg"><option value="checker">Pozadí: šachovnice</option><option value="program">Pozadí: program</option><option value="black">Pozadí: černé</option></select>
        <label class="chk"><input type="checkbox" id="gxSafe"> bezpečné okraje</label>
        <button data-ge="undo" title="Zpět (Ctrl+Z)">↶</button><button data-ge="redo" title="Znovu (Ctrl+Shift+Z)">↷</button>
        <button id="gxOnAirBtn" data-ge="onair">▶ Do vysílání</button></div>
        <div class="gx-cvw"><canvas id="gxCv" width="${W}" height="${H}"></canvas></div></section>
      <aside class="gx-props panel" id="gxProps"></aside>
      <section class="gx-tl panel"><div class="gx-tr">
        <button data-ge="play" id="gxPlay">▶</button><button data-ge="home">⏮</button><button data-ge="playin">▶ IN</button><button data-ge="playout">▶ OUT</button>
        <label class="chk"><input type="checkbox" id="gxLoop" checked> smyčka</label><span id="gxTime" class="mono"></span>
        <span class="dim">Zelená část = příjezd (IN), pak grafika čeká, červená = odjezd (OUT). Posuň značky IN/OUT na pravítku. ◆ = klíčový snímek, táhni je myší.</span></div>
        <div class="gx-tlw"><canvas id="gxTl"></canvas></div></section></div>`;
    ED.cv = $('#gxCv'); ED.ctx = ED.cv.getContext('2d'); ED.tl = $('#gxTl'); ED.tlx = ED.tl.getContext('2d');
    const chk = document.createElement('canvas'); chk.width = chk.height = 40; const cx = chk.getContext('2d');
    cx.fillStyle = '#2a2a2a'; cx.fillRect(0, 0, 40, 40); cx.fillStyle = '#383838'; cx.fillRect(0, 0, 20, 20); cx.fillRect(20, 20, 20, 20); ED.chk = ED.ctx.createPattern(chk, 'repeat');
    pg.addEventListener('click', onClick); pg.addEventListener('input', onInput); pg.addEventListener('change', onChange);
    $('#gxBg').onchange = e => ED.bg = e.target.value; $('#gxSafe').onchange = e => ED.safe = e.target.checked; $('#gxLoop').onchange = e => ED.loop = e.target.checked;
    stageEvents(); tlEvents();
    new ResizeObserver(() => sizeTl()).observe($('.gx-tlw'));
    pageBuilt = true;
  }
  function renderPage() {
    if (!pageBuilt) buildPage();
    if (!curG() && S.gfx.list.length) ED.gid = S.gfx.list[0].id;
    const G = curG(); if (G) { if (ED.gid !== G.id || ED.t0 !== G.id) { ED.t = G.inEnd; ED.t0 = G.id; } ED.gid = G.id; }
    $('#gxList').innerHTML = S.gfx.list.map((g, i) => `<div class="layer ${g.id === ED.gid ? 'sel' : ''}" data-gid="${g.id}"><span class="fkey">${i < 8 ? 'F' + (i + 1) : ''}</span><span class="nm">${esc(g.name)}</span>${RT[g.id] ? '<span class="tag red">AIR</span>' : ''}</div>`).join('') || '<p class="dim" style="padding:8px">Žádná grafika – klikni +</p>';
    $('#gxEls').innerHTML = G ? [...G.els].reverse().map(E => `<div class="layer ${E.id === ED.sel ? 'sel' : ''}" data-eid="${E.id}"><button data-ge="vis">${E.vis ? '👁' : '—'}</button><span class="nm">${{text:'🔤', rect:'▭', image:'🖼', ticker:'📰'}[E.type]} ${esc(E.name)}</span><button data-ge="eup">▲</button><button data-ge="edown">▼</button><button data-ge="edel">✕</button></div>`).join('') : '';
    renderProps(); renderCtlState(); sizeTl();
  }
  const num = (k, v, st, attr) => `<input type="number" step="${st}" ${attr} value="${+(+v).toFixed(st < 1 ? 3 : 1)}">`;
  function renderProps() {
    const box = $('#gxProps'), G = curG(); if (!box) return;
    if (!G) { box.innerHTML = '<p class="dim" style="padding:10px">Vytvoř grafiku tlačítkem +.</p>'; return; }
    const E = elById(G, ED.sel);
    if (!E) {
      const fk = fieldKeys(G);
      box.innerHTML = `<div class="ph">Grafika</div><div class="gxp">
        <label>Název<input data-gg="name" value="${esc(G.name)}"></label>
        <div class="grid2"><label>Celková délka (s)${num('dur', G.dur, 0.1, 'data-gg="dur" min="0.2"')}</label><label>Konec příjezdu IN (s)${num('inEnd', G.inEnd, 0.05, 'data-gg="inEnd" min="0"')}</label>
        <label>Začátek odjezdu OUT (s)${num('outStart', G.outStart, 0.05, 'data-gg="outStart" min="0"')}</label><label>Sama zmizí po (s)${num('autoOut', G.autoOut, 1, 'data-gg="autoOut" min="0"')}</label>
        <label>Odpočet {cd} (min)${num('cdMin', G.cdMin, 0.5, 'data-gg="cdMin" min="0"')}</label></div>
        <h5>Pole (texty, které měníš při vysílání)</h5>
        ${fk.map(k => `<label>{${esc(k)}}<input data-gf="${esc(k)}" value="${esc((G.fields || {})[k] ?? '')}"></label>`).join('') || '<p class="dim">Do textu napiš třeba {jmeno} a objeví se tu pole.</p>'}
        <div class="btns"><button data-ge="addfield">+ Přidat pole</button></div>
        <p class="dim">Speciální: {time} čas, {hm} hodiny:minuty, {date} datum, {cd} odpočet, {elapsed} uběhlý čas.</p></div>`;
      return;
    }
    const P = E.p, sf = (k, html) => `<label>${html}</label>`;
    let st = '';
    if (E.type === 'text' || E.type === 'ticker') {
      st += `<label>Text<textarea data-gs="text" rows="2">${esc(P.text)}</textarea></label>
      <div class="grid2">${sf('font', `Písmo<select data-gs="font">${FNT.options(P.font)}</select>`)}
      ${sf('size', `Velikost${num('size', P.size, 1, 'data-gs="size" min="4"')}`)}
      ${sf('weight', `Tloušťka<select data-gs="weight">${[300,400,500,600,700,800,900].map(w => `<option ${+P.weight === w ? 'selected' : ''}>${w}</option>`).join('')}</select>`)}
      ${sf('color', `Barva<input type="color" data-gs="color" value="${P.color}">`)}</div>`;
    }
    if (E.type === 'text') st += `<div class="grid2">${sf('align', `Zarovnání<select data-gs="align">${[['left','vlevo'],['center','na střed'],['right','vpravo']].map(a => `<option value="${a[0]}" ${P.align === a[0] ? 'selected' : ''}>${a[1]}</option>`).join('')}</select>`)}
      ${sf('valign', `Svisle<select data-gs="valign">${[['top','nahoru'],['middle','na střed'],['bottom','dolů']].map(a => `<option value="${a[0]}" ${P.valign === a[0] ? 'selected' : ''}>${a[1]}</option>`).join('')}</select>`)}
      ${sf('ls', `Mezery písmen${num('ls', P.ls, 0.5, 'data-gs="ls"')}`)}<label class="chk"><input type="checkbox" data-gs="upper" ${P.upper ? 'checked' : ''}> VELKÁ PÍSMENA</label>
      <label class="chk"><input type="checkbox" data-gs="shadow" ${P.shadow ? 'checked' : ''}> Stín</label>${sf('shColor', `Barva stínu<input type="color" data-gs="shColor" value="${P.shColor}">`)}
      ${sf('stroke', `Obrys (px)${num('stroke', P.stroke, 0.5, 'data-gs="stroke" min="0"')}`)}${sf('strokeColor', `Barva obrysu<input type="color" data-gs="strokeColor" value="${P.strokeColor}">`)}</div>`;
    if (E.type === 'ticker') st += `<div class="grid2">${sf('speed', `Rychlost (px/s)${num('speed', P.speed, 5, 'data-gs="speed"')}`)}${sf('gap', `Mezera${num('gap', P.gap, 10, 'data-gs="gap"')}`)}</div>`;
    if (E.type === 'rect') st += `<div class="grid2">${sf('fill', `Barva<input type="color" data-gs="fill" value="${P.fill}">`)}<label class="chk"><input type="checkbox" data-gs="grad" ${P.grad ? 'checked' : ''}> Přechod barev</label>
      ${sf('fill2', `Druhá barva<input type="color" data-gs="fill2" value="${P.fill2}">`)}${sf('gradAngle', `Úhel přechodu${num('gradAngle', P.gradAngle, 5, 'data-gs="gradAngle"')}`)}
      ${sf('radius', `Zaoblení${num('radius', P.radius, 1, 'data-gs="radius" min="0"')}`)}${sf('stroke', `Obrys (px)${num('stroke', P.stroke, 0.5, 'data-gs="stroke" min="0"')}`)}
      ${sf('strokeColor', `Barva obrysu<input type="color" data-gs="strokeColor" value="${P.strokeColor}">`)}</div>`;
    if (E.type === 'image') st += `<div class="btns"><button data-ge="imgload">📂 Nahrát obrázek</button></div><label>Přizpůsobení<select data-gs="fit">${[['contain','celý obrázek'],['cover','vyplnit'],['stretch','roztáhnout']].map(a => `<option value="${a[0]}" ${P.fit === a[0] ? 'selected' : ''}>${a[1]}</option>`).join('')}</select></label>`;
    const t = ED.t;
    const rows = ANIM.map(k => {
      const animated = (E.kf[k] || []).length > 0, on = hasKeyAt(E, k, t);
      return `<div class="arow"><button class="kfb ${on ? 'on' : animated ? 'part' : ''}" data-kf="${k}" title="${on ? 'Smazat klíčový snímek' : 'Přidat klíčový snímek v tomto čase'}">◆</button><span>${AL[k]}</span>${num(k, kv(E, k, t), ASTEP[k], `data-gp="${k}"`)}</div>`;
    }).join('');
    const sk = ED.selKf && ED.selKf.eid === E.id && (E.kf[ED.selKf.prop] || [])[ED.selKf.i];
    const opt = o => Object.entries(o).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
    box.innerHTML = `<div class="ph">${TNAME[E.type]}<span><button data-ge="desel" title="Zpět na nastavení grafiky">⨯</button></span></div><div class="gxp">
      <label>Název vrstvy<input data-gs="__name" value="${esc(E.name)}"></label>${st}
      <h5>Rychlá animace</h5>
      <div class="grid2"><label>Příjezd (IN)<select id="gxPin">${opt(PRE_IN)}</select></label><label>Odjezd (OUT)<select id="gxPout">${opt(PRE_IN)}</select></label>
      <label>Zpoždění (s)<input id="gxPd" type="number" step="0.05" value="0" min="0"></label><label>Délka (s)<input id="gxPdur" type="number" step="0.05" value="0.5" min="0.05"></label></div>
      <div class="btns"><button data-ge="preset" class="primary">Použít animaci</button><button data-ge="clearkf">Smazat všechny animace</button></div>
      <h5>Vlastnosti v čase ${t.toFixed(2)} s <span class="dim">(◆ = klíčový snímek)</span></h5>${rows}
      ${sk ? `<div class="sec"><h4>Vybraný klíčový snímek – ${AL[ED.selKf.prop]}</h4><div class="grid2"><label>Čas (s)${num('t', sk.t, 0.01, 'data-gk="t" min="0"')}</label><label>Hodnota${num('v', sk.v, ASTEP[ED.selKf.prop], 'data-gk="v"')}</label>
        <label>Průběh k dalšímu<select data-gk="e">${Object.entries(EZN).map(([k, n]) => `<option value="${k}" ${sk.e === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label><span></span></div><button data-ge="delkf">🗑 Smazat snímek</button></div>` : ''}
    </div>`;
  }
  let lastPropT = -1;
  function refreshPropVals() {
    const G = curG(), E = G && elById(G, ED.sel); if (!E || lastPropT === ED.t) return; lastPropT = ED.t;
    const box = $('#gxProps');
    box.querySelectorAll('[data-gp]').forEach(i => { if (i !== document.activeElement) { const k = i.dataset.gp; i.value = +(+kv(E, k, ED.t)).toFixed(ASTEP[k] < 1 ? 3 : 1); } });
    box.querySelectorAll('[data-kf]').forEach(b => { const k = b.dataset.kf; b.className = 'kfb ' + (hasKeyAt(E, k, ED.t) ? 'on' : (E.kf[k] || []).length ? 'part' : ''); });
    const h = [...box.querySelectorAll('h5')].find(x => x.textContent.startsWith('Vlastnosti')); if (h) h.firstChild.textContent = `Vlastnosti v čase ${ED.t.toFixed(2)} s `;
  }

  function onClick(e) {
    const b = e.target.closest('[data-ge],[data-gid],[data-eid],[data-kf]'); if (!b) return;
    const G = curG();
    if (b.dataset.kf) { const E = elById(G, ED.sel); if (!E) return; pushUndo(); toggleKey(E, b.dataset.kf, ED.t); lastPropT = -1; renderProps(); save(); return; }
    const act = b.dataset.ge;
    if (!act && b.dataset.gid) { ED.gid = b.dataset.gid; ED.sel = null; ED.selKf = null; ED.t = curG().inEnd; ED.playing = false; renderPage(); return; }
    if (!act && b.dataset.eid) { ED.sel = b.dataset.eid; ED.selKf = null; renderPage(); return; }
    const row = e.target.closest('[data-eid]'), E = row ? elById(G, row.dataset.eid) : elById(G, ED.sel);
    switch (act) {
      case 'new': newFromTemplate().then(g => { if (g) { ED.gid = g.id; ED.sel = null; renderPage(); } }); break;
      case 'dup': if (G) { const c = JSON.parse(JSON.stringify(G)); c.id = uid(); c.name += ' ' + L('(kopie)'); c.els.forEach(x => x.id = uid()); S.gfx.list.splice(S.gfx.list.indexOf(G) + 1, 0, c); ED.gid = c.id; renderPage(); save(); } break;
      case 'del': if (G && confirm(`Smazat grafiku „${G.name}“?`)) { delete RT[G.id]; S.gfx.list = S.gfx.list.filter(x => x !== G); ED.gid = null; ED.sel = null; renderPage(); renderCtl(); save(); } break;
      case 'up': case 'down': if (G) { const i = S.gfx.list.indexOf(G), j = i + (act === 'up' ? -1 : 1); if (j >= 0 && j < S.gfx.list.length) { [S.gfx.list[i], S.gfx.list[j]] = [S.gfx.list[j], S.gfx.list[i]]; renderPage(); renderCtl(); save(); } } break;
      case 'add-text': case 'add-rect': case 'add-image': case 'add-ticker': if (G) { pushUndo(); const n = newEl(act.slice(4)); G.els.push(n); ED.sel = n.id; renderPage(); save(); } break;
      case 'vis': if (E) { E.vis = !E.vis; renderPage(); save(); } break;
      case 'eup': case 'edown': if (E) { pushUndo(); const i = G.els.indexOf(E), j = i + (act === 'eup' ? 1 : -1); if (j >= 0 && j < G.els.length) { [G.els[i], G.els[j]] = [G.els[j], G.els[i]]; renderPage(); save(); } } break;
      case 'edel': if (E) { pushUndo(); G.els = G.els.filter(x => x !== E); if (ED.sel === E.id) ED.sel = null; renderPage(); save(); } break;
      case 'desel': ED.sel = null; ED.selKf = null; renderPage(); break;
      case 'undo': undo(false); break; case 'redo': undo(true); break;
      case 'onair': toggle(G); break;
      case 'play': ED.playing = !ED.playing; ED.stopAt = null; if (ED.playing && ED.t >= G.dur - 0.01) ED.t = 0; break;
      case 'home': ED.t = 0; ED.playing = false; break;
      case 'playin': ED.t = 0; ED.stopAt = G.inEnd; ED.playing = true; break;
      case 'playout': ED.t = G.outStart; ED.stopAt = G.dur; ED.playing = true; break;
      case 'preset': if (E) { pushUndo(); applyPreset(G, E, $('#gxPin').value, $('#gxPout').value, {delay:+$('#gxPd').value || 0, dur:+$('#gxPdur').value || 0.5, dist:E.type === 'text' ? 80 : 300}); lastPropT = -1; renderProps(); save(); } break;
      case 'clearkf': if (E && confirm('Smazat všechny animace této vrstvy?')) { pushUndo(); E.kf = {}; ED.selKf = null; renderProps(); save(); } break;
      case 'delkf': if (E && ED.selKf) { pushUndo(); const ks = E.kf[ED.selKf.prop]; ks.splice(ED.selKf.i, 1); if (!ks.length) delete E.kf[ED.selKf.prop]; ED.selKf = null; renderProps(); save(); } break;
      case 'imgload': if (E) pickFile('image/*').then(f => { if (!f) return; const fr = new FileReader(); fr.onload = () => { pushUndo(); E.p.src = fr.result; const im = new Image(); im.onload = () => { if (E.p.w === 600 && E.p.h === 120) { E.p.h = E.p.w * im.naturalHeight / im.naturalWidth; } renderProps(); save(); }; im.src = fr.result; }; fr.readAsDataURL(f); }); break;
      case 'addfield': dialog('Nové pole', '<label>Název pole (bez mezer, např. jmeno)<input name="k"></label>').then(f => { const k = f && f.k.trim().replace(/\W+/g, ''); if (k) { G.fields[k] = ''; renderProps(); renderCtl(); save(); } }); break;
    }
  }
  let undoArmed = true;
  function onInput(e) {
    const el = e.target, G = curG(); if (!G) return;
    if (undoArmed) { pushUndo(); undoArmed = false; setTimeout(() => undoArmed = true, 800); }
    if (el.dataset.gg) { const v = el.dataset.gg === 'name' ? el.value : val(el); if (v === null) return; G[el.dataset.gg] = v;
      if (el.dataset.gg === 'inEnd' || el.dataset.gg === 'outStart' || el.dataset.gg === 'dur') { G.dur = Math.max(0.2, G.dur); G.inEnd = clamp(G.inEnd, 0, G.dur); G.outStart = clamp(G.outStart, G.inEnd, G.dur); }
      if (el.dataset.gg === 'name') { $('#gxList .sel .nm') && ($('#gxList .sel .nm').textContent = v); renderCtl(); } save(); return; }
    if (el.dataset.gf) { G.fields[el.dataset.gf] = el.value; save(); return; }
    const E = elById(G, ED.sel); if (!E) return;
    if (el.dataset.gs === 'font') { const prev = E.p.font; FNT.pick(el, prev).then(v => { if (v === '__reload') return renderProps(); if (v) { E.p.font = v; save(); } }); return; }
    if (el.dataset.gs) { const k = el.dataset.gs, v = val(el); if (v === null) return; if (k === '__name') { E.name = v; const r = $(`#gxEls [data-eid="${E.id}"] .nm`); if (r) r.lastChild.textContent = ' ' + v; } else E.p[k] = v; if (k === 'text') renderCtl(); save(); return; }
    if (el.dataset.gp) { const v = val(el); if (v === null) return; setAnim(E, el.dataset.gp, v, ED.t); save(); return; }
    if (el.dataset.gk && ED.selKf) { const ks = E.kf[ED.selKf.prop], k = ks[ED.selKf.i]; if (!k) return; const v = el.dataset.gk === 'e' ? el.value : val(el); if (v === null) return; k[el.dataset.gk] = v;
      if (el.dataset.gk === 't') { ks.sort((a, b) => a.t - b.t); ED.selKf.i = ks.indexOf(k); } save(); }
  }
  function onChange(e) { if (e.target.dataset.gs === 'grad' || e.target.dataset.gk === 'e') renderProps(); }

  /* ---------- plátno editoru ---------- */
  function elMatrix(E, t) { const v = {}; ANIM.forEach(k => v[k] = kv(E, k, t)); return v; }
  function toLocal(v, px, py) { const cx = v.x + v.w / 2, cy = v.y + v.h / 2, a = -v.rot * Math.PI / 180; let dx = px - cx, dy = py - cy;
    const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a); return [rx / (v.sx || 1e-4) + v.w / 2, ry / (v.sy || 1e-4) + v.h / 2]; }
  function stagePt(e) { const rc = ED.cv.getBoundingClientRect(), ar = W / H; let dw, dh, ox = 0, oy = 0;
    if (rc.width / rc.height > ar) { dh = rc.height; dw = dh * ar; ox = (rc.width - dw) / 2; } else { dw = rc.width; dh = dw / ar; oy = (rc.height - dh) / 2; }
    return {x:(e.clientX - rc.left - ox) / dw * W, y:(e.clientY - rc.top - oy) / dh * H, k:dw / W}; }
  let sdrag = null;
  function stageEvents() {
    const cv = ED.cv;
    cv.addEventListener('pointerdown', e => {
      const G = curG(); if (!G) return; const p = stagePt(e);
      const sel = elById(G, ED.sel);
      if (sel) { const v = elMatrix(sel, ED.t), [lx, ly] = toLocal(v, p.x, p.y), tol = 16 / p.k / Math.abs(v.sx || 1);
        if (Math.abs(lx - v.w) < tol && Math.abs(ly - v.h) < tol) { pushUndo(); sdrag = {mode:'size', E:sel, w0:v.w, h0:v.h, p0:p, sx:v.sx, sy:v.sy}; cv.setPointerCapture(e.pointerId); return; } }
      const hit = [...G.els].reverse().find(E => { if (!E.vis) return false; const v = elMatrix(E, ED.t); if (v.op < 0.02) return false; const [lx, ly] = toLocal(v, p.x, p.y); return lx >= 0 && ly >= 0 && lx <= v.w && ly <= v.h; });
      if (hit) { if (ED.sel !== hit.id) { ED.sel = hit.id; ED.selKf = null; renderPage(); } const v = elMatrix(hit, ED.t); pushUndo(); sdrag = {mode:'move', E:hit, ox:p.x - v.x, oy:p.y - v.y}; cv.setPointerCapture(e.pointerId); }
      else if (ED.sel) { ED.sel = null; ED.selKf = null; renderPage(); }
    });
    cv.addEventListener('pointermove', e => {
      if (!sdrag) return; const p = stagePt(e), E = sdrag.E;
      if (sdrag.mode === 'move') { let nx = p.x - sdrag.ox, ny = p.y - sdrag.oy; const v = elMatrix(E, ED.t), sn = 10 / p.k;
        if (!e.altKey) { if (Math.abs(nx + v.w / 2 - W / 2) < sn) nx = W / 2 - v.w / 2; if (Math.abs(ny + v.h / 2 - H / 2) < sn) ny = H / 2 - v.h / 2; if (Math.abs(nx) < sn) nx = 0; if (Math.abs(ny) < sn) ny = 0; if (Math.abs(nx + v.w - W) < sn) nx = W - v.w; if (Math.abs(ny + v.h - H) < sn) ny = H - v.h; }
        setAnim(E, 'x', Math.round(nx), ED.t); setAnim(E, 'y', Math.round(ny), ED.t); }
      else { let nw = Math.max(4, sdrag.w0 + (p.x - sdrag.p0.x) / (sdrag.sx || 1)), nh = Math.max(4, sdrag.h0 + (p.y - sdrag.p0.y) / (sdrag.sy || 1));
        if (e.shiftKey) nh = nw * sdrag.h0 / sdrag.w0; setAnim(E, 'w', Math.round(nw), ED.t); setAnim(E, 'h', Math.round(nh), ED.t); }
      lastPropT = -1; refreshPropVals();
    });
    cv.addEventListener('pointerup', () => { if (sdrag) { sdrag = null; save(); } });
  }
  function drawStage(now) {
    const G = curG(), x = ED.ctx; if (!G) { x.fillStyle = '#111'; x.fillRect(0, 0, W, H); return; }
    if (ED.bg === 'program') x.drawImage(pg, 0, 0); else { x.fillStyle = ED.bg === 'black' ? '#000' : ED.chk; x.fillRect(0, 0, W, H); }
    drawG(x, G, ED.t, now, {cdStart:now - ED.t * 1000});
    if (ED.safe) { x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.setLineDash([10, 8]); x.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9); x.strokeRect(W * 0.1, H * 0.1, W * 0.8, H * 0.8); x.setLineDash([]); }
    const E = elById(G, ED.sel);
    if (E) { const v = elMatrix(E, ED.t); x.save(); x.translate(v.x + v.w / 2, v.y + v.h / 2); x.rotate(v.rot * Math.PI / 180); x.scale(v.sx || 1e-4, v.sy || 1e-4);
      x.strokeStyle = '#facc15'; x.lineWidth = 2 / Math.abs(v.sx || 1); x.setLineDash([8, 6]); x.strokeRect(-v.w / 2, -v.h / 2, v.w, v.h); x.setLineDash([]);
      x.fillStyle = '#facc15'; const hs = 14 / Math.abs(v.sx || 1); x.fillRect(v.w / 2 - hs / 2, v.h / 2 - hs / 2, hs, hs); x.restore(); }
  }

  /* ---------- časová osa ---------- */
  const TL = {lw:200, top:28, rh:22, scroll:0, rows:[]};
  let tdrag = null;
  function sizeTl() { const w = $('.gx-tlw'); if (!w || !ED.tl) return; const d = devicePixelRatio || 1; ED.tl.width = Math.max(10, w.clientWidth * d); ED.tl.height = Math.max(10, w.clientHeight * d); ED.tl.style.width = w.clientWidth + 'px'; ED.tl.style.height = w.clientHeight + 'px'; }
  const tW = () => ED.tl.width / (devicePixelRatio || 1), tH = () => ED.tl.height / (devicePixelRatio || 1);
  const t2x = (G, t) => TL.lw + 10 + t / G.dur * (tW() - TL.lw - 22);
  const x2t = (G, x) => clamp((x - TL.lw - 10) / (tW() - TL.lw - 22) * G.dur, 0, G.dur);
  function buildRows(G) {
    TL.rows = []; let y = TL.top - TL.scroll;
    for (const E of [...G.els].reverse()) {
      TL.rows.push({kind:'el', E, y}); y += TL.rh;
      if (ED.expanded[E.id]) for (const k of ANIM) if ((E.kf[k] || []).length) { TL.rows.push({kind:'prop', E, prop:k, y}); y += TL.rh; }
    }
    TL.maxY = y + TL.scroll;
  }
  function drawTl() {
    const G = curG(), c = ED.tlx; if (!c) return; const d = devicePixelRatio || 1, w = tW(), h = tH();
    c.setTransform(d, 0, 0, d, 0, 0); c.fillStyle = '#0f1115'; c.fillRect(0, 0, w, h); if (!G) return;
    buildRows(G);
    const xi = t2x(G, G.inEnd), xo = t2x(G, G.outStart), x0 = t2x(G, 0), x1 = t2x(G, G.dur);
    c.fillStyle = 'rgba(34,197,94,.08)'; c.fillRect(x0, 0, xi - x0, h); c.fillStyle = 'rgba(239,68,68,.08)'; c.fillRect(xo, 0, x1 - xo, h);
    c.font = '11px system-ui'; c.textBaseline = 'middle';
    for (const r of TL.rows) {
      if (r.y + TL.rh < TL.top || r.y > h) continue;
      const sel = r.E.id === ED.sel;
      c.fillStyle = sel ? '#262a33' : (r.kind === 'el' ? '#16181d' : '#121419'); c.fillRect(0, r.y, w, TL.rh - 1);
      c.fillStyle = '#e7e9ec';
      if (r.kind === 'el') {
        c.fillText(r.E.vis ? '👁' : '·', 6, r.y + TL.rh / 2); c.fillStyle = '#8b919b'; c.fillText(ED.expanded[r.E.id] ? '▾' : '▸', 24, r.y + TL.rh / 2);
        c.fillStyle = sel ? '#facc15' : '#e7e9ec'; c.fillText(L(r.E.name).slice(0, 24), 38, r.y + TL.rh / 2);
        const times = new Set(); Object.values(r.E.kf).forEach(ks => ks.forEach(k => times.add(+k.t.toFixed(4))));
        times.forEach(t => diamond(c, t2x(G, t), r.y + TL.rh / 2, 5, '#9ca3af', false));
      } else {
        c.fillStyle = '#8b919b'; c.fillText(L(AL[r.prop]), 46, r.y + TL.rh / 2);
        (r.E.kf[r.prop] || []).forEach((k, i) => { const s = ED.selKf && ED.selKf.eid === r.E.id && ED.selKf.prop === r.prop && ED.selKf.i === i;
          diamond(c, t2x(G, k.t), r.y + TL.rh / 2, 5, s ? '#facc15' : '#60a5fa', true); });
      }
    }
    c.fillStyle = '#16181d'; c.fillRect(0, 0, w, TL.top); c.fillStyle = '#1b1e24'; c.fillRect(TL.lw, 0, w, TL.top);
    c.strokeStyle = '#3a3f49'; c.fillStyle = '#8b919b'; c.beginPath();
    const step = G.dur > 20 ? 2 : G.dur > 8 ? 1 : 0.5;
    for (let t = 0; t <= G.dur + 1e-6; t += step / 2) { const x = t2x(G, t), major = Math.abs(t / step - Math.round(t / step)) < 1e-6; c.moveTo(x + 0.5, major ? 12 : 20); c.lineTo(x + 0.5, TL.top); if (major) c.fillText(t.toFixed(step < 1 ? 1 : 0) + 's', x + 3, 8); }
    c.stroke();
    c.fillStyle = '#e7e9ec'; c.fillText(L('čas →'), 8, TL.top / 2);
    marker(c, xi, h, '#22c55e', 'IN'); marker(c, xo, h, '#ef4444', 'OUT');
    const xp = t2x(G, ED.t); c.strokeStyle = '#facc15'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(xp, 0); c.lineTo(xp, h); c.stroke(); c.lineWidth = 1;
    c.fillStyle = '#facc15'; c.beginPath(); c.moveTo(xp - 6, 0); c.lineTo(xp + 6, 0); c.lineTo(xp, 9); c.fill();
    c.strokeStyle = '#2a2e36'; c.beginPath(); c.moveTo(TL.lw + 0.5, 0); c.lineTo(TL.lw + 0.5, h); c.stroke();
  }
  function diamond(c, x, y, r, col, fill) { c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fillStyle = col; if (fill) c.fill(); else { c.fill(); } }
  function marker(c, x, h, col, label) { c.strokeStyle = col; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(x + 0.5, TL.top); c.lineTo(x + 0.5, h); c.stroke(); c.setLineDash([]);
    c.fillStyle = col; c.fillRect(x - 14, TL.top - 13, 28, 13); c.fillStyle = '#000'; c.font = 'bold 10px system-ui'; c.textAlign = 'center'; c.fillText(label, x, TL.top - 6); c.textAlign = 'left'; c.font = '11px system-ui'; }
  function tlEvents() {
    const cv = ED.tl;
    const pt = e => { const r = cv.getBoundingClientRect(); return {x:e.clientX - r.left, y:e.clientY - r.top}; };
    cv.addEventListener('pointerdown', e => {
      const G = curG(); if (!G) return; const p = pt(e);
      if (p.y < TL.top) {
        if (Math.abs(p.x - t2x(G, G.inEnd)) < 14 && p.y > TL.top - 14) tdrag = {mode:'in'};
        else if (Math.abs(p.x - t2x(G, G.outStart)) < 14 && p.y > TL.top - 14) tdrag = {mode:'out'};
        else { tdrag = {mode:'play'}; ED.playing = false; ED.t = x2t(G, p.x); }
        if (tdrag.mode !== 'play') pushUndo(); cv.setPointerCapture(e.pointerId); return;
      }
      const r = TL.rows.find(r => p.y >= r.y && p.y < r.y + TL.rh); if (!r) return;
      if (p.x < TL.lw) {
        if (r.kind === 'el' && p.x < 20) { r.E.vis = !r.E.vis; renderPage(); save(); return; }
        if (r.kind === 'el' && p.x < 36) { ED.expanded[r.E.id] = !ED.expanded[r.E.id]; return; }
        ED.sel = r.E.id; ED.selKf = null; renderPage(); return;
      }
      const hitT = ks => ks.findIndex(k => Math.abs(t2x(G, k.t) - p.x) < 7);
      if (r.kind === 'prop') {
        const ks = r.E.kf[r.prop] || [], i = hitT(ks);
        if (i >= 0) { pushUndo(); ED.sel = r.E.id; ED.selKf = {eid:r.E.id, prop:r.prop, i}; tdrag = {mode:'keys', items:[{ks, k:ks[i], t0:ks[i].t}], x0:p.x}; renderPage(); cv.setPointerCapture(e.pointerId); return; }
      } else {
        const items = []; let first = null;
        for (const prop in r.E.kf) { const ks = r.E.kf[prop]; const i = hitT(ks); if (i >= 0) { const tt = ks[i].t; ks.forEach((k, j) => { if (Math.abs(k.t - tt) < 1e-4) { items.push({ks, k, t0:k.t}); if (!first) first = {eid:r.E.id, prop, i:j}; } }); } }
        if (items.length) { pushUndo(); ED.sel = r.E.id; ED.selKf = first; tdrag = {mode:'keys', items, x0:p.x}; renderPage(); cv.setPointerCapture(e.pointerId); return; }
      }
      ED.sel = r.E.id; ED.t = x2t(G, p.x); ED.playing = false; tdrag = {mode:'play'}; renderPage(); cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      if (!tdrag) return; const G = curG(), p = pt(e), t = x2t(G, p.x), snap = v => e.shiftKey ? v : Math.round(v * 30) / 30;
      if (tdrag.mode === 'play') ED.t = t;
      else if (tdrag.mode === 'in') G.inEnd = clamp(snap(t), 0, G.outStart);
      else if (tdrag.mode === 'out') G.outStart = clamp(snap(t), G.inEnd, G.dur);
      else if (tdrag.mode === 'keys') { const dt = (p.x - tdrag.x0) / (tW() - TL.lw - 22) * G.dur; tdrag.items.forEach(it => it.k.t = clamp(snap(it.t0 + dt), 0, G.dur)); }
    });
    cv.addEventListener('pointerup', () => {
      if (!tdrag) return;
      if (tdrag.mode === 'keys') { const G = curG(), E = elById(G, ED.sel); const sk = ED.selKf && E && E.kf[ED.selKf.prop] && E.kf[ED.selKf.prop][ED.selKf.i];
        tdrag.items.forEach(it => it.ks.sort((a, b) => a.t - b.t)); if (sk) ED.selKf.i = E.kf[ED.selKf.prop].indexOf(sk); renderProps(); }
      if (tdrag.mode !== 'play') { save(); renderProps(); }
      tdrag = null;
    });
    cv.addEventListener('wheel', e => { TL.scroll = clamp(TL.scroll + e.deltaY, 0, Math.max(0, TL.maxY - tH() + 10)); e.preventDefault(); }, {passive:false});
  }

  function editorTick(dt, now) {
    if (S.page !== 'gfx' || !pageBuilt) return;
    const G = curG();
    if (G && ED.playing) { ED.t += dt; const end = ED.stopAt ?? G.dur; if (ED.t >= end) { if (ED.stopAt == null && ED.loop) ED.t = 0; else { ED.t = end; ED.playing = false; ED.stopAt = null; } } }
    if (G) ED.t = clamp(ED.t, 0, G.dur);
    drawStage(now); drawTl(); refreshPropVals();
    const pb = $('#gxPlay'); if (pb) pb.textContent = ED.playing ? '⏸' : '▶';
    const tt = $('#gxTime'); if (tt && G) tt.textContent = `${ED.t.toFixed(2)} / ${G.dur.toFixed(2)} s`;
  }
  function key(e) {
    if (!POP.keyOn('gfx')) return false;
    const G = curG(); if (!G) return false;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { undo(e.shiftKey); return true; }
    if (e.code === 'Space') { ED.playing = !ED.playing; ED.stopAt = null; return true; }
    if (e.key === 'Home') { ED.t = 0; return true; }
    if (e.key === 'End') { ED.t = G.dur; return true; }
    const E = elById(G, ED.sel);
    if ((e.key === 'Delete' || e.key === 'Backspace') && E) {
      pushUndo();
      if (ED.selKf) { const ks = E.kf[ED.selKf.prop]; if (ks) { ks.splice(ED.selKf.i, 1); if (!ks.length) delete E.kf[ED.selKf.prop]; } ED.selKf = null; }
      else { G.els = G.els.filter(x => x !== E); ED.sel = null; }
      renderPage(); save(); return true;
    }
    if (e.key.startsWith('Arrow') && E) {
      const d = e.shiftKey ? 10 : 1, v = elMatrix(E, ED.t);
      if (e.key === 'ArrowLeft') setAnim(E, 'x', v.x - d, ED.t); if (e.key === 'ArrowRight') setAnim(E, 'x', v.x + d, ED.t);
      if (e.key === 'ArrowUp') setAnim(E, 'y', v.y - d, ED.t); if (e.key === 'ArrowDown') setAnim(E, 'y', v.y + d, ED.t);
      lastPropT = -1; save(); return true;
    }
    return false;
  }

  function init() {
    const box = $('#tab-gfxctl');
    box.addEventListener('click', e => {
      const a = e.target.dataset.gc; if (!a) return;
      if (a === 'new') { newFromTemplate(); return; } if (a === 'editor') { showPage('gfx'); return; }
      const G = gById(e.target.closest('.gcard').dataset.id); if (!G) return;
      if (a === 'toggle') toggle(G); if (a === 'kill') kill(G); if (a === 'edit') { ED.gid = G.id; ED.sel = null; showPage('gfx'); }
    });
    box.addEventListener('input', e => {
      const c = e.target.closest('.gcard'); if (!c) return; const G = gById(c.dataset.id); if (!G) return;
      if (e.target.dataset.gf) G.fields[e.target.dataset.gf] = e.target.value;
      if (e.target.dataset.gg) { const v = val(e.target); if (v !== null) G[e.target.dataset.gg] = v; }
      save();
    });
  }
  const save_ = () => ({list:S.gfx.list});
  function load(d) {
    S.gfx = {list:d && d.list ? d.list : [TEMPLATES.lower[1](), TEMPLATES.bug[1](), TEMPLATES.ticker[1](), TEMPLATES.full[1]()]};
    for (const k in RT) delete RT[k];
  }
  return {init, load, save:save_, tick, drawOverlay, renderCtl, renderPage, editorTick, key, toggle, setIn, kill,
    byIndex:i => S.gfx.list[i], byId:gById, onAirNames, isOn:G => { const st = G && RT[G.id]; return !!(st && st.ph !== 'out'); }};
})();
