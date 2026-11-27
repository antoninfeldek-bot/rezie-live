'use strict';
/* ================= VYSÍLÁNÍ =================
   Dvě cesty:
   1) RTMP přes server.js (Node + FFmpeg) – YouTube, Facebook, Twitch, … i víc míst najednou
   2) WHIP přímo z prohlížeče (WebRTC) – bez instalace: Twitch, Restream, vlastní WHIP server */
const RTMP_PLAT = {
  youtube:{n:'YouTube', url:'rtmp://a.rtmp.youtube.com/live2', help:'YouTube Studio → Vytvořit → Spustit živé vysílání → Stream → Klíč streamu'},
  facebook:{n:'Facebook', url:'rtmps://live-api-s.facebook.com:443/rtmp/', help:'Facebook → Živé video → Použít klíč streamu'},
  twitch:{n:'Twitch', url:'rtmp://live.twitch.tv/app', help:'Twitch → Ovládací panel tvůrce → Nastavení → Stream → Primární klíč streamu'},
  kick:{n:'Kick', url:'', help:'Kick → Dashboard → Settings → Stream URL + Stream Key (vlož obojí)'},
  custom:{n:'Vlastní (Instagram, TikTok, …)', url:'', help:'Zkopíruj adresu serveru (rtmp:// nebo rtmps://) a klíč z platformy'},
  srt:{n:'SRT (profesionální)', url:'srt://', help:'SRT – profesionální protokol odolný proti výpadkům (jen v aplikaci). Vlož srt://adresa:port, klíč = streamid (pokud ho server chce).'}
};
const WHIP_PLAT = {
  twitch:{n:'Twitch (zkušební)', url:'https://g.webrtc.live-video.net:4443/v2/offer', tok:'Klíč streamu z Twitche', help:'Twitch WHIP není oficiálně zdokumentovaný – funguje, ale může se změnit. Token = tvůj klíč streamu.'},
  restream:{n:'Restream (rozešle na YouTube, FB, …)', url:'', tok:'Bearer token z Restreamu', help:'Restream → nastavení streamu → WHIP (beta) → zkopíruj URL a token. Restream to pak rozešle na všechny tvoje kanály.'},
  custom:{n:'Vlastní WHIP server (MediaMTX, Cloudflare, …)', url:'', tok:'Token (pokud ho server chce)', help:'Vlož WHIP adresu svého serveru.'}
};
const ENCODERS = {libx264:'Procesor (x264) – funguje všude', h264_nvenc:'NVIDIA grafika (NVENC)', h264_qsv:'Intel grafika (Quick Sync)', h264_amf:'AMD grafika (AMF)', h264_videotoolbox:'Mac (VideoToolbox)'};
const KEYS = {};   // klíče streamů jen v paměti (pokud si je uživatel nenechá pamatovat)

function relayUrl() { return ((S.streamCfg && S.streamCfg.relay) || 'http://localhost:8080').trim().replace(/\/+$/, ''); }
function stLog(t) { const el = $('#stLog'); if (!el) return; el.textContent = (new Date().toLocaleTimeString() + '  ' + t + '\n' + el.textContent).slice(0, 5000); }
async function toggleStream() { if (R.stream) return STR.stop(); return STR.start(); }
async function testRelay() { return STR.test(); }

