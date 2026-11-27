'use strict';
/* ================= DÁLKOVĚ: ovládání z iPadu / mobilu / druhého počítače + hosté přes odkaz =================
   Režie posílá svůj stav (scény, grafiky, zvuk, scénář, náhledy) vestavěnému serveru, ten ho rozešle ovladačům v místní síti.
   Host otevře odkaz v mobilu nebo počítači → WebRTC spojení přímo s režií (obraz + zvuk hosta sem,
   zpátky k hostovi jde program a zvuk bez jeho vlastního hlasu = mix-minus, aby neslyšel ozvěnu). */
const REM = (() => {
  const ST = {prompters:0, prJson:'', prT:0, prBusy:false, es:null, info:null, remotes:0, push:null, busy:false, lastJson:'', lastPost:0, thumbT:0, thumbs:null, err:'', starting:false};
  const G = new Map();   // id hosta → {pc, s, mm, mmDest, conn:Set, air, pv, aEl}
  const base = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? location.origin : null;
  const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); };
  const C = () => S.rem;

  function load(d) { S.rem = {on:!!(d && d.on), pin:(d && d.pin) || rnd(10), gpin:(d && d.gpin) || rnd(10), apin:(d && d.apin) || rnd(10), gkey:(d && d.gkey) || rnd(10), pkey:(d && d.pkey) || rnd(10), ckey:(d && d.ckey) || rnd(10), online:!!(d && d.online), turn:Object.assign({url:'', user:'', pass:''}, d && d.turn), cft:Object.assign({id:'', token:''}, d && d.cft)}; }
  const save_ = () => ({on:C().on, pin:C().pin, gpin:C().gpin, apin:C().apin, gkey:C().gkey, pkey:C().pkey, ckey:C().ckey, online:C().online, turn:C().turn, cft:C().cft});
  // STUN najde veřejnou adresu (stačí většinou); TURN přeposílá obraz, když to přísná síť (škola, firma) jinak nepustí
  function iceServers() {
    const l = [{urls:['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302']}], t = C().turn;
    if (t && t.url) l.push({urls:t.url.split(/[\s,]+/).filter(Boolean), username:t.user || undefined, credential:t.pass || undefined});
    return l;
  }
  const host = () => ST.info && ST.info.on ? `${ST.info.https ? 'https' : 'http'}://${ST.info.ips[0] || 'IP-ADRESA'}:${ST.info.port}` : '';
  const remoteUrl = () => host() + '/remote?k=' + (ST.role === 'gfx' ? C().gpin : ST.role === 'aud' ? C().apin : C().pin) + (I18N.lang === 'en' ? '&lang=en' : '');
  const prompterUrl = () => host() + '/prompter?k=' + C().pkey + (I18N.lang === 'en' ? '&lang=en' : '');
  const onlineUrl = () => ST.info && ST.info.tunnel && ST.info.tunnel.url ? ST.info.tunnel.url + '/guest?k=' + C().gkey + (I18N.lang === 'en' ? '&lang=en' : '') : '';
  const crewUrl = () => (C().online && onlineUrl() ? ST.info.tunnel.url : host()) + '/crew?k=' + C().ckey + (I18N.lang === 'en' ? '&lang=en' : '');
  const guestUrl = () => host() + '/guest?k=' + C().gkey + (I18N.lang === 'en' ? '&lang=en' : '');

  /* ---------- zapnutí / vypnutí ---------- */
  async function enable() {
    const b = base(); if (!b) { ST.err = L('Funguje jen v desktopové aplikaci nebo přes node server.js (http://localhost:8080).'); renderTab(); return; }
    ST.starting = true; ST.err = ''; renderTab();
    try {
      const r = await fetch(b + '/lan', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({on:true, pin:C().pin, gpin:C().gpin, apin:C().apin, gkey:C().gkey, pkey:C().pkey, ckey:C().ckey, ice:iceServers(), cft:C().cft})});
      if (!r.ok) throw new Error(await r.text());
      ST.info = await r.json(); C().on = true; save();
      connectEvents(); startPush(); iceCheck().then(() => { if (LAY.isShown('remote')) renderTab(); });
      if (C().online && (!ST.info.tunnel || ST.info.tunnel.status === 'off')) setOnline(true);
    } catch (e) { ST.err = L('Nepodařilo se zapnout:') + ' ' + e.message; C().on = false; }
    ST.starting = false; renderTab();
  }
  async function setOnline(on) {
    C().online = on; save();
    try { const r = await fetch(base() + '/lan/tunnel', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({on})}); if (!r.ok) throw new Error(await r.text()); ST.info = await r.json(); }
    catch (e) { ST.info.tunnel = {status:'off', err:e.message}; C().online = false; }
    renderTab();
  }
  async function saveTurn(t, cft) {
    C().turn = t; if (cft) C().cft = cft; save();
    if (C().on) try { await fetch(base() + '/lan', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({on:true, pin:C().pin, gpin:C().gpin, apin:C().apin, gkey:C().gkey, pkey:C().pkey, ckey:C().ckey, ice:iceServers(), cft:C().cft})}); } catch (e) {}
    const r = await iceCheck(); toast(r.err ? '⚠ ' + r.err : r.turn ? L('TURN server funguje') : L('TURN server uložen')); renderTab();
  }
  // seznam STUN/TURN serverů ze serveru aplikace (včetně dočasných údajů Cloudflare TURN)
  let lastIce = {iceServers:null, turn:false, err:''};
  async function iceCheck() { try { lastIce = await (await fetch(base() + '/lan/ice')).json(); } catch (e) { lastIce = {iceServers:null, turn:false, err:''}; } return lastIce; }
  async function iceList() { const r = await iceCheck(); return r.iceServers && r.iceServers.length ? r.iceServers : iceServers(); }
  async function disable() {
    C().on = false; save();
    G.forEach((g, id) => closeGuest(id, true));
    if (ST.es) { ST.es.close(); ST.es = null; } clearInterval(ST.push); ST.push = null; ST.remotes = 0;
    const b = base(); if (b) try { ST.info = await (await fetch(b + '/lan', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{"on":false}'})).json(); } catch (e) {}
    renderTab();
  }
  function newKeys(which) {
    if (which === 'pin') { if (ST.role === 'gfx') C().gpin = rnd(10); else if (ST.role === 'aud') C().apin = rnd(10); else C().pin = rnd(10); } else if (which === 'pkey') C().pkey = rnd(10); else if (which === 'ckey') C().ckey = rnd(10); else C().gkey = rnd(10);
    save(); if (C().on) enable(); else renderTab();
  }
  function connectEvents() {
    if (ST.es) ST.es.close();
    ST.es = new EventSource(base() + '/app-events');
    ST.es.onmessage = e => { let d; try { d = JSON.parse(e.data); } catch (er) { return; } onMsg(d); };
    ST.es.onerror = () => {};
  }
  function onMsg(d) {
    if (d.t === 'act') { try { act(d.a, d.v); } catch (e) { HLT.note('Dálkové ovládání: ' + e.message); } }
    else if (d.t === 'tunnel') { if (ST.info) ST.info.tunnel = {status:d.status, url:d.url, err:d.err}; if (d.status === 'on' && d.url) toast('🌍 ' + L('Odkaz pro hosty přes internet je připravený')); if (LAY.isShown('remote')) renderTab(); }
    else if (d.t === 'remotes') { ST.remotes = d.n; if (LAY.isShown('remote')) renderTab(); }
    else if (d.t === 'prompters') { ST.prompters = d.n; ST.prJson = ''; if (LAY.isShown('remote')) renderTab(); }
    else if (d.t === 'offer') guestOffer(d).catch(e => { HLT.note('Host: ' + e.message); toast(L('Host se nepřipojil:') + ' ' + e.message); });
    else if (d.t === 'leave') closeGuest(d.id);
    else ICM.onMsg(d);
  }

  /* ---------- akce z ovladače ---------- */
  const pos2gain = v => v <= 0 ? 0 : Math.pow(10, (-60 + v * 70) / 20);
  const gain2pos = g => g <= 0 ? 0 : clamp((20 * Math.log10(g) + 60) / 70, 0, 1);
  function act(a, v) {
    const [k, id] = a.split(':');
    if (k === 'cut') take('cut');
    else if (k === 'auto') take('auto');
    else if (k === 'tbar') TR.tbar(Math.round(clamp(+v || 0, 0, 1) * 1000));
    else if (k === 'pv' && sceneById(id)) setPreview(id);
    else if (k === 'pg' && sceneById(id)) takeScene(id, 'cut');
    else if (k === 'tr') TR.select(id);
    else if (k === 'gfx') GFX.toggle(GFX.byId(id));
    else if (k === 'vol') { const g = pos2gain(clamp(+v || 0, 0, 1)); if (id === 'master') masterFader.gain.value = g; else { const s = srcById(id); if (s && s.audio) s.audio.vol = g; } audioChanged(); }
    else if (k === 'stream') { R.stream ? STR.stop(true) : STR.start(true); }   // ovladač se už zeptal sám
    else if (k === 'mute') { const s = srcById(id); if (s && s.audio) { s.audio.mute = !s.audio.mute; audioChanged(); } }
    else CTL.run(a, v);
    ST.lastJson = '';   // stav poslat hned
  }
  let audT = 0;
  function audioChanged() { clearTimeout(audT); audT = setTimeout(() => { if (LAY.isShown('audio')) renderMixer(); if (POP.on('audio')) AUD.renderPage(); save(); }, 250); }

  /* ---------- stav pro ovladače ---------- */
  const lvl = an => { if (!an) return 0; const p = peak(an), d = p > 0 ? 20 * Math.log10(p) : -100; return Math.round(clamp((d + 60) / 60, 0, 1) * 100) / 100; };
  function thumb(src) { const c = thumb.c || (thumb.c = Object.assign(document.createElement('canvas'), {width:384, height:216})); c.getContext('2d').drawImage(src, 0, 0, 384, 216); return c.toDataURL('image/jpeg', 0.6); }
  function state(withThumbs) {
    const onAir = onAirSet(), rt = RUN.timing && RUN.timing();
    const st = {
      lang:I18N.lang, live:!!R.stream, rec:!!R.rec, iso:R.iso.length > 0,
      scenes:S.scenes.map(sc => ({id:sc.id, name:sc.name})), pv:S.previewId, pg:S.programId, active:!!S.active,
      trs:S.trs.list.map(t => ({id:t.id, name:t.name})), tr:TR.cur() && TR.cur().id,
      gfx:S.gfx.list.map(g => ({id:g.id, name:g.name, on:GFX.isOn(g)})),
      ch:S.sources.filter(s => s.audio && s.audio.gainN).map(s => ({id:s.id, name:s.name, type:s.type, pos:Math.round(gain2pos(s.audio.vol) * 1000) / 1000, mute:!!s.audio.mute, lvl:lvl(s.audio.an), air:onAir.has(s.id)})),
      master:{pos:Math.round(gain2pos(masterFader.gain.value) * 1000) / 1000, lvl:lvl(masterAn)},
      rd:rt ? {name:rt.it.title, left:Math.round(rt.left), over:rt.over, next:rt.nextIt ? rt.nextIt.title : '', show:Math.round(rt.show)} : null,
      pr:{on:!!R.prompter.playing, speed:R.prompter.speed},
      guests:[...G.values()].map(g => ({name:g.s.name, air:g.air})),
      macros:typeof MAC !== 'undefined' ? MAC.list() : []
    };
    if (withThumbs) st.thumbs = {pv:thumb(pv), pg:thumb(pg)};
    return st;
  }
  function startPush() {
    clearInterval(ST.push);
    ST.push = setInterval(async () => {
      if (!C().on) return;
      pushPrompter();
      if (ST.busy) return;
      tally();
      const now = performance.now(), want = ST.remotes > 0;
      if (!want && now - ST.lastPost < 3000) return;
      const th = want && now - ST.thumbT > 700;
      const s = state(false), j = JSON.stringify(s);
      if (!th && j === ST.lastJson && now - ST.lastPost < 2000) return;
      ST.lastJson = j; ST.lastPost = now; ST.busy = true;
      if (th) { ST.thumbT = now; s.thumbs = {pv:thumb(pv), pg:thumb(pg)}; }
      try { const r = await fetch(base() + '/lan/state', {method:'POST', body:JSON.stringify(s)}); ST.remotes = +(await r.text()) || 0; } catch (e) {}
      ST.busy = false;
    }, 200);
  }

  /* ---------- čtečka na iPadu: text, pozice, rychlost (iPad si mezi zprávami posouvá text sám, plynule) ---------- */
  async function pushPrompter() {
    if (ST.prBusy || !ST.prompters) return;
    const P = R.prompter, w = P.win && !P.win.closed ? P.win : null;
    const st = {text:P.text, size:P.size, mirror:!!P.mirror, speed:P.speed, playing:!!P.playing, pos:Math.round(P.pos * 10) / 10, ref:w ? w.innerWidth : 1280};
    const j = JSON.stringify(st), now = performance.now();
    if (j === ST.prJson && now - ST.prT < (P.playing ? 500 : 3000)) return;
    ST.prJson = j; ST.prT = now; ST.prBusy = true;
    try { const r = await fetch(base() + '/lan/prompter', {method:'POST', body:j}); ST.prompters = +(await r.text()) || 0; } catch (e) {}
    ST.prBusy = false;
  }

  /* ---------- hosté (WebRTC) ---------- */
  async function guestOffer(d) {
    closeGuest(d.id, true);
    let s = S.sources.find(x => x.type === 'guest' && x.guestId === d.id);
    const fresh = !s;
    if (!s) { s = newSource('guest', d.name); s.guestId = d.id; S.sources.push(s); }
    s.name = d.cam ? (/^📱/.test(d.name) ? d.name : '📱 ' + d.name) : d.name; s.camMode = !!d.cam;
    const g = {s, conn:new Set(), air:false, pv:false, cam:!!d.cam};
    G.set(d.id, g);
    // zpětný obraz (program) a zvuk bez hosta (mix-minus) – mobil jako kamera nic zpátky nepotřebuje (šetří grafiku i síť)
    let retV = null, retA = null;
    if (!d.cam) {
      g.mm = actx.createGain(); g.mmDest = actx.createMediaStreamDestination(); g.mm.connect(g.mmDest);
      mmUpdate(g);
      retV = pg.captureStream(15).getVideoTracks()[0]; retA = g.mmDest.stream.getAudioTracks()[0];
      g.retV = retV;
    }
    const pc = new RTCPeerConnection({iceServers:await iceList()}); g.pc = pc;
    const vids = [], auds = [];
    pc.ontrack = e => {
      const t = e.track;
      if (t.kind === 'video') { attachVideoStream(s, new MediaStream([t])); }
      else {
        // Chrome: zvuk z WebRTC teče do Web Audio jen když ho zároveň „hraje“ (ztlumený) audio prvek
        g.aEl = new Audio(); g.aEl.muted = true; g.aEl.srcObject = new MediaStream([t]); g.aEl.play().catch(() => {});
        attachAudio(s, actx.createMediaStreamSource(new MediaStream([t])));
        s.guestAudio = t;   // pro ISO nahrávku hosta
      }
      renderSources(); renderMixer();
    };
    pc.onconnectionstatechange = () => {
      const cs = pc.connectionState;
      if (cs === 'connected') { s.missing = false; toast(`👤 ${s.name} ${L('je připojený')}`); if (LAY.isShown('remote')) renderTab(); }
      if (cs === 'failed' && !lastIce.turn) toast(`⚠ ${s.name}: ${L('spojení selhalo – síť blokuje přímé spojení. Zapni TURN (Dálkově → Pokročilé).')}`);
      if (cs === 'failed' || cs === 'closed') { if (G.get(d.id) === g) closeGuest(d.id); }
    };
    await pc.setRemoteDescription({type:'offer', sdp:d.sdp});
    for (const tr of pc.getTransceivers()) {
      const kind = tr.receiver.track && tr.receiver.track.kind;
      if (d.cam) {
        // nízké zpoždění: co nejmenší vyrovnávací paměť přijímače (v místní síti stačí ~50 ms)
        try { tr.receiver.jitterBufferTarget = 50; } catch (e) {} try { tr.receiver.playoutDelayHint = 0.05; } catch (e) {}
        try { tr.direction = 'recvonly'; } catch (e) {}
        continue;
      }
      if (kind === 'video' && !vids.length) { tr.direction = 'sendrecv'; await tr.sender.replaceTrack(retV); vids.push(tr); }
      else if (kind === 'audio' && !auds.length) { tr.direction = 'sendrecv'; await tr.sender.replaceTrack(retA); auds.push(tr); }
    }
    const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
    await gathered(pc);
    try { const v = vids[0] && vids[0].sender, p = v && v.getParameters(); if (p && p.encodings && p.encodings[0]) { p.encodings[0].maxBitrate = 1500000; await v.setParameters(p); } } catch (e) {}
    const r = await fetch(base() + '/lan/guest/' + d.id, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({t:'answer', sdp:pc.localDescription.sdp})});
    if (!r.ok) throw new Error(await r.text());
    g.air = null; tally();
    if (fresh) { renderSources(); }
    if (LAY.isShown('remote')) renderTab();
    save();
  }
  const gathered = pc => new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 3000);   // bez internetu STUN nedoběhne – v místní síti stačí místní adresy
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
  function mmUpdate(g) {
    for (const s of S.sources) {
      if (s === g.s || !s.audio || !s.audio.gainN || g.conn.has(s.id)) continue;
      try { s.audio.gainN.connect(g.mm); g.conn.add(s.id); } catch (e) {}
    }
  }
  function closeGuest(id, quiet) {
    const g = G.get(id); if (!g) return; G.delete(id);
    try { g.pc.close(); } catch (e) {}
    try { g.retV && g.retV.stop(); } catch (e) {}
    if (g.mm) { for (const s of S.sources) if (g.conn.has(s.id) && s.audio && s.audio.gainN) try { s.audio.gainN.disconnect(g.mm); } catch (e) {}
      try { g.mm.disconnect(); } catch (e) {} }
    if (g.aEl) { g.aEl.srcObject = null; }
    const s = g.s; s.missing = true; s.hasVideo = false;
    if (s.stream) { s.stream.getTracks().forEach(t => t.stop()); s.stream = null; }
    if (!quiet) { toast(`👤 ${s.name} ${L('se odpojil')}`); renderSources(); }
    if (LAY.isShown('remote')) renderTab();
  }
  async function kick(id) {
    try { await fetch(base() + '/lan/guest/' + id, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{"t":"bye"}'}); } catch (e) {}
    closeGuest(id);
  }
  // „tally“ – host vidí, jestli je zrovna ve vysílání nebo v náhledu
  function tally() {
    if (!G.size) return;
    const onAir = onAirSet(), inPv = sceneSources(prevScene(), new Set());
    G.forEach((g, id) => {
      if (g.mm) mmUpdate(g);
      const air = onAir.has(g.s.id), p = inPv.has(g.s.id);
      if (air === g.air && p === g.pv) return; g.air = air; g.pv = p;
      fetch(base() + '/lan/guest/' + id, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({t:'tally', air, pv:p})}).catch(() => {});
    });
  }

  /* ---------- záložka ---------- */
  function renderTab() {
    const box = $('#tab-remote'); if (!box || !S.rem) return;
    const on = C().on && ST.info && ST.info.on;
    const qr = u => { try { return QR.svg(u, 168); } catch (e) { return ''; } };
    const guests = S.sources.filter(s => s.type === 'guest');
    box.innerHTML = `<div class="sec"><h4>📱 ${L('Dálkové ovládání a hosté')}</h4>
      <label class="chk"><input type="checkbox" id="remOn" ${C().on ? 'checked' : ''} ${ST.starting ? 'disabled' : ''}> ${L('Povolit v místní síti (stejná Wi-Fi)')}</label>
      ${ST.err ? `<p class="warn">${esc(ST.err)}</p>` : ''}
      <p class="dim">${L('Druhý člověk může ovládat přepínání, grafiku, zvuk a scénář z iPadu, mobilu nebo jiného počítače. Hosté se připojí přes odkaz s kamerou a mikrofonem – nic neinstalují.')}</p></div>
      ${on ? `<div class="remgrid">
        <div class="remcard"><h4>🎛 ${L('Ovladač')}</h4>
          <label>${L('Co smí ovládat')}<select id="remRole"><option value="full" ${!ST.role || ST.role === 'full' ? 'selected' : ''}>${L('Všechno (režisér)')}</option><option value="gfx" ${ST.role === 'gfx' ? 'selected' : ''}>${L('Jen grafika, titulky, skóre a scénář')}</option><option value="aud" ${ST.role === 'aud' ? 'selected' : ''}>${L('Jen zvuk (zvukař)')}</option></select></label>
          <div class="qr">${qr(remoteUrl())}</div>
          <code class="url" title="${L('Klikni pro zkopírování')}">${esc(remoteUrl())}</code>
          <p class="dim">${L('Připojené ovladače:')} <b>${ST.remotes}</b></p>
          <div class="btns"><button data-rm="newpin">🔑 ${L('Nový klíč')}</button></div></div>
        <div class="remcard"><h4>📜 ${L('Čtecí zařízení (iPad)')}</h4><div class="qr">${qr(prompterUrl())}</div>
          <code class="url" title="${L('Klikni pro zkopírování')}">${esc(prompterUrl())}</code>
          <p class="dim">${L('Připojené čtečky:')} <b>${ST.prompters}</b> · ${L('Text, rychlost a posun se řídí z režie (záložka Čtečka, klávesa P) nebo z ovladače.')}</p>
          <div class="btns"><button data-rm="newpk">🔑 ${L('Nový klíč')}</button></div></div>
        <div class="remcard"><h4>🎥 ${L('Kameramani (interkom)')}</h4><div class="qr">${qr(crewUrl())}</div>
          <code class="url" title="${L('Klikni pro zkopírování')}">${esc(crewUrl())}</code>
          <p class="dim">${L('Kameraman otevře odkaz v mobilu se sluchátky a vybere svou kameru. Slyší režii, může odpovědět a mobil mu svítí jako tally (červená = ve vysílání).')} ${L('Mluvíš z panelu 🎙 nahoře nebo držením klávesy')} <kbd>§</kbd> / <kbd>\`</kbd>.</p>
          <div class="btns"><button data-rm="icom">🎙 ${L('Otevřít interkom')}</button><button data-rm="newck">🔑 ${L('Nový klíč')}</button></div></div>
        <div class="remcard"><h4>📱 ${L('Mobil jako kamera')}</h4>
          ${(() => { const tn = ST.info.tunnel || {}, u = C().online && tn.status === 'on' && onlineUrl() ? onlineUrl() + '&cam=1' : guestUrl() + '&cam=1';
            return `<div class="qr">${qr(u)}</div><code class="url" title="${L('Klikni pro zkopírování')}">${esc(u)}</code>`; })()}
          <p class="dim">${L('Naskenuj QR mobilem ve stejné Wi-Fi. Mobil posílá obraz v plné kvalitě (až 4K / 60 fps, H.264) s nízkým zpožděním, zpátky nic nepřijímá – šetří baterii i grafiku režie. Zadní kamera, zoom a světlo se ovládají v mobilu. Každý mobil = nový zdroj 📱 v Zdrojích.')}</p>
          <p class="dim">${L('Tip: mobil na stativ, nabíječku, Wi-Fi 5 GHz. Pro profi aplikace (NDI HX Camera, Larix → SRT) použij Zdroje → NDI nebo SRT vstup.')}</p></div>
        <div class="remcard"><h4>👤 ${L('Odkaz pro hosty')}</h4>
          <label class="chk"><input type="checkbox" id="remOnline" ${C().online ? 'checked' : ''}> 🌍 ${L('Hosté i mimo Wi-Fi (přes internet)')}</label>
          ${(() => { const tn = ST.info.tunnel || {}, u = onlineUrl();
            if (C().online && tn.status === 'on' && u) return `<div class="qr">${qr(u)}</div><code class="url" title="${L('Klikni pro zkopírování')}">${esc(u)}</code>
              <p class="dim">🟢 ${L('Funguje odkudkoli na světě, bez varování o certifikátu. Adresa se změní při každém zapnutí – posílej hostům vždy aktuální.')}</p>
              <details><summary class="dim">${L('Odkaz jen pro místní Wi-Fi')}</summary><code class="url">${esc(guestUrl())}</code></details>`;
            return (C().online ? `<p class="${tn.err ? 'warn' : 'dim'}">${tn.status === 'starting' ? '🟡 ' + L('Vytvářím veřejnou adresu…') : ''} ${tn.err ? esc(L(tn.err)) : ''}</p>` : '') +
              `<div class="qr">${qr(guestUrl())}</div><code class="url" title="${L('Klikni pro zkopírování')}">${esc(guestUrl())}</code>`; })()}
          <div class="btns"><button data-rm="newg">🔑 ${L('Nový odkaz')}</button></div>
          <details class="turn" ${C().cft.id || C().turn.url ? 'open' : ''}><summary class="dim">${L('Pokročilé: TURN server')} ${lastIce.turn ? '🟢' : ''}</summary>
            <p class="dim">${L('Když se host přes internet nepřipojí (přísná síť, mobilní data), pomůže TURN server – přepošle obraz, i když síť přímé spojení blokuje. Nejjednodušší je zdarma od Cloudflare: dash.cloudflare.com → Realtime → TURN Server → Create → zkopíruj Turn Token ID a API Token sem.')}</p>
            <input id="cftId" placeholder="Cloudflare Turn Token ID" value="${esc(C().cft.id)}"><input id="cftTok" type="password" placeholder="Cloudflare API Token" value="${esc(C().cft.token)}">
            ${ST.info.turnErr ? `<p class="warn">${esc(ST.info.turnErr)}</p>` : lastIce.err ? `<p class="warn">${esc(lastIce.err)}</p>` : lastIce.turn ? `<p class="dim">🟢 ${L('TURN je připravený.')}</p>` : ''}
            <p class="dim">${L('Nebo jiný TURN server (např. Metered):')}</p>
            <input id="turnUrl" placeholder="turn:server:3478, turns:server:443" value="${esc(C().turn.url)}">
            <input id="turnUser" placeholder="${L('uživatel')}" value="${esc(C().turn.user)}"><input id="turnPass" type="password" placeholder="${L('heslo')}" value="${esc(C().turn.pass)}">
            <div class="btns"><button data-rm="turn">${L('Uložit TURN')}</button></div></details></div>
        <div class="remcard"><h4>${L('Hosté')}</h4>
          ${guests.length ? guests.map(s => { const live = G.has(s.guestId); return `<div class="guest ${live ? 'live' : ''}" data-gid="${esc(s.guestId)}" data-sid="${s.id}">
            <span>${live ? '🟢' : '⚪'} ${esc(s.name)}</span>
            <button data-rm="addpv" ${live ? '' : 'disabled'}>➕ ${L('Do náhledu')}</button>${live ? `<button data-rm="kick">✕ ${L('Odpojit')}</button>` : ''}</div>`; }).join('') : `<p class="dim">${L('Zatím nikdo. Pošli hostovi odkaz nebo ať naskenuje QR kód.')}</p>`}
          <p class="dim">${L('Host vidí program a slyší všechno kromě sebe (mix-minus). Když je ve vysílání, svítí mu červeně „ŽIVĚ“.')}</p></div></div>
      ${ST.info.https ? `<p class="dim">⚠ ${L('Při prvním otevření prohlížeč napíše, že spojení není soukromé (certifikát si aplikace vyrobila sama). Klikni na „Podrobnosti → Přesto pokračovat“. Spojení je šifrované.')}</p>` : `<p class="warn">${L('Chybí OpenSSL – spojení není šifrované, takže kamera hosta v mobilu nepůjde. Ovladač funguje.')}</p>`}
      ${ST.info.ips.length > 1 ? `<p class="dim">${L('Jiné adresy tohoto počítače:')} ${ST.info.ips.slice(1).map(esc).join(', ')}</p>` : ''}
      ${!ST.info.ips.length ? `<p class="warn">${L('Počítač není připojený k žádné síti.')}</p>` : ''}
` : ''}`;
  }
  function init() {
    const box = $('#tab-remote');
    box.addEventListener('change', e => { if (e.target.id === 'remOn') e.target.checked ? enable() : disable(); if (e.target.id === 'remOnline') setOnline(e.target.checked); if (e.target.id === 'remRole') { ST.role = e.target.value; renderTab(); } });
    box.addEventListener('click', e => {
      const t = e.target;
      if (t.classList.contains('url')) { navigator.clipboard && navigator.clipboard.writeText(t.textContent); t.classList.add('copied'); setTimeout(() => t.classList.remove('copied'), 800); return; }
      const a = t.dataset.rm; if (!a) return;
      if (a === 'newpin') newKeys('pin'); else if (a === 'newg') newKeys('gkey'); else if (a === 'newpk') newKeys('pkey'); else if (a === 'newck') newKeys('ckey'); else if (a === 'icom') ICM.open();
      else if (a === 'turn') saveTurn({url:$('#turnUrl').value.trim(), user:$('#turnUser').value.trim(), pass:$('#turnPass').value}, {id:$('#cftId').value.trim(), token:$('#cftTok').value.trim()});
      else if (a === 'kick') kick(t.closest('.guest').dataset.gid);
      else if (a === 'addpv') { const s = srcById(t.closest('.guest').dataset.sid); if (s) { addToPreview(s); renderSources(); save(); toast(L('Host přidán do náhledu')); } }
    });
    if (C().on) enable();
  }
  const info = () => ST.info && ST.info.on ? {on:true, tunnel:ST.info.tunnel, remotes:ST.remotes, prompters:ST.prompters, turn:!!lastIce.turn} : {on:false};
  return {init, load, save:save_, renderTab, act, state, guests:() => G, base, iceServers, iceList, gathered, info, on:() => C().on && ST.info && ST.info.on};
})();
