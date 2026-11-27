'use strict';
/* ================= ⏪ REPLAY 2.0: opakované záběry, zpomalovačky, víc úhlů =================
   Vybrané zdroje (kamery, hosté, NDI/SRT vstupy, videa) i celý PROGRAM se průběžně kódují na grafice (H.264)
   do paměti – posledních N sekund. Nic surového se nedrží (1080p ≈ 1 MB/s místo 90 MB/s).
   – Jedním tlačítkem posledních X s rychlostí 100 / 75 / 50 / 25 %, rovnou do vysílání (volitelně přes stinger/přechod).
   – Body IN / OUT a posuvník: najdeš přesný moment, náhled ukazuje snímek, pak pustíš IN→OUT.
   – Víc úhlů: všechny zdroje mají stejné časy → přepnutí úhlu za běhu pokračuje ve stejném okamžiku,
     nebo „všechny úhly po sobě“.
   – Plynulé zpomalení: mezi dvěma snímky se prolíná (25 % z 30 fps by jinak bylo 7,5 snímku/s).
   Po skončení se režie vrátí na předchozí scénu. Každý VideoFrame se hned zavírá (jinak by rostla paměť). */
const RPL = (() => {
  const PROG = '__program';
  const ENC = new Map();   // id → {enc, chunks:[{ts,key,chunk}], w, h, codec, n, lastT}
  const ST = {play:null, marks:[], src:null, scene:null, prevProg:null, inT:null, outT:null, cueT:null, cue:null, chain:null};
  const DEF = {cams:[], secs:30, len:8, speed:0.5, cam:'', back:true, bug:true, blend:true, tr:'', prog:false, fps:30};
  const C = () => S.replay || (S.replay = Object.assign({}, DEF));
  const ms = () => performance.now();
  const ELIG = new Set(['camera', 'guest', 'screen', 'netin', 'ndiin', 'video', 'playlist', 'slides', 'v360']);
  const name = id => id === PROG ? '🎬 ' + L('Program') : ((srcById(id) || {}).name || '?');
  const ids = () => [...(C().prog ? [PROG] : []), ...C().cams];
  const elOf = id => id === PROG ? pg : (srcById(id) || {}).el;

  /* ---------- nahrávání do paměti ---------- */
  async function pickCodec(w, h, fps) {
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'vp8']) {
      const c = {codec, width:w, height:h, bitrate:Math.round(w * h * fps * 0.12), framerate:fps, latencyMode:'realtime', hardwareAcceleration:'prefer-hardware'};
      if (codec.startsWith('avc')) c.avc = {format:'annexb'};
      try { if ((await VideoEncoder.isConfigSupported(c)).supported) return c; } catch (e) {}
      try { delete c.hardwareAcceleration; if ((await VideoEncoder.isConfigSupported(c)).supported) return c; } catch (e) {}
    }
    return null;
  }
  function dims(el) {
    if (el instanceof HTMLVideoElement) return [el.videoWidth, el.videoHeight];
    if (el instanceof HTMLCanvasElement) return [el.width, el.height];
    return [0, 0];
  }
  async function start(id) {
    if (ENC.has(id) || !window.VideoEncoder) return;
    const el = elOf(id); let [w, h] = dims(el); if (!w || !h) return;
    // velký zdroj (4K, 360°) zmenšit na max 1920 – stačí na replay a šetří kodér i paměť
    const k = Math.min(1, 1920 / w, 1920 / h); w = Math.round(w * k) & ~1; h = Math.round(h * k) & ~1;
    const fps = Math.min(60, Math.max(25, +C().fps || 30));
    const e = {chunks:[], w, h, n:0, busy:true, fps, lastT:0, scale:k < 1}; ENC.set(id, e);
    const cfg = await pickCodec(w, h, fps);
    if (!cfg) { e.err = L('kodér není k dispozici'); return; }
    e.codec = cfg.codec;
    e.enc = new VideoEncoder({output:chunk => { e.chunks.push({ts:chunk.timestamp / 1000, key:chunk.type === 'key', chunk}); trim(e); }, error:er => { e.err = er.message; }});
    e.enc.configure(cfg); e.busy = false;
    if (e.scale) { e.cv = new OffscreenCanvas(w, h); e.cx = e.cv.getContext('2d'); }
  }
  function stopEnc(id) { const e = ENC.get(id); if (!e) return; try { e.enc && e.enc.close(); } catch (er) {} ENC.delete(id); }
  // držet jen posledních N sekund, ale vždy od klíčového snímku
  function trim(e) {
    const cut = ms() - (C().secs + 2) * 1000;
    while (e.chunks.length > 1 && e.chunks[0].ts < cut) {
      const nk = e.chunks.findIndex((c, i) => i > 0 && c.key);
      if (nk < 0 || e.chunks[nk].ts > cut) break;
      e.chunks.splice(0, nk);
    }
  }
  function tick(now) {
    const want = ids();
    for (const id of want) {
      if (id !== PROG) { const s = srcById(id); if (!s || !s.hasVideo) { stopEnc(id); continue; } }
      if (!ENC.has(id)) { start(id); continue; }
      const e = ENC.get(id), el = elOf(id);
      if (e.busy || !e.enc || e.enc.state !== 'configured' || e.err || !el) continue;
      // program: když je ve vysílání sám replay, nenahrávat (jinak by se replay nahrál do sebe)
      if (id === PROG && ST.play && ST.scene && S.programId === ST.scene.id) continue;
      if (el instanceof HTMLVideoElement) { if (el._vf != null && el._vf === e.lastVf) continue; e.lastVf = el._vf; }
      if (now - e.lastT < 1000 / e.fps - 2) continue;                   // nejvýš N snímků za sekundu
      if (e.enc.encodeQueueSize > 4) continue;                          // kodér nestíhá → snímek vynechat
      const [w, h] = dims(el); if (!w) continue;
      const k = Math.min(1, 1920 / w, 1920 / h);
      if (Math.abs((Math.round(w * k) & ~1) - e.w) > 2 || Math.abs((Math.round(h * k) & ~1) - e.h) > 2) { stopEnc(id); continue; }   // jiné rozlišení → znovu
      e.lastT = now;
      let f;
      try {
        if (e.cx) { e.cx.drawImage(el, 0, 0, e.w, e.h); f = new VideoFrame(e.cv, {timestamp:Math.round(now * 1000)}); }
        else f = new VideoFrame(el, {timestamp:Math.round(now * 1000)});
      } catch (er) { continue; }
      e.enc.encode(f, {keyFrame:e.n++ % e.fps === 0}); f.close();      // klíčový snímek každou sekundu → rychlé skoky
    }
    for (const id of [...ENC.keys()]) if (!want.includes(id)) stopEnc(id);
    if (ST.play) playTick(now);
  }

  /* ---------- zdroj a scéna Replay ---------- */
  function ensureSource() {
    let s = S.sources.find(x => x.type === 'replay');
    if (!s) { s = newSource('replay', '⏪ Replay'); S.sources.push(s); }
    if (!(s.el instanceof HTMLCanvasElement)) { s.el = document.createElement('canvas'); s.el.width = W; s.el.height = H; }
    s.hasVideo = true; s.missing = false; s.aspect = W / H; s.dirty = true;
    let sc = S.scenes.find(x => x.replay);
    if (!sc) { sc = {id:uid(), name:'⏪ Replay', layers:[], replay:true}; S.scenes.push(sc); }
    if (!sc.layers.some(l => l.sourceId === s.id)) { const l = newLayer(s); l.x = 0; l.y = 0; l.w = W; l.h = H; sc.layers.unshift(l); }
    ST.src = s; ST.scene = sc;
    return s;
  }

  /* ---------- přehrávání ---------- */
  // from/to = čas (performance.now) v ms; speed 0.25–1
  function play(id, from, to, speed, keepChain) {
    stopPlay(true); if (!keepChain) ST.chain = null;
    const e = ENC.get(id); if (!e || !e.chunks.length) { toast(L('Pro tenhle zdroj zatím nic nahraného není.')); return false; }
    let k = -1; for (let i = 0; i < e.chunks.length; i++) { if (e.chunks[i].ts > from) break; if (e.chunks[i].key) k = i; }
    if (k < 0) k = e.chunks.findIndex(c => c.key);
    if (k < 0) return false;
    const list = e.chunks.slice(k).filter(c => c.ts <= to + 50);
    ensureSource();
    const P = {cam:id, from:Math.max(from, list[0].ts), to:Math.min(to, list[list.length - 1].ts), speed, list, i:0, q:[], pt:0, last:ms(), done:false, a:null, b:null};
    P.dec = new VideoDecoder({output:f => { if (f.timestamp / 1000 < P.from - 1100) { f.close(); return; } P.q.push(f); }, error:er => { HLT.note('Replay: ' + er.message); }});
    P.dec.configure({codec:e.codec, codedWidth:e.w, codedHeight:e.h, optimizeForLatency:true});
    ST.play = P; feed(P);
    if (LAY.isShown('replay')) renderTab();
    return true;
  }
  function feed(P) {   // dekódovat dopředu jen pár snímků (šetří paměť)
    while (P.i < P.list.length && P.dec.decodeQueueSize < 4 && P.q.length < 8) { const c = P.list[P.i++]; try { P.dec.decode(c.chunk); } catch (er) { P.i = P.list.length; } }
    if (P.i >= P.list.length && !P.flushed) { P.flushed = true; P.dec.flush().catch(() => {}); }
  }
  function playTick(now) {
    const P = ST.play, dt = Math.min(100, now - P.last); P.last = now;
    if (!P.paused) P.pt += dt * P.speed;
    const t = P.from + P.pt;
    // a = poslední snímek ≤ t, b = další snímek (na prolínání)
    while (P.q.length && P.q[0].timestamp / 1000 <= t) { if (P.a) P.a.close(); P.a = P.q.shift(); }
    if (P.b && P.b !== P.q[0]) P.b = null;
    if (P.q.length) P.b = P.q[0];
    if (P.a) {
      let mix = 0;
      if (C().blend && P.speed < 1 && P.b) { const ta = P.a.timestamp / 1000, tb = P.b.timestamp / 1000; if (tb > ta) mix = Math.min(1, Math.max(0, (t - ta) / (tb - ta))); }
      draw(P.a, mix > 0.02 ? P.b : null, mix);
    }
    feed(P);
    if (t >= P.to && !P.done) {
      P.done = true;
      if (ST.chain && ST.chain.length) { const n = ST.chain.shift(), f0 = P.from0 ?? P.from; setTimeout(() => { if (play(n, f0, P.to, P.speed, true)) ST.play.from0 = f0; }, 0); return; }
      if (C().back && ST.prevProg && S.programId === ST.scene.id && sceneById(ST.prevProg)) setTimeout(() => { if (S.programId === ST.scene.id) leave(); }, 400);
    }
    if (P.done && t > P.to + 2000) stopPlay(true);
  }
  function draw(f, f2, mix) {
    const s = ST.src || ensureSource(), x = s.el.getContext('2d'), fw = f.displayWidth, fh = f.displayHeight, k = Math.min(W / fw, H / fh);
    const dx = (W - fw * k) / 2, dy = (H - fh * k) / 2;
    x.globalAlpha = 1; x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    x.drawImage(f, dx, dy, fw * k, fh * k);
    if (f2) { x.globalAlpha = mix; x.drawImage(f2, dx, dy, fw * k, fh * k); x.globalAlpha = 1; }
    if (C().bug) {   // značka „REPLAY“ v rohu
      const pad = H / 40, fs = Math.round(H / 26), sp = ST.play ? ST.play.speed : 1, txt = `⏪ REPLAY${sp < 1 ? ' · ' + Math.round(sp * 100) + ' %' : ''}`;
      x.font = `800 ${fs}px Inter, system-ui`; const tw = x.measureText(txt).width;
      x.fillStyle = 'rgba(220,38,38,.92)'; x.fillRect(W - tw - pad * 3, pad, tw + pad * 2, fs * 1.6);
      x.fillStyle = '#fff'; x.fillText(txt, W - tw - pad * 2, pad + fs * 1.15);
    }
    s.dirty = true;
  }
  function stopPlay(quiet) {
    const P = ST.play; if (!P) return; ST.play = null;
    P.q.forEach(f => f.close()); if (P.a) P.a.close(); try { P.dec.close(); } catch (e) {}
    if (!quiet && LAY.isShown('replay')) renderTab();
  }

  /* ---------- do vysílání a zpět (přes zvolený přechod / stinger) ---------- */
  function withTrans(fn) {
    const tr = C().tr; if (!tr) return fn('cut');
    const prev = S.trs && S.trs.cur; TR.select(tr); fn('auto'); if (prev) setTimeout(() => TR.select(prev), 50);
  }
  function air() {
    ensureSource();
    if (S.programId !== ST.scene.id) { ST.prevProg = S.programId; S.previewId = ST.scene.id; withTrans(m => take(m)); }
    renderScenes(); if (LAY.isShown('replay')) renderTab();
  }
  function leave() { withTrans(m => takeScene(ST.prevProg, m === 'cut' ? 'fade' : m)); }

  /* ---------- tlačítka ---------- */
  function go(id, secs, speed) {
    const c = C(), cam = id || c.cam || ids()[0]; if (!cam) { toast(L('Nejdřív v záložce Replay zapni nahrávání aspoň jednoho zdroje.')); return; }
    const now = ms();
    // když jsou nastavené body IN/OUT, pustí se ty
    const from = ST.inT != null ? ST.inT : now - (secs || c.len) * 1000, to = ST.outT != null ? ST.outT : now;
    if (!play(cam, from, to, speed || c.speed)) return;
    air();
  }
  function goAll() {   // všechny úhly po sobě, každý stejný okamžik
    const c = C(), all = ids().filter(id => ENC.get(id) && ENC.get(id).chunks.length); if (!all.length) return go();
    const now = ms(), from = ST.inT != null ? ST.inT : now - c.len * 1000, to = ST.outT != null ? ST.outT : now;
    const first = all.includes(c.cam) ? c.cam : all[0];
    if (!play(first, from, to, c.speed)) return;
    ST.chain = all.filter(x => x !== first); air();
  }
  function angle(id) {   // přepnout úhel za běhu – pokračuje ve stejném okamžiku
    const P = ST.play, c = C();
    if (!id) { const l = ids(); id = l[(l.indexOf(P ? P.cam : c.cam) + 1) % l.length]; }
    if (!id) return; c.cam = id;
    if (P) { const t = P.from + P.pt, sp = P.speed, to = P.to; play(id, t, to, sp, true); }
    if (LAY.isShown('replay')) renderTab();
  }
  function speed(v) { C().speed = v; if (ST.play) ST.play.speed = v; if (LAY.isShown('replay')) renderTab(); save(); }
  function mark() {
    const c = C(), cam = c.cam || ids()[0]; if (!cam) return;
    ST.marks.unshift({t:ms(), cam, at:new Date()}); ST.marks.length = Math.min(ST.marks.length, 20);
    toast('★ ' + L('Značka uložena')); if (LAY.isShown('replay')) renderTab();
  }
  function setIn(t) { ST.inT = t ?? (ST.cueT ?? ms()); if (ST.outT != null && ST.outT <= ST.inT) ST.outT = null; if (LAY.isShown('replay')) renderTab(); }
  function setOut(t) { ST.outT = t ?? (ST.cueT ?? ms()); if (ST.inT != null && ST.inT >= ST.outT) ST.inT = null; if (LAY.isShown('replay')) renderTab(); }
  function clearIO() { ST.inT = ST.outT = null; if (LAY.isShown('replay')) renderTab(); }

  /* ukázat jeden snímek z času t (posuvník) – do zdroje Replay, ne do vysílání */
  async function cue(t) {
    const c = C(), id = c.cam || ids()[0], e = ENC.get(id); if (!e || !e.chunks.length) return;
    if (ST.play && S.programId === (ST.scene && ST.scene.id)) return;   // replay je ve vysílání → neměnit obraz
    ST.cueT = t; if (ST.cue) return;                                    // dekódování běží, vezme si nejnovější t
    ST.cue = true;
    try {
      while (true) {
        const want = ST.cueT;
        let k = -1; for (let i = 0; i < e.chunks.length; i++) { if (e.chunks[i].ts > want) break; if (e.chunks[i].key) k = i; }
        if (k < 0) break;
        let best = null;
        const dec = new VideoDecoder({output:f => { if (f.timestamp / 1000 <= want + 1) { if (best) best.close(); best = f; } else f.close(); }, error:() => {}});
        dec.configure({codec:e.codec, codedWidth:e.w, codedHeight:e.h, optimizeForLatency:true});
        for (let i = k; i < e.chunks.length && e.chunks[i].ts <= want + 1; i++) dec.decode(e.chunks[i].chunk);
        await dec.flush().catch(() => {}); dec.close();
        if (best) { ensureSource(); draw(best, null, 0); best.close(); }
        if (ST.cueT === want) break;
      }
    } finally { ST.cue = false; }
  }

  /* ---------- akce pro Ovládání / makra / MIDI ---------- */
  function ctl(add) {
    add('replay.all', '⏪ ' + L('Replay – všechny úhly po sobě'), () => goAll(), 'Replay');
    add('replay.angle', '🔄 ' + L('Replay – další úhel (za běhu)'), () => angle(), 'Replay');
    add('replay.in', '[ ' + L('Replay – bod IN (teď / posuvník)'), () => setIn(), 'Replay');
    add('replay.out', '] ' + L('Replay – bod OUT (teď / posuvník)'), () => setOut(), 'Replay');
    add('replay.clear', L('Replay – smazat IN/OUT'), () => clearIO(), 'Replay');
    add('replay.stop', '■ ' + L('Replay – zastavit a vrátit se'), () => { stopPlay(); if (ST.prevProg && ST.scene && S.programId === ST.scene.id) leave(); }, 'Replay');
    add('replay.pause', '⏯ ' + L('Replay – pauza / pokračovat'), () => { if (ST.play) ST.play.paused = !ST.play.paused; }, 'Replay');
    for (const v of [1, 0.75, 0.5, 0.25]) add('replay.speed.' + v * 100, `⏩ ${L('Replay – rychlost')} ${v * 100} %`, () => speed(v), 'Replay');
    add('replay.jog', '🎚 ' + L('Replay – posuvník (MIDI fader)'), v => { const now = ms(); cue(now - (1 - v) * C().secs * 1000); }, 'Replay', true);
  }

  /* ---------- záložka ---------- */
  function renderTab() {
    const box = $('#tab-replay'); if (!box) return; const c = C();
    const srcs = S.sources.filter(s => ELIG.has(s.type));
    const all = ids(); if (!c.cam || !all.includes(c.cam)) c.cam = all[0] || '';
    const opt = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${n}</option>`).join('');
    const stat = id => { const e = ENC.get(id); return e && e.err ? '⚠ ' + esc(e.err) : '● ' + (e && e.chunks.length ? Math.round((ms() - e.chunks[0].ts) / 1000) : 0) + ' s'; };
    const now = ms(), span = c.secs * 1000, pos = t => t == null ? null : Math.max(0, Math.min(100, 100 - (now - t) / span * 100));
    const P = ST.play;
    box.innerHTML = `<div class="rpgrid">
      <div class="sec"><h4>⏺ ${L('Co se nahrává do paměti')}</h4>
        <label class="chk"><input type="checkbox" data-rp="prog" ${c.prog ? 'checked' : ''}> 🎬 ${L('Program (to, co jde do vysílání)')} <span class="dim" data-rpst="${PROG}">${c.prog ? stat(PROG) : ''}</span></label>
        ${srcs.map(s => `<label class="chk"><input type="checkbox" data-rpcam="${s.id}" ${c.cams.includes(s.id) ? 'checked' : ''}> ${icon(s)} ${esc(s.name)} <span class="dim" data-rpst="${s.id}">${c.cams.includes(s.id) ? stat(s.id) : ''}</span></label>`).join('') || `<p class="dim">${L('Přidej nejdřív kameru.')}</p>`}
        <div class="grid2"><label>${L('Pamatovat posledních')}<select data-rp="secs">${opt({15:'15 s', 30:'30 s', 60:'60 s', 120:'2 min'}, c.secs)}</select></label>
          <label>${L('Snímků za sekundu')}<select data-rp="fps">${opt({25:'25', 30:'30', 50:'50', 60:'60 ' + L('(plynulejší zpomalení)')}, c.fps)}</select></label></div>
        <p class="dim">${L('Kóduje se na grafice do paměti, asi 60 MB na zdroj a minutu. Víc zdrojů = víc práce pro grafiku – u slabších počítačů stačí 2–3.')}</p></div>
      <div class="sec"><h4>▶ ${L('Přehrát')}</h4>
        <div class="rpang">${all.map(id => `<button data-rpang="${id}" class="${id === (P ? P.cam : c.cam) ? 'on' : ''}">${esc(name(id))}</button>`).join('') || '<span class="dim">—</span>'}</div>
        <div class="rpspd">${[1, 0.75, 0.5, 0.25].map(v => `<button data-rpspd="${v}" class="${+c.speed === v ? 'on' : ''}">${v * 100} %</button>`).join('')}</div>
        <label>${L('Délka (bez IN/OUT)')}<select data-rp="len">${opt({3:'3 s', 5:'5 s', 8:'8 s', 12:'12 s', 20:'20 s'}, c.len)}</select></label>
        <div class="btns"><button class="big live-btn" data-rpa="go">⏪ ${L('REPLAY do vysílání')}</button><button data-rpa="all" title="${L('Stejný moment ze všech úhlů po sobě')}">⏪ ${L('Všechny úhly')}</button>
          ${P ? `<button data-rpa="pause">${P.paused ? '▶' : '⏸'}</button><button data-rpa="stop">■ ${L('Zastavit')}</button>` : ''}<button data-rpa="mark">★ ${L('Značka')}</button></div>
        <label>${L('Přechod do replaye a zpět')}<select data-rp="tr"><option value="">${L('Střih (bez přechodu)')}</option>${(S.trs ? S.trs.list : []).map(t => `<option value="${t.id}" ${t.id === c.tr ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="chk"><input type="checkbox" data-rp="back" ${c.back ? 'checked' : ''}> ${L('Po skončení se vrátit na předchozí scénu')}</label>
        <label class="chk"><input type="checkbox" data-rp="blend" ${c.blend ? 'checked' : ''}> ${L('Plynulé zpomalení (prolínání snímků)')}</label>
        <label class="chk"><input type="checkbox" data-rp="bug" ${c.bug ? 'checked' : ''}> ${L('Značka „REPLAY“ v rohu obrazu')}</label></div>
      <div class="sec"><h4>🎯 ${L('Najít moment: IN / OUT')}</h4>
        <div class="rpbar"><input type="range" id="rpJog" min="0" max="1000" value="${ST.cueT != null ? Math.round(pos(ST.cueT) * 10) : 1000}">
          ${ST.inT != null ? `<i class="rpin" style="left:${pos(ST.inT)}%"></i>` : ''}${ST.outT != null ? `<i class="rpout" style="left:${pos(ST.outT)}%"></i>` : ''}</div>
        <div class="row dim"><span>−${c.secs} s</span><span class="sp" style="flex:1"></span><span id="rpJogT">${ST.cueT != null ? '−' + ((now - ST.cueT) / 1000).toFixed(1) + ' s' : L('teď')}</span></div>
        <div class="btns"><button data-rpa="in">[ IN</button><button data-rpa="out">OUT ]</button><button data-rpa="clear">${L('Smazat')}</button>
          ${ST.inT != null || ST.outT != null ? `<span class="dim mono">${ST.inT != null ? 'IN −' + ((now - ST.inT) / 1000).toFixed(1) + ' s' : ''} ${ST.outT != null ? 'OUT −' + ((now - ST.outT) / 1000).toFixed(1) + ' s' : ''}</span>` : ''}</div>
        <p class="dim">${L('Posuvníkem najdi moment – snímek uvidíš ve zdroji ⏪ Replay (dej scénu Replay do náhledu). Pak IN, posuň, OUT a REPLAY pustí přesně tenhle úsek. Posuvník jde ovládat i MIDI faderem.')}</p></div>
      <div class="sec"><h4>★ ${L('Značky')}</h4>${ST.marks.length ? ST.marks.map((m, i) => { const age = Math.round((ms() - m.t) / 1000), ok = age < C().secs;
          return `<div class="rpmark"><span>${m.at.toLocaleTimeString().slice(0, 8)} · ${esc(name(m.cam))} · ${L('před')} ${age} s</span>${ok ? `<button data-rpm="${i}">▶ ${L('Přehrát')}</button><button data-rpmi="${i}">IN/OUT</button>` : `<span class="dim">${L('už není v paměti')}</span>`}</div>`; }).join('') : `<p class="dim">${L('Během akce zmáčkni ★ a moment si přehraješ později (kolem značky −4 s až +2 s).')}</p>`}</div></div>`;
  }
  function init() {
    const box = $('#tab-replay');
    box.addEventListener('change', e => {
      const t = e.target, c = C();
      if (t.id === 'rpJog') return;
      if (t.dataset.rpcam) { const id = t.dataset.rpcam; c.cams = t.checked ? [...new Set([...c.cams, id])] : c.cams.filter(x => x !== id); if (!t.checked) stopEnc(id); }
      const k = t.dataset.rp; if (k) c[k] = t.type === 'checkbox' ? t.checked : (k === 'cam' || k === 'tr') ? t.value : +t.value;
      if (k === 'fps') for (const id of [...ENC.keys()]) stopEnc(id);   // nové fps → kodéry znovu
      if (k === 'prog' && !t.checked) stopEnc(PROG);
      save(); renderTab();
    });
    box.addEventListener('input', e => {
      if (e.target.id !== 'rpJog') return;
      const v = +e.target.value / 1000, t = ms() - (1 - v) * C().secs * 1000;
      const lbl = $('#rpJogT'); if (lbl) lbl.textContent = v >= 0.999 ? L('teď') : '−' + ((1 - v) * C().secs).toFixed(1) + ' s';
      cue(t);
    });
    box.addEventListener('click', e => {
      const a = e.target.closest('[data-rpa],[data-rpm],[data-rpmi],[data-rpang],[data-rpspd]'); if (!a) return;
      const x = a.dataset.rpa;
      if (x === 'go') go(); if (x === 'all') goAll(); if (x === 'mark') mark();
      if (x === 'stop') { stopPlay(); if (ST.prevProg && ST.scene && S.programId === ST.scene.id) leave(); }
      if (x === 'pause' && ST.play) { ST.play.paused = !ST.play.paused; renderTab(); }
      if (x === 'in') setIn(); if (x === 'out') setOut(); if (x === 'clear') clearIO();
      if (a.dataset.rpang) angle(a.dataset.rpang);
      if (a.dataset.rpspd) speed(+a.dataset.rpspd);
      if (a.dataset.rpm) { const m = ST.marks[+a.dataset.rpm]; if (m && play(m.cam, m.t - 4000, m.t + 2000, C().speed)) air(); }
      if (a.dataset.rpmi) { const m = ST.marks[+a.dataset.rpmi]; if (m) { ST.inT = m.t - 4000; ST.outT = m.t + 2000; C().cam = m.cam; renderTab(); } }
    });
    setInterval(() => {
      if (!LAY.isShown('replay')) return;
      document.querySelectorAll('#tab-replay [data-rpst]').forEach(sp => { const id = sp.dataset.rpst; if (!ids().includes(id)) return; const e = ENC.get(id); sp.textContent = e && e.err ? '⚠ ' + e.err : '● ' + (e && e.chunks.length ? Math.round((ms() - e.chunks[0].ts) / 1000) : 0) + ' s'; });
    }, 1000);
  }
  const load = d => { S.replay = Object.assign({}, DEF, d || {}); ST.inT = ST.outT = ST.cueT = null; };
  const save_ = () => C();
  return {init, tick, go, goAll, angle, speed, mark, play, stopPlay, setIn, setOut, cue, ctl, renderTab, load, save:save_,
    status:() => ({cams:[...ENC].map(([id, e]) => ({id, secs:e.chunks.length ? Math.round((ms() - e.chunks[0].ts) / 1000) : 0, err:e.err, codec:e.codec})), playing:!!ST.play})};
})();
