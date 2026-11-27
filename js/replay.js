'use strict';
/* ================= ⏪ REPLAY: opakované záběry a zpomalovačky =================
   Vybrané kamery se průběžně kódují (na grafice, H.264) do paměti – posledních N sekund.
   Jedním tlačítkem: posledních X s z vybrané kamery, rychlostí 100 / 75 / 50 / 25 %, rovnou do vysílání.
   Po skončení se režie sama vrátí na předchozí scénu. Značky (★) = důležité momenty na později. */
const RPL = (() => {
  const ENC = new Map();   // id kamery → {enc, chunks:[{ts,key,chunk}], w, h, codec, n}
  const ST = {play:null, marks:[], src:null, scene:null, prevProg:null};
  const C = () => S.replay || (S.replay = {cams:[], secs:30, len:8, speed:0.5, cam:'', back:true, bug:true});
  const ms = () => performance.now();

  /* ---------- nahrávání do paměti ---------- */
  async function pickCodec(w, h) {
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'vp8']) {
      const c = {codec, width:w, height:h, bitrate:Math.round(w * h * 30 * 0.12), framerate:30, latencyMode:'realtime', hardwareAcceleration:'prefer-hardware'};
      if (codec.startsWith('avc')) c.avc = {format:'annexb'};
      try { if ((await VideoEncoder.isConfigSupported(c)).supported) return c; } catch (e) {}
      try { delete c.hardwareAcceleration; if ((await VideoEncoder.isConfigSupported(c)).supported) return c; } catch (e) {}
    }
    return null;
  }
  async function startCam(s) {
    if (ENC.has(s.id) || !window.VideoEncoder) return;
    const el = s.el; if (!(el instanceof HTMLVideoElement) || !el.videoWidth) return;
    const w = el.videoWidth & ~1, h = el.videoHeight & ~1;
    const e = {chunks:[], w, h, n:0, busy:true}; ENC.set(s.id, e);
    const cfg = await pickCodec(w, h);
    if (!cfg) { e.err = L('kodér není k dispozici'); return; }
    e.codec = cfg.codec;
    e.enc = new VideoEncoder({output:(chunk) => { e.chunks.push({ts:chunk.timestamp / 1000, key:chunk.type === 'key', chunk}); trim(e); }, error:er => { e.err = er.message; }});
    e.enc.configure(cfg); e.busy = false;
  }
  function stopCam(id) { const e = ENC.get(id); if (!e) return; try { e.enc && e.enc.close(); } catch (er) {} ENC.delete(id); }
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
    for (const id of C().cams) {
      const s = srcById(id); if (!s || !s.hasVideo) { stopCam(id); continue; }
      if (!ENC.has(id)) { startCam(s); continue; }
      const e = ENC.get(id), el = s.el;
      if (e.busy || !e.enc || e.enc.state !== 'configured' || e.err) continue;
      if (el._vf != null && el._vf === e.lastVf) continue;            // jen nový snímek z kamery
      if (e.enc.encodeQueueSize > 4) continue;                         // kodér nestíhá → snímek vynechat
      e.lastVf = el._vf;
      let f; try { f = new VideoFrame(el, {timestamp:Math.round(now * 1000)}); } catch (er) { continue; }
      if (Math.abs(f.displayWidth - e.w) > 2 || Math.abs(f.displayHeight - e.h) > 2) { f.close(); stopCam(id); continue; }   // jiné rozlišení → spustit znovu
      e.enc.encode(f, {keyFrame:e.n++ % 30 === 0}); f.close();
    }
    for (const id of [...ENC.keys()]) if (!C().cams.includes(id)) stopCam(id);
    if (ST.play) playTick(now);
  }

  /* ---------- přehrávání ---------- */
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
  function blank(text) { const s = ensureSource(), x = s.el.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); if (text) { x.fillStyle = '#9ca3af'; x.font = `600 ${Math.round(H / 20)}px system-ui`; x.textAlign = 'center'; x.fillText(text, W / 2, H / 2); x.textAlign = 'left'; } s.dirty = true; }
  // from/to = čas (performance.now) v ms; speed 0.25–1
  function play(camId, from, to, speed) {
    stopPlay();
    const e = ENC.get(camId); if (!e || !e.chunks.length) { toast(L('Pro tuhle kameru zatím nic nahraného není.')); return false; }
    let k = -1; for (let i = 0; i < e.chunks.length; i++) { if (e.chunks[i].ts > from) break; if (e.chunks[i].key) k = i; }
    if (k < 0) k = e.chunks.findIndex(c => c.key);
    if (k < 0) return false;
    const list = e.chunks.slice(k).filter(c => c.ts <= to + 50);
    const src = ensureSource();
    const P = {cam:camId, from:Math.max(from, list[0].ts), to:Math.min(to, list[list.length - 1].ts), speed, list, i:0, q:[], pt:0, last:ms(), done:false};
    P.dec = new VideoDecoder({output:f => { if (f.timestamp / 1000 < P.from - 5) { f.close(); return; } P.q.push(f); }, error:er => { HLT.note('Replay: ' + er.message); }});
    P.dec.configure({codec:e.codec, codedWidth:e.w, codedHeight:e.h, optimizeForLatency:true});
    ST.play = P; feed(P);
    return true;
  }
  function feed(P) {   // dekódovat dopředu jen pár snímků (šetří paměť)
    while (P.i < P.list.length && P.dec.decodeQueueSize < 4 && P.q.length < 8) { const c = P.list[P.i++]; try { P.dec.decode(c.chunk); } catch (er) { P.i = P.list.length; } }
    if (P.i >= P.list.length && !P.flushed) { P.flushed = true; P.dec.flush().catch(() => {}); }
  }
  function playTick(now) {
    const P = ST.play, dt = Math.min(100, now - P.last); P.last = now;
    P.pt += dt * P.speed; const t = P.from + P.pt;
    let f = null;
    while (P.q.length && P.q[0].timestamp / 1000 <= t) { if (f) f.close(); f = P.q.shift(); }
    if (f) { draw(f); f.close(); }
    feed(P);
    if (t >= P.to && !P.done) {
      P.done = true;
      if (C().back && ST.prevProg && S.programId === ST.scene.id && sceneById(ST.prevProg)) setTimeout(() => { if (S.programId === ST.scene.id) takeScene(ST.prevProg, 'fade'); }, 400);
    }
    if (P.done && t > P.to + 2000) stopPlay(true);
  }
  function draw(f) {
    const s = ST.src, x = s.el.getContext('2d'), fw = f.displayWidth, fh = f.displayHeight, k = Math.min(W / fw, H / fh);
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    x.drawImage(f, (W - fw * k) / 2, (H - fh * k) / 2, fw * k, fh * k);
    if (C().bug) {   // značka „REPLAY“ v rohu
      const pad = H / 40, fs = Math.round(H / 26), txt = `⏪ REPLAY${ST.play && ST.play.speed < 1 ? ' · ' + Math.round(ST.play.speed * 100) + ' %' : ''}`;
      x.font = `800 ${fs}px system-ui`; const tw = x.measureText(txt).width;
      x.fillStyle = 'rgba(220,38,38,.92)'; x.fillRect(W - tw - pad * 3, pad, tw + pad * 2, fs * 1.6);
      x.fillStyle = '#fff'; x.fillText(txt, W - tw - pad * 2, pad + fs * 1.15);
    }
    s.dirty = true;
  }
  function stopPlay(keep) {
    const P = ST.play; if (!P) return; ST.play = null;
    P.q.forEach(f => f.close()); try { P.dec.close(); } catch (e) {}
    if (S.tabCur === 'replay') renderTab();
  }
  // posledních N sekund z vybrané kamery → rovnou do vysílání
  function go(camId, secs, speed) {
    const c = C(), cam = camId || c.cam || c.cams[0]; if (!cam) { toast(L('Nejdřív v záložce Replay zapni nahrávání aspoň jedné kamery.')); return; }
    const now = ms(), from = now - (secs || c.len) * 1000;
    if (!play(cam, from, now, speed || c.speed)) return;
    air();
  }
  function air() {
    ensureSource();
    if (S.programId !== ST.scene.id) { ST.prevProg = S.programId; S.previewId = ST.scene.id; take('cut'); }
    renderScenes(); if (S.tabCur === 'replay') renderTab();
  }
  function mark() {
    const c = C(), cam = c.cam || c.cams[0]; if (!cam) return;
    ST.marks.unshift({t:ms(), cam, at:new Date()}); ST.marks.length = Math.min(ST.marks.length, 20);
    toast('★ ' + L('Značka uložena')); if (S.tabCur === 'replay') renderTab();
  }

  /* ---------- záložka ---------- */
  function renderTab() {
    const box = $('#tab-replay'); if (!box) return; const c = C();
    const cams = S.sources.filter(s => s.type === 'camera' || s.type === 'guest' || s.type === 'screen');
    if (!c.cam || !c.cams.includes(c.cam)) c.cam = c.cams[0] || '';
    const opt = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${n}</option>`).join('');
    box.innerHTML = `<div class="rpgrid">
      <div class="sec"><h4>⏪ ${L('Replay – nahrávané kamery')}</h4>
        ${cams.length ? cams.map(s => { const e = ENC.get(s.id), sec = e && e.chunks.length ? Math.round((ms() - e.chunks[0].ts) / 1000) : 0;
          return `<label class="chk"><input type="checkbox" data-rpcam="${s.id}" ${c.cams.includes(s.id) ? 'checked' : ''}> ${esc(s.name)} <span class="dim">${c.cams.includes(s.id) ? (e && e.err ? '⚠ ' + esc(e.err) : '● ' + sec + ' s') : ''}</span></label>`; }).join('') : `<p class="dim">${L('Přidej nejdřív kameru.')}</p>`}
        <label>${L('Pamatovat posledních')}<select data-rp="secs">${opt({15:'15 s', 30:'30 s', 60:'60 s', 120:'2 min'}, c.secs)}</select></label>
        <p class="dim">${L('Nahrává se na grafice do paměti (asi 60 MB na kameru a minutu). Na disk se nic neukládá.')}</p></div>
      <div class="sec"><h4>▶ ${L('Přehrát')}</h4>
        <label>${L('Kamera')}<select data-rp="cam">${c.cams.map(id => `<option value="${id}" ${id === c.cam ? 'selected' : ''}>${esc((srcById(id) || {}).name || '?')}</option>`).join('') || '<option value="">—</option>'}</select></label>
        <label>${L('Délka')}<select data-rp="len">${opt({3:'3 s', 5:'5 s', 8:'8 s', 12:'12 s', 20:'20 s'}, c.len)}</select></label>
        <label>${L('Rychlost')}<select data-rp="speed">${opt({1:'100 %', 0.75:'75 %', 0.5:'50 % (zpomaleně)', 0.25:'25 % (super zpomaleně)'}, c.speed)}</select></label>
        <div class="btns"><button class="big red" data-rpa="go">⏪ ${L('REPLAY do vysílání')}</button><button data-rpa="mark">★ ${L('Značka')}</button>${ST.play ? `<button data-rpa="stop">■ ${L('Zastavit')}</button>` : ''}</div>
        <label class="chk"><input type="checkbox" data-rp="back" ${c.back ? 'checked' : ''}> ${L('Po skončení se vrátit na předchozí scénu')}</label>
        <label class="chk"><input type="checkbox" data-rp="bug" ${c.bug ? 'checked' : ''}> ${L('Značka „REPLAY“ v rohu obrazu')}</label>
        <p class="dim">${L('Klávesy přiřadíš v záložce Ovládání (Replay do vysílání, Značka). Hodí se na Stream Deck.')}</p></div>
      <div class="sec"><h4>★ ${L('Značky')}</h4>${ST.marks.length ? ST.marks.map((m, i) => { const age = Math.round((ms() - m.t) / 1000), ok = age < C().secs;
          return `<div class="rpmark"><span>${m.at.toLocaleTimeString().slice(0, 8)} · ${esc((srcById(m.cam) || {}).name || '?')} · ${L('před')} ${age} s</span>${ok ? `<button data-rpm="${i}">▶ ${L('Přehrát')}</button>` : `<span class="dim">${L('už není v paměti')}</span>`}</div>`; }).join('') : `<p class="dim">${L('Během akce zmáčkni ★ a moment si přehraješ později (kolem značky −4 s až +2 s).')}</p>`}</div></div>`;
  }
  function init() {
    const box = $('#tab-replay');
    box.addEventListener('change', e => {
      const t = e.target, c = C();
      if (t.dataset.rpcam) { const id = t.dataset.rpcam; c.cams = t.checked ? [...new Set([...c.cams, id])] : c.cams.filter(x => x !== id); if (!t.checked) stopCam(id); }
      const k = t.dataset.rp; if (k) c[k] = t.type === 'checkbox' ? t.checked : k === 'cam' ? t.value : +t.value;
      save(); renderTab();
    });
    box.addEventListener('click', e => {
      const a = e.target.closest('[data-rpa],[data-rpm]'); if (!a) return;
      if (a.dataset.rpa === 'go') go(); if (a.dataset.rpa === 'mark') mark(); if (a.dataset.rpa === 'stop') stopPlay();
      if (a.dataset.rpm) { const m = ST.marks[+a.dataset.rpm]; if (m && play(m.cam, m.t - 4000, m.t + 2000, C().speed)) air(); }
    });
    setInterval(() => { if (S.tabCur === 'replay' && !$('#tab-replay select:focus')) { const st = $('#tab-replay'); if (st && C().cams.length) st.querySelectorAll('[data-rpcam]').forEach(i => { const e = ENC.get(i.dataset.rpcam), sp = i.parentElement.querySelector('span'); if (sp && C().cams.includes(i.dataset.rpcam)) sp.textContent = e && e.err ? '⚠ ' + e.err : '● ' + (e && e.chunks.length ? Math.round((ms() - e.chunks[0].ts) / 1000) : 0) + ' s'; }); } }, 1000);
  }
  const load = d => { S.replay = Object.assign({cams:[], secs:30, len:8, speed:0.5, cam:'', back:true, bug:true}, d || {}); };
  const save_ = () => C();
  return {init, tick, go, mark, play, stopPlay, renderTab, load, save:save_, status:() => ({cams:[...ENC].map(([id, e]) => ({id, secs:e.chunks.length ? Math.round((ms() - e.chunks[0].ts) / 1000) : 0, err:e.err, codec:e.codec})), playing:!!ST.play})};
})();