const STR = (() => {
  const C = () => S.streamCfg;
  const ST = {srv:null, stats:'', status:'off'};
  const IS_APP = /Electron/.test(navigator.userAgent);   // desktopová aplikace – server běží uvnitř
  const defRelay = () => (location.protocol.startsWith('http') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) ? location.origin : 'http://localhost:8080';
  const newTarget = plat => ({id:uid(), plat, url:RTMP_PLAT[plat].url, on:true});
  function load(d) {
    const c = {mode:'rtmp', relay:defRelay(), vb:4500, res:'1080', enc:'libx264', remember:false, targets:[newTarget('youtube')],
      whip:{preset:'twitch', url:WHIP_PLAT.twitch.url, vb:4500, codec:'h264'}};
    if (d) {
      if (d.targets) Object.assign(c, d, {whip:Object.assign(c.whip, d.whip || {})});
      else if (d.url) { c.targets = [{id:uid(), plat:d.plat || 'custom', url:d.url, on:true}]; c.vb = d.vb || 4500; c.relay = d.relay || c.relay; }   // starý formát
    }
    if (IS_APP || (location.protocol.startsWith('http') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) c.relay = location.origin;
    c.app = Object.assign({record:true, recDir:''}, c.app || {});
    if (NAT.available() && (!d || !d.modeChosen)) c.mode = 'app';
    if (!NAT.available() && c.mode === 'app') c.mode = 'rtmp';
    c.targets.forEach(t => { if (t.key) { KEYS[t.id] = t.key; delete t.key; } });
    if (c.whip.token) { KEYS.whip = c.whip.token; delete c.whip.token; }
    S.streamCfg = c;
  }
  function save_() {
    const c = JSON.parse(JSON.stringify(C()));
    if (c.remember) { c.targets.forEach(t => { if (KEYS[t.id]) t.key = KEYS[t.id]; }); if (KEYS.whip) c.whip.token = KEYS.whip; }
    return c;
  }

  /* ---------- UI ---------- */
  const opt = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${typeof n === 'string' ? n : n.n}</option>`).join('');
  function renderTab() {
    const box = $('#tab-stream'); if (!box || !C()) return; const c = C(), live = !!R.stream;
    const wp = WHIP_PLAT[c.whip.preset] || WHIP_PLAT.custom;
    box.innerHTML = `
    <div class="stmode ${NAT.available() ? 'three' : ''}">${NAT.available() ? `<button data-sm="app" class="${c.mode === 'app' ? 'on2' : ''}" ${live ? 'disabled' : ''}>🚀 Nativní vysílání<small>doporučeno – kódování na grafice, víc míst, SRT, pojistná nahrávka</small></button>` : ''}<button data-sm="rtmp" class="${c.mode === 'rtmp' ? 'on2' : ''}" ${live ? 'disabled' : ''}>📡 Přes server.js (RTMP)<small>YouTube, Facebook, Twitch… i víc míst najednou</small></button>
      <button data-sm="whip" class="${c.mode === 'whip' ? 'on2' : ''}" ${live ? 'disabled' : ''}>🌐 Přímo z prohlížeče (WHIP)<small>bez instalace – Twitch, Restream, vlastní server</small></button></div>
    <div class="ststatus ${ST.status}"><b id="stState">${statusText()}</b><span id="stStats" class="mono">${ST.stats}</span>
      <button id="stGo" class="${live ? 'on' : 'primary'}">${live ? '■ Ukončit vysílání' : '⦿ Spustit vysílání'}</button></div>
    ${c.mode === 'rtmp' || c.mode === 'app' ? `
    <div class="sec"><h4>Kam vysílat (můžeš zapnout víc míst najednou)</h4>
      ${c.targets.map(t => { const P = RTMP_PLAT[t.plat] || RTMP_PLAT.custom; return `<div class="sttg" data-id="${t.id}">
        <label class="chk"><input type="checkbox" data-tk="on" ${t.on ? 'checked' : ''} ${live ? 'disabled' : ''}></label>
        <label>Platforma<select data-tk="plat" ${live ? 'disabled' : ''}>${opt(c.mode === 'app' ? RTMP_PLAT : Object.fromEntries(Object.entries(RTMP_PLAT).filter(([k]) => k !== 'srt')), t.plat)}</select></label>
        <label>Adresa serveru<input data-tk="url" value="${esc(t.url)}" placeholder="rtmp://…" ${live ? 'disabled' : ''}></label>
        <label>Klíč streamu<input data-tk="key" type="password" autocomplete="off" value="${esc(KEYS[t.id] || '')}" placeholder="vlož klíč" ${live ? 'disabled' : ''}></label>
        <button data-ta="del" title="Odebrat" ${live || c.targets.length < 2 ? 'disabled' : ''}>✕</button>
        <div class="dim sthelp">${esc(P.help)}${c.mode === 'app' && t.plat === 'youtube' ? ` <label class="chk" style="display:inline-flex;margin-left:8px"><input type="checkbox" data-tk="backup" ${t.backup ? 'checked' : ''} ${live ? 'disabled' : ''}> + záložní server YouTube</label>` : ''}</div></div>`; }).join('')}
      <div class="btns"><button data-ta="add" ${live ? 'disabled' : ''}>+ Přidat další místo</button>
        <label class="chk"><input type="checkbox" data-c="remember" ${c.remember ? 'checked' : ''}> Pamatovat klíče v tomto počítači</label></div></div>
    <div class="sec"><h4>Kvalita</h4><div class="grid4">
      <label>Datový tok videa (kbps)<input type="number" data-c="vb" min="500" step="500" value="${c.vb}" ${live ? 'disabled' : ''}></label>
      <div class="stfmt"><span class="dim">${L('Výstup')}</span> <b>${CFG.out().join('×')} · ${CFG.video.fps} fps</b> <button data-ta="settings" title="${L('Rozlišení, FPS, kodér, klíčové snímky, zvuk…')}">⚙ ${L('Nastavení')}</button></div>
      ${c.mode === 'app' ? `<div style="grid-column:span 2" class="dim">${L('Kódování:')} <b>${L('H.264 na grafické kartě')}</b> ${L('(jen jednou, bez překódování)')} · ${L('klíčový snímek každé')} ${CFG.stream.keyint} s · ${CFG.stream.rc.toUpperCase()} · ${L('zvuk')} ${CFG.stream.ab} kbps${CFG.stream.delay ? ` · ⏱ ${L('zpoždění')} ${CFG.stream.delay} s` : ''} · ${L('datový tok se sám sníží, když internet nestíhá.')}</div>` : `<label style="grid-column:span 2">Kódování<select data-c="enc" ${live ? 'disabled' : ''}>${Object.entries(ENCODERS).map(([k, n]) => { const ok = !ST.srv || !ST.srv.encoders || ST.srv.encoders.includes(k); return `<option value="${k}" ${c.enc === k ? 'selected' : ''} ${ok ? '' : 'disabled'}>${n}${ok ? '' : ' – není k dispozici'}</option>`; }).join('')}</select></label>`}</div>
      <p class="dim">Doporučení: 1080p → 4500–6000 kbps, 720p → 2500–4000 kbps. Rychlost nahrávání internetu by měla být aspoň 1,5× vyšší. Na víc míst najednou se počítá součet. Kódování na grafice ulehčí procesoru.</p></div>
    ${c.mode === 'app' ? `<div class="sec"><h4>💾 Pojistná nahrávka</h4>
      <label class="chk"><input type="checkbox" data-a="record" ${c.app.record ? 'checked' : ''} ${live ? 'disabled' : ''}> Při vysílání zároveň nahrávat na disk (MKV, stejná kvalita jako stream, nezávislé na internetu)</label>
      <div class="row" style="margin-top:6px"><label>Složka<input value="${esc(c.app.recDir || ST.info && ST.info.videos || '')}" readonly></label><button data-ta="recdir" ${live ? 'disabled' : ''}>Změnit</button><button data-ta="recopen">📂 Otevřít</button></div></div>
    <div class="sec"><h4>Stav jednotlivých míst</h4><div id="stOuts" class="stouts"><span class="dim">Spustí se po zahájení vysílání.</span></div></div>` : ''}
    ${c.mode === 'app' ? '' : `<div class="sec"><h4>Přenosový program v počítači (server.js)</h4>
      <div class="row"><label>Adresa<input data-c="relay" value="${esc(c.relay)}"></label><button id="stTest">Otestovat spojení</button></div>
      <p class="dim">${IS_APP ? '✅ Běží uvnitř aplikace (včetně FFmpeg) – nic dalšího není potřeba.' : 'Spusť <b>start-windows.bat</b> (Windows) nebo <b>start-mac.command</b> (Mac) – nebo v terminálu <code>node server.js</code>. Potřebuje Node.js a FFmpeg (viz NAVOD.md). Nebo si stáhni desktopovou aplikaci – tam je všechno uvnitř.'}</p></div>`}`
    : `
    <div class="sec"><h4>WHIP – vysílání přímo z prohlížeče</h4><div class="grid2">
      <label>Služba<select data-w="preset" ${live ? 'disabled' : ''}>${opt(WHIP_PLAT, c.whip.preset)}</select></label>
      <label>Datový tok videa (kbps)<input type="number" data-w="vb" min="500" step="500" value="${c.whip.vb}" ${live ? 'disabled' : ''}></label>
      <label>WHIP adresa<input data-w="url" value="${esc(c.whip.url)}" placeholder="https://…" ${live ? 'disabled' : ''}></label>
      <label>${esc(wp.tok)}<input data-w="token" type="password" autocomplete="off" value="${esc(KEYS.whip || '')}" ${live ? 'disabled' : ''}></label>
      <label>Kodek videa<select data-w="codec" ${live ? 'disabled' : ''}>${opt({h264:'H.264 (doporučeno, chce ho většina služeb)', auto:'Nechat na prohlížeči (VP8/VP9/AV1)'}, c.whip.codec)}</select></label>
      <label class="chk" style="align-self:end"><input type="checkbox" data-c="remember" ${c.remember ? 'checked' : ''}> Pamatovat token v tomto počítači</label></div>
      <p class="dim">${esc(wp.help)}</p>
      <p class="dim">YouTube ani Facebook WHIP zatím nepřijímají – pro ně použij Restream (přijme WHIP a pošle to dál), nebo režim „Přes server.js“. WebRTC se samo přizpůsobí, když internet zakolísá.</p></div>`}
    <div id="ndiBox">${NDI.html()}</div>
    <div class="sec"><h4>Záznam</h4><pre id="stLog">${esc(ST.log || '—')}</pre></div>`;
  }
  const statusText = () => ({off:'⚪ Nevysílá se', connecting:'🟡 Připojuji…', live:'🔴 ŽIVĚ', warn:'🟠 Vysílá se, ale s problémy', retry:'🟡 Spojení vypadlo – připojuji znovu…', error:'⚠ Chyba'})[ST.status] || '';
  function setStatus(s, stats) { ST.status = s; if (stats != null) ST.stats = stats; const a = $('#stState'), b = $('#stStats'), w = document.querySelector('.ststatus');
    if (a) a.textContent = statusText(); if (b) b.textContent = ST.stats; if (w) w.className = 'ststatus ' + s; }
  const keepLog = () => { const el = $('#stLog'); if (el) ST.log = el.textContent; };

  /* ---------- RTMP přes server.js ---------- */
  async function test() {
    try { const j = await (await fetch(relayUrl() + '/status')).json(); ST.srv = j;
      stLog(`Spojení OK. FFmpeg: ${j.ffmpeg ? 'nalezen ✔' : 'NENALEZEN ✖ – nainstaluj FFmpeg'}${j.encoders ? ' · kódování: ' + j.encoders.map(e => ENCODERS[e] ? ENCODERS[e].split(' ')[0] + (e === 'libx264' ? '' : ' ' + e.split('_')[1]) : e).join(', ') : ''}`);
      keepLog(); renderTab(); return true; }
    catch (e) { stLog('Server neodpovídá. Spusť start-windows.bat / start-mac.command nebo „node server.js“.'); keepLog(); return false; }
  }
  function rtmpTargets() {
    return C().targets.filter(t => t.on).map(t => {
      const key = (KEYS[t.id] || '').trim(), url = (t.url || '').trim();
      if (!url || !key) throw new Error(`U místa „${(RTMP_PLAT[t.plat] || {}).n}“ chybí adresa nebo klíč.`);
      if (!/^rtmps?:\/\//.test(url)) throw new Error('Adresa musí začínat rtmp:// nebo rtmps://');
      return url.replace(/\/+$/, '') + '/' + key;
    });
  }
  function appTargets() {
    const out = [];
    C().targets.filter(t => t.on).forEach(t => {
      const key = (KEYS[t.id] || '').trim(), url = (t.url || '').trim(), name = (RTMP_PLAT[t.plat] || {}).n || 'Místo';
      if (/^srt:\/\/.+/.test(url)) { out.push({id:t.id, name, url:key && !/streamid=/.test(url) ? url + (url.includes('?') ? '&' : '?') + 'streamid=' + encodeURIComponent(key) : url}); return; }
      if (!url || !key) throw new Error(`U místa „${name}“ chybí adresa nebo klíč.`);
      if (!/^rtmps?:\/\//.test(url)) throw new Error('Adresa musí začínat rtmp://, rtmps:// nebo srt://');
      out.push({id:t.id, name, url:url.replace(/\/+$/, '') + '/' + key});
      if (t.plat === 'youtube' && t.backup) out.push({id:t.id + '-b', name:'YouTube (záloha)', url:'rtmp://b.rtmp.youtube.com/live2?backup=1/' + key});
    });
    return out;
  }
  const ST_NAME = {starting:'🟡 připojuji', live:'🟢 živě', reconnecting:'🟠 znovu se připojuje', stopped:'⚪ zastaveno'};
  function renderOuts(s) {
    if (s) ST.nat = s;
    const box = $('#stOuts'); if (!box || !s) return; const n = NAT.stats();
    box.innerHTML = `<div class="stout enc"><b>🎛 Kodér</b><span>${n.codec ? `H.264 ${n.w}×${n.h} · ${n.fps.toFixed(1)} fps · ${Math.round(n.vb / 1000)} kbps${n.vb < n.vbTarget ? ` (sníženo z ${Math.round(n.vbTarget / 1000)})` : ''}${n.late ? ` · zpožděné snímky: ${n.late}` : ''}` : '—'}</span></div>` +
      s.outs.map(o => `<div class="stout ${o.state}${o.congested ? ' cong' : ''}"><b>${esc(o.name)}</b><span>${ST_NAME[o.state] || o.state}${o.kbps ? ' · ' + Math.round(o.kbps) + ' kbps' : ''}${o.uptime ? ' · ' + fmtT(o.uptime * 1000) : ''}${o.restarts ? ' · znovupřipojení: ' + o.restarts : ''}${o.congested ? ' · ⚠ pomalý internet' : ''}</span>${o.last && o.state !== 'live' ? `<small class="dim" title="${esc(o.last)}">${esc(o.last.slice(0, 90))}</small>` : ''}</div>`).join('');
    const live = s.outs.filter(o => o.kind === 'net' && o.state === 'live').length, net = s.outs.filter(o => o.kind === 'net').length;
    if (R.stream && R.stream.mode === 'app') setStatus(live === net ? 'live' : live ? 'warn' : 'retry', `${live}/${net} míst živě${s.outs.some(o => o.kind === 'file' && o.state === 'live') ? ' · 💾 nahrává se' : ''}`);
  }
  async function rtmpStart(st) {
    const c = C(), relay = relayUrl();
    const r = await fetch(relay + '/start', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({targets:st.targets, vb:c.vb, fps:CFG.video.fps, out:CFG.out(), keyint:CFG.stream.keyint, profile:CFG.stream.profile, ab:CFG.stream.ab, rc:CFG.stream.rc, enc:c.enc})});
    if (!r.ok) throw new Error(await r.text());
    const mime = ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(outStream(), {mimeType:mime, videoBitsPerSecond:Math.max(8000, c.vb * 2) * 1000, audioBitsPerSecond:192000});
    st.rec = rec; st.q = Promise.resolve(); st.errs = 0;
    rec.ondataavailable = e => {
      if (!e.data.size || st.rec !== rec) return; const blob = e.data;
      st.q = st.q.then(() => fetch(relay + '/chunk', {method:'POST', body:blob})).then(r => { if (!r.ok) throw new Error('server ' + r.status); })
        .catch(err => { st.errs++; if (st.errs < 4 || st.errs % 50 === 0) stLog('Chyba odesílání: ' + err.message); });
    };
    rec.start(250);
  }
  async function rtmpPoll(st) {
    if (R.stream !== st || st.busy) return;
    try {
      const j = await (await fetch(st.relay + '/status')).json();
      if (R.stream !== st) return;
      if (j.running) {
        const s = j.stats || {}; st.fails = 0; st.srvStats = s;
        const bad = s.speed && s.speed < 0.93;
        if (!s.frame) { setStatus('connecting', 'spouštím kódování…'); return; }
        setStatus(bad ? 'warn' : 'live', `${s.fps ? s.fps + ' fps' : ''}${s.kbps ? ' · ' + Math.round(s.kbps) + ' kbps' : ''}${s.speed ? ' · rychlost ' + s.speed.toFixed(2) + '×' : ''}${s.drop ? ' · zahozeno ' + s.drop : ''} · ${st.targets.length} ${st.targets.length > 1 ? 'místa' : 'místo'}`);
        if (bad && !st.warned) { st.warned = true; stLog('⚠ Počítač nestíhá kódovat (rychlost pod 1×). Zkus 720p, nižší datový tok, nebo kódování na grafice.'); }
      } else if (!st.stopping) {
        st.fails = (st.fails || 0) + 1;
        if (j.last) stLog('ffmpeg: ' + j.last);
        if (st.fails >= 1 && st.retries < 30) {
          st.retries++; setStatus('retry'); stLog(`Spojení vypadlo – zkouším znovu (${st.retries}). ${/auth|denied|401|403|refused|Invalid/i.test(j.last || '') ? 'Zkontroluj klíč streamu!' : ''}`);
          st.busy = true; try { if (st.rec && st.rec.state !== 'inactive') st.rec.stop(); } catch (e) {}
          await new Promise(r => setTimeout(r, Math.min(10000, 1500 * st.retries)));
          if (R.stream === st) { try { await rtmpStart(st); } catch (e) { stLog('Znovupřipojení selhalo: ' + e.message); } }
          st.busy = false;
        }
      }
    } catch (e) { setStatus('warn', 'server.js neodpovídá'); }
    keepLog();
  }

  /* ---------- WHIP přímo z prohlížeče ---------- */
  async function whipConnect(st) {
    const w = C().whip, url = (w.url || '').trim(), token = (KEYS.whip || '').trim();
    if (!/^https?:\/\//.test(url)) throw new Error('Vyplň WHIP adresu (https://…).');
    const ms = outStream(), pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}], bundlePolicy:'max-bundle'});
    st.pc = pc;
    const vt = ms.getVideoTracks()[0], at = ms.getAudioTracks()[0];
    try { vt.contentHint = 'motion'; } catch (e) {}
    const vtr = pc.addTransceiver(vt, {direction:'sendonly', streams:[ms], sendEncodings:[{maxBitrate:w.vb * 1000, maxFramerate:CFG.video.fps}]});
    if (at) pc.addTransceiver(at, {direction:'sendonly', streams:[ms]});
    if (w.codec === 'h264' && window.RTCRtpSender && RTCRtpSender.getCapabilities && vtr.setCodecPreferences) {
      const cs = RTCRtpSender.getCapabilities('video').codecs, h = cs.filter(x => /h264/i.test(x.mimeType));
      if (h.length) vtr.setCodecPreferences([...h, ...cs.filter(x => !/h264/i.test(x.mimeType))]); else stLog('⚠ Prohlížeč neumí H.264 přes WebRTC – použije se jiný kodek.');
    }
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 2500); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
    const headers = {'Content-Type':'application/sdp'}; if (token) headers.Authorization = 'Bearer ' + token;
    let r;
    try { r = await fetch(url, {method:'POST', headers, body:pc.localDescription.sdp}); }
    catch (e) { throw new Error('Na WHIP adresu se nejde připojit (síť nebo služba nepovoluje přístup z prohlížeče).'); }
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`WHIP server odpověděl ${r.status}${r.status === 401 || r.status === 403 ? ' – špatný klíč/token' : ''} ${t.slice(0, 120)}`); }
    const loc = r.headers.get('Location'); st.res = loc ? new URL(loc, r.url).href : null; st.token = token;
    await pc.setRemoteDescription({type:'answer', sdp:await r.text()});
    try { const p = vtr.sender.getParameters(); p.degradationPreference = 'maintain-resolution'; if (p.encodings && p.encodings[0]) p.encodings[0].maxBitrate = w.vb * 1000; await vtr.sender.setParameters(p); } catch (e) {}
    st.vsender = vtr.sender;
    pc.onconnectionstatechange = () => {
      if (R.stream !== st || st.pc !== pc) return;
      const s = pc.connectionState;
      if (s === 'connected') { setStatus('live'); stLog('WebRTC spojení navázáno ✔'); st.retries = 0; }
      if (s === 'failed' || s === 'disconnected') { stLog('Spojení ' + (s === 'failed' ? 'selhalo' : 'zakolísalo')); if (s === 'failed') whipRetry(st); else setTimeout(() => { if (st.pc === pc && pc.connectionState !== 'connected') whipRetry(st); }, 5000); }
      keepLog();
    };
  }
  async function whipClose(st) {
    const pc = st.pc; st.pc = null; if (pc) try { pc.close(); } catch (e) {}
    if (st.res) { const h = {}; if (st.token) h.Authorization = 'Bearer ' + st.token; fetch(st.res, {method:'DELETE', headers:h}).catch(() => {}); st.res = null; }
  }
  async function whipRetry(st) {
    if (st.busy || R.stream !== st) return; st.busy = true; st.retries = (st.retries || 0) + 1;
    setStatus('retry'); stLog(`Připojuji znovu (${st.retries})…`);
    await whipClose(st); await new Promise(r => setTimeout(r, Math.min(10000, 1500 * st.retries)));
    if (R.stream === st) { try { await whipConnect(st); } catch (e) { stLog(e.message); st.busy = false; if (st.retries < 30) return whipRetry(st); } }
    st.busy = false; keepLog();
  }
  async function whipPoll(st) {
    const pc = st.pc; if (!pc || !st.vsender) return;
    try {
      const rep = await st.vsender.getStats(); let o = null; rep.forEach(s => { if (s.type === 'outbound-rtp' && s.kind === 'video') o = s; });
      let rtt = null; rep.forEach(s => { if (s.type === 'remote-inbound-rtp') rtt = s.roundTripTime; });
      if (!o) return; const now = performance.now();
      const kbps = st.lastB != null ? (o.bytesSent - st.lastB) * 8 / (now - st.lastT) : 0; st.lastB = o.bytesSent; st.lastT = now;
      const lim = o.qualityLimitationReason && o.qualityLimitationReason !== 'none' ? ' · omezeno: ' + ({bandwidth:'internet', cpu:'procesor'}[o.qualityLimitationReason] || o.qualityLimitationReason) : '';
      if (pc.connectionState === 'connected') setStatus(lim ? 'warn' : 'live', `${o.frameWidth || '?'}×${o.frameHeight || '?'} · ${Math.round(o.framesPerSecond || 0)} fps · ${Math.round(kbps)} kbps${rtt != null ? ' · ping ' + Math.round(rtt * 1000) + ' ms' : ''}${lim}`);
    } catch (e) {}
  }

  /* ---------- start / stop ---------- */
  async function start(force) {
    const c = C(); if (R.stream) return;
    if (!force && CFG.gen.confirmStart && !confirm(L('Spustit vysílání?'))) return;
    const st = {mode:c.mode, relay:relayUrl(), start:performance.now(), retries:0};
    try {
      if (c.mode === 'rtmp') { st.targets = rtmpTargets(); if (!st.targets.length) throw new Error('Zapni aspoň jedno místo, kam vysílat.'); }
      if (c.mode === 'app') { st.targets = appTargets(); if (!st.targets.length) throw new Error('Zapni aspoň jedno místo, kam vysílat.'); }
    } catch (e) { showTab('stream'); return alert(e.message); }
    R.stream = st; setStatus('connecting', ''); renderTab(); updateHeader();
    try {
      if (c.mode === 'app') {
        const rec = c.app.record ? {dir:c.app.recDir || (ST.info && ST.info.videos), name:`Rezie_${stamp()}.mkv`} : null;
        await NAT.start({targets:st.targets, record:rec, vb:c.vb});
        stLog(`Nativní vysílání spuštěno → ${st.targets.map(t => t.name).join(', ')}${rec ? ' + pojistná nahrávka' : ''}`);
      }
      else if (c.mode === 'rtmp') { await rtmpStart(st); stLog(`Vysílání spuštěno → ${st.targets.map(t => t.replace(/[^/]+$/, '••••')).join(', ')}`); st.poll = setInterval(() => rtmpPoll(st), 2000); }
      else { await whipConnect(st); stLog('WHIP: nabídka přijata, navazuji spojení…'); st.poll = setInterval(() => whipPoll(st), 2000); }
    } catch (e) {
      R.stream = null; clearInterval(st.poll); if (st.pc) whipClose(st); setStatus('error', '');
      stLog('Start selhal: ' + e.message); keepLog(); renderTab(); updateHeader(); showTab('stream');
      if (c.mode === 'rtmp' && /Failed to fetch|NetworkError/i.test(e.message)) alert('Nepodařilo se spojit s přenosovým programem (' + st.relay + ').\nSpusť start-windows.bat / start-mac.command nebo „node server.js“.');
      else alert('Vysílání se nespustilo:\n' + e.message);
      return;
    }
    keepLog(); renderTab();
    AUT.emit('stream');
    if (CFG.rec.autoRec && !R.rec) { toggleRec(); st.autoRec = !!R.rec; }
  }
  async function stop(force) {
    const st0 = R.stream; if (!st0) return;
    if (!force && CFG.gen.confirmStop && !confirm(L('Opravdu ukončit vysílání?'))) return;
    const st = R.stream; if (!st) return; st.stopping = true;
    if (st.autoRec && CFG.rec.stopWithStream && R.rec) toggleRec(); R.stream = null; clearInterval(st.poll);
    if (st.mode === 'app') { await NAT.stop(); stLog('Vysílání ukončeno.'); }
    else if (st.mode === 'rtmp') {
      try { if (st.rec && st.rec.state !== 'inactive') st.rec.stop(); } catch (e) {}
      setTimeout(async () => { await st.q; try { await fetch(st.relay + '/stop', {method:'POST'}); } catch (e) {} stLog('Vysílání ukončeno.'); keepLog(); }, 700);
    } else { await whipClose(st); stLog('Vysílání ukončeno.'); }
    setStatus('off', ''); keepLog(); renderTab(); updateHeader();
  }

  // Okno spadlo nebo se načetlo znovu, ale vysílací jádro dál vysílá (záložní obraz) → navázat a vrátit program
  async function resumeIfLive() {
    let s; try { s = await NAT.state(); } catch (e) { return; }
    if (!s || !s.running || R.stream) return;
    const c = C(), st = {mode:'app', relay:relayUrl(), start:performance.now(), retries:0, targets:[], resumed:true};
    R.stream = st; setStatus('connecting', ''); updateHeader();
    try { await NAT.resume({vb:c.vb}); stLog('Režie obnovena – vysílání pokračuje (' + (s.targets || []).join(', ') + ')'); toast(L('Režie se obnovila – vysílání nepřestalo')); }
    catch (e) { R.stream = null; setStatus('error', ''); stLog('Obnovení vysílání selhalo: ' + e.message); }
    keepLog(); renderTab(); updateHeader();
  }

  function init() {
    const box = $('#tab-stream');
    box.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.id === 'stGo') return toggleStream();
      if (t.id === 'stTest') return test();
      if (t.dataset.ta === 'settings') return CFG.open('video');
      if (t.dataset.sm) { C().mode = t.dataset.sm; C().modeChosen = true; renderTab(); save(); return; }
      if (t.dataset.ta === 'recdir') { window.rzNative.pickFolder().then(p => { if (p) { C().app.recDir = p; renderTab(); save(); } }); return; }
      if (t.dataset.ta === 'recopen') { window.rzNative.openFolder(C().app.recDir || (ST.info && ST.info.videos)); return; }
      if (t.dataset.ta === 'add') { C().targets.push(newTarget('facebook')); renderTab(); save(); }
      if (t.dataset.ta === 'del') { const id = t.closest('.sttg').dataset.id; C().targets = C().targets.filter(x => x.id !== id); delete KEYS[id]; renderTab(); save(); }
    });
    box.addEventListener('input', e => {
      const el = e.target, c = C();
      if (el.dataset.tk) { const tg = c.targets.find(x => x.id === el.closest('.sttg').dataset.id); if (!tg) return;
        if (el.dataset.tk === 'key') KEYS[tg.id] = el.value; else if (el.dataset.tk === 'on') tg.on = el.checked; else if (el.dataset.tk === 'backup') tg.backup = el.checked;
        else if (el.dataset.tk === 'plat') { tg.plat = el.value; tg.url = RTMP_PLAT[el.value].url || ''; renderTab(); }
        else tg[el.dataset.tk] = el.value.trim();
        save(); return; }
      if (el.dataset.a) { c.app[el.dataset.a] = el.checked; save(); return; }
      if (el.dataset.c) { c[el.dataset.c] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(500, +el.value || 4500) : el.value.trim(); if (el.dataset.c === 'remember') renderTab(); save(); return; }
      if (el.dataset.w) { const k = el.dataset.w;
        if (k === 'token') KEYS.whip = el.value; else if (k === 'vb') c.whip.vb = Math.max(500, +el.value || 4500);
        else if (k === 'preset') { c.whip.preset = el.value; c.whip.url = WHIP_PLAT[el.value].url || ''; renderTab(); }
        else c.whip[k] = el.value.trim();
        save(); }
    });
    if (NAT.available()) {
      window.rzNative.info().then(i => { ST.info = i; if (S.tabCur === 'stream') renderTab(); }).catch(() => {});
      window.rzNative.onStatus(s => { NAT.onStatus(s); renderOuts(s); });
      window.rzNative.onLog(l => { stLog(l.replace(/^\S+\s+\S*\s*/, '')); keepLog(); });
    }
    if (NAT.available()) resumeIfLive();
    if (C().mode === 'rtmp') fetch(relayUrl() + '/status').then(r => r.json()).then(j => { ST.srv = j; if (S.tabCur === 'stream') renderTab(); }).catch(() => {});
  }
  // pro stránku Stav vysílání
  const info = () => ({live:!!R.stream, mode:R.stream ? R.stream.mode : C().mode, start:R.stream && R.stream.start, status:ST.status, stats:ST.stats, nat:R.stream && R.stream.mode === 'app' ? ST.nat : null,
    srv:R.stream && R.stream.srvStats, vb:C().vb, dests:(C().targets || []).filter(t => t.on !== false).length});
  return {load, save:save_, renderTab, init, start, stop, test, info};
})();
