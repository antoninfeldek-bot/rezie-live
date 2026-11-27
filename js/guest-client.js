'use strict';
/* Host Režie Live: kamera + mikrofon z mobilu / počítače přímo do režie (WebRTC), zpátky vidí program a slyší ostatní */
(() => {
  const q = new URLSearchParams(location.search), K = q.get('k') || '', EN = q.get('lang') === 'en', CAM = q.get('cam') === '1';
  const T = {'Připojení do vysílání':'Join the broadcast', 'Režie tě uvidí a uslyší. Ideálně použij sluchátka.':'The director will see and hear you. Headphones are best.',
    '📷 Povolit kameru a mikrofon':'📷 Allow camera and microphone', 'Tvoje jméno':'Your name', 'Kamera':'Camera', 'Mikrofon':'Microphone', 'Kvalita':'Quality', 'Připojit se':'Join', 'Odejít':'Leave',
    'Připojuji…':'Connecting…', 'Připojeno – čekáš v režii':'Connected – waiting in the studio', '● JSI VE VYSÍLÁNÍ':'● YOU ARE LIVE', 'V náhledu – za chvíli jdeš do vysílání':'In preview – you go live soon',
    'Spojení vypadlo – připojuji znovu…':'Connection lost – reconnecting…', 'Režie tě odpojila. Díky!':'The director disconnected you. Thanks!', 'Odkaz je neplatný nebo starý. Požádej o nový.':'This link is invalid or old. Ask for a new one.',
    'Prohlížeč nepovolil kameru. Povol ji v nastavení prohlížeče a načti stránku znovu.':'The browser blocked the camera. Allow it in browser settings and reload.',
    'Kamera v prohlížeči jde jen přes zabezpečené spojení (https).':'Camera in the browser only works over a secure connection (https).', 'Režie teď neběží':'The director app is not running', 'Host':'Guest',
    'Bez kamery':'No camera', 'Mobil jako kamera':'Phone as a camera', 'Obraz jde rovnou do režie v plné kvalitě. Zpátky nic nepřichází – šetří to baterii i síť. Mobil dej na stativ a nech ho připojený na nabíječce.':'Video goes straight to the director in full quality. Nothing comes back – saves battery and network. Put the phone on a tripod and keep it charging.', 'Název kamery':'Camera name', 'Snímků za sekundu':'Frames per second', 'Zoom':'Zoom', 'Bez mikrofonu':'No microphone', 'Kamera':'Camera', '📷 Povolit kameru':'📷 Allow camera', 'Nedaří se spojit obraz se režií – tvoje síť (nebo síť režie) blokuje přímé spojení. Zkus jinou síť (Wi-Fi ↔ mobilní data), nebo ať režie zapne TURN server.':'Can’t connect video to the director – your network (or the director’s) blocks direct connections. Try another network (Wi-Fi ↔ mobile data), or ask the director to turn on a TURN server.', 'nedaří se spojit (síť blokuje) – zapni TURN':'can’t connect (network blocks it) – turn on TURN', 'Režie ti mluví do sluchátek':'The director is talking in your headphones', 'Moment':'Wait', 'Problém':'Problem'};
  const t = s => EN && T[s] || s;
  if (EN) { document.documentElement.lang = 'en'; document.querySelectorAll('[data-t]').forEach(e => { e.textContent = t(e.textContent.trim()); }); document.title = 'Live Director – join as guest'; }
  const $ = s => document.querySelector(s);
  if (CAM) {   // 📱 režim „mobil jako kamera“: jen odesílá, plná kvalita, zadní kamera, bez zpětného obrazu a zvuku
    document.body.classList.add('cammode');
    const h1 = $('#setup h1 span'); if (h1) h1.textContent = t('Mobil jako kamera');
    const p = $('#setup > p.dim'); if (p) p.textContent = t('Obraz jde rovnou do režie v plné kvalitě. Zpátky nic nepřichází – šetří to baterii i síť. Mobil dej na stativ a nech ho připojený na nabíječce.');
    const nl = $('#name') && $('#name').previousElementSibling; if (nl) nl.textContent = t('Název kamery');
    $('#q').innerHTML = '<option value="1080">1080p</option><option value="720">720p</option><option value="1440">1440p</option><option value="2160">4K (2160p)</option>';
    $('#fpsL').hidden = false; $('#allow').textContent = t('📷 Povolit kameru'); $('#self').classList.remove('mirror'); $('#selfLive').classList.remove('mirror');
    $('#bSnd').hidden = true; $('#ret').hidden = true;
  }
  const id = (() => { try { let v = localStorage.getItem('rz-guest-id'); if (!v) { v = 'g' + Math.random().toString(36).slice(2, 12); localStorage.setItem('rz-guest-id', v); } return v; } catch (e) { return 'g' + Math.random().toString(36).slice(2, 12); } })();
  let stream = null, pc = null, leaving = false, retryT = 0, discT = 0, gen = 0, connT = 0;
  let sess = '';   // jedno připojení (nové při každém „Připojit se“)
  const err = s => { const e = $('#err'); e.textContent = s; e.hidden = !s; };
  const state = (s, cls) => { const g = $('#gstate'); g.textContent = s; g.className = 'gstate ' + (cls || ''); };
  try { $('#name').value = localStorage.getItem('rz-guest-name') || ''; } catch (e) {}
  if (!window.isSecureContext) err(t('Kamera v prohlížeči jde jen přes zabezpečené spojení (https).'));

  async function getMedia() {
    const h = +$('#q').value || 720, cam = $('#cam').value, mic = $('#mic').value;
    const fps = CAM ? (+$('#fps').value || 30) : 30;
    const v = cam === 'none' ? false : {deviceId:cam ? {exact:cam} : undefined, facingMode:!cam && CAM ? 'environment' : undefined, width:{ideal:Math.round(h * 16 / 9)}, height:{ideal:h}, frameRate:{ideal:fps}};
    // kamera: zvuk bez úprav (čistý zvuk prostředí); host: potlačení ozvěny a šumu
    const raw = CAM, a = mic === 'none' ? false : {deviceId:mic ? {exact:mic} : undefined, echoCancellation:!raw, noiseSuppression:!raw, autoGainControl:!raw};
    const st = await navigator.mediaDevices.getUserMedia({video:v, audio:a});
    if (stream) stream.getTracks().forEach(x => x.stop());
    stream = st; $('#self').srcObject = st; $('#selfLive').srcObject = st; camCaps();
  }
  async function listDevices() {
    const ds = await navigator.mediaDevices.enumerateDevices();
    const fill = (sel, kind, none) => { const cur = stream && stream.getTracks().find(x => x.kind === kind.replace('input', '')); const cid = cur && cur.getSettings().deviceId;
      sel.innerHTML = ds.filter(d => d.kind === kind).map((d, i) => `<option value="${d.deviceId}" ${d.deviceId === cid ? 'selected' : ''}>${(d.label || kind + ' ' + (i + 1)).replace(/</g, '')}</option>`).join('') + (none ? `<option value="none">${t('Bez kamery')}</option>` : ''); };
    fill($('#cam'), 'videoinput', !CAM); fill($('#mic'), 'audioinput');
    if (CAM) $('#mic').insertAdjacentHTML('beforeend', `<option value="none">${t('Bez mikrofonu')}</option>`);
  }
  $('#allow').onclick = async () => {
    err('');
    try { stream = await navigator.mediaDevices.getUserMedia({video:CAM ? {facingMode:'environment', width:{ideal:1920}, height:{ideal:1080}} : {width:{ideal:1280}, height:{ideal:720}}, audio:CAM ? {echoCancellation:false, noiseSuppression:false, autoGainControl:false} : true}); $('#self').srcObject = stream; camCaps(); }
    catch (e) { try { stream = await navigator.mediaDevices.getUserMedia({audio:true}); } catch (e2) { return err(t('Prohlížeč nepovolil kameru. Povol ji v nastavení prohlížeče a načti stránku znovu.')); } }
    await listDevices(); $('#allow').hidden = true; $('#form').hidden = false;
  };
  $('#cam').onchange = $('#mic').onchange = $('#q').onchange = $('#fps').onchange = () => getMedia().catch(e => err(e.message));

  const gathered = p => new Promise(res => { if (p.iceGatheringState === 'complete') return res(); const to = setTimeout(res, 3000); p.addEventListener('icegatheringstatechange', () => { if (p.iceGatheringState === 'complete') { clearTimeout(to); res(); } }); });
  function preferH264(tr) {
    try { const caps = RTCRtpSender.getCapabilities('video'); if (!caps || !tr.setCodecPreferences) return;
      const h = caps.codecs.filter(c => /h264/i.test(c.mimeType)), o = caps.codecs.filter(c => !/h264/i.test(c.mimeType)); if (h.length) tr.setCodecPreferences([...h, ...o]); } catch (e) {}
  }
  // zoom a světlo (jen když je mobil umí)
  function camCaps() {
    if (!CAM || !stream) return; const vt = stream.getVideoTracks()[0]; if (!vt || !vt.getCapabilities) return;
    const c = vt.getCapabilities(), st = vt.getSettings(), z = $('#zoom');
    $('#camCtl').hidden = !(c.zoom || c.torch);
    if (c.zoom) { z.min = c.zoom.min; z.max = c.zoom.max; z.step = c.zoom.step || 0.1; z.value = st.zoom || c.zoom.min; z.parentElement.hidden = false; } else z.parentElement.hidden = true;
    $('#bTorch').hidden = !c.torch;
  }
  $('#zoom').oninput = e => { const vt = stream && stream.getVideoTracks()[0]; if (vt) vt.applyConstraints({advanced:[{zoom:+e.target.value}]}).catch(() => {}); };
  let torch = false;
  $('#bTorch').onclick = () => { const vt = stream && stream.getVideoTracks()[0]; if (!vt) return; torch = !torch; vt.applyConstraints({advanced:[{torch}]}).catch(() => {}); $('#bTorch').classList.toggle('on', torch); };
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator) { wake = await navigator.wakeLock.request('screen'); } } catch (e) {} }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && $('#live') && !$('#live').hidden) keepAwake(); });
  async function join() {
    keepAwake();
    const name = ($('#name').value || t('Host')).trim().slice(0, 40); try { localStorage.setItem('rz-guest-name', name); } catch (e) {}
    $('#setup').hidden = true; $('#live').hidden = false; state(t('Připojuji…')); err(''); leaving = false;
    const my = ++gen; let first = true, fails = 0; sess = Math.random().toString(36).slice(2, 10);
    // zprávy od režie: dotaz čeká na serveru, dokud něco nepřijde (projde i tunelem přes internet)
    while (!leaving && my === gen) {
      let msgs;
      try {
        const r = await fetch(`/g/poll?k=${encodeURIComponent(K)}&id=${id}&s=${sess}&name=${encodeURIComponent(name)}`, {cache:'no-store'});
        if (r.status === 403) { leave(t('Odkaz je neplatný nebo starý. Požádej o nový.')); return; }
        if (!r.ok) throw new Error(r.status);
        msgs = await r.json(); fails = 0;
      } catch (e) { if (++fails > 2) state(t('Spojení vypadlo – připojuji znovu…'), 'warn'); await new Promise(r => setTimeout(r, 2000)); continue; }
      if (first) { first = false; offer(name).catch(e => err(e.message)); }
      for (const d of msgs) await onMsg(d);
    }
  }
  async function onMsg(d) {
    if (d.t === 'answer' && pc) { try { await pc.setRemoteDescription({type:'answer', sdp:d.sdp}); } catch (er) { err(er.message); } }
    else if (d.t === 'tally') { $('#tally').className = 'tally' + (d.air ? ' air' : d.pv ? ' pv' : ''); state(d.air ? t('● JSI VE VYSÍLÁNÍ') : d.pv ? t('V náhledu – za chvíli jdeš do vysílání') : t('Připojeno – čekáš v režii'), d.air ? 'air' : d.pv ? 'pv' : ''); }
    else if (d.t === 'bye') { leave(t('Režie tě odpojila. Díky!')); }
    else if (d.t === 'talk') $('#gtalk').hidden = !d.on;
    else if (d.t === 'msg') { $('#gmsgT').textContent = d.text; $('#gmsg').hidden = false; if (navigator.vibrate) navigator.vibrate([80, 60, 80]); }
  }
  async function offer(name) {
    if (pc) try { pc.close(); } catch (e) {}
    let ice = [{urls:['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302']}];
    try { const r = await fetch('/g/config?k=' + encodeURIComponent(K)); if (r.ok) { const c = await r.json(); if (c.iceServers && c.iceServers.length) ice = c.iceServers; } } catch (e) {}
    pc = new RTCPeerConnection({iceServers:ice});
    const vt = stream.getVideoTracks()[0], at = stream.getAudioTracks()[0];
    if (CAM) {
      // jen odesílat; H.264 má přednost (hardware v mobilu i v Macu = méně zátěže a nižší zpoždění)
      if (vt) { vt.contentHint = 'motion'; const tr = pc.addTransceiver(vt, {direction:'sendonly', streams:[stream]}); preferH264(tr); }
      if (at) pc.addTransceiver(at, {direction:'sendonly', streams:[stream]});
    } else {
      if (vt) { vt.contentHint = 'motion'; pc.addTrack(vt, stream); } else pc.addTransceiver('video', {direction:'recvonly'});
      if (at) pc.addTrack(at, stream); else pc.addTransceiver('audio', {direction:'recvonly'});
    }
    const ret = new MediaStream();
    pc.ontrack = e => { ret.addTrack(e.track); $('#ret').srcObject = ret; $('#ret').play().catch(() => {}); };
    clearTimeout(connT);
    connT = setTimeout(() => { if (pc && pc.connectionState !== 'connected') { err(t('Nedaří se spojit obraz se režií – tvoje síť (nebo síť režie) blokuje přímé spojení. Zkus jinou síť (Wi-Fi ↔ mobilní data), nebo ať režie zapne TURN server.')); fetch('/g/msg?k=' + encodeURIComponent(K), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, text:'⚠ ' + t('nedaří se spojit (síť blokuje) – zapni TURN')})}).catch(() => {}); } }, 15000);
    pc.onconnectionstatechange = () => {
      const cs = pc.connectionState; clearTimeout(discT);
      if (cs === 'connected') { clearTimeout(connT); err(''); state(t('Připojeno – čekáš v režii')); }
      if (cs === 'disconnected') discT = setTimeout(() => retry(name), 5000);
      if (cs === 'failed') retry(name);
    };
    const o = await pc.createOffer(); await pc.setLocalDescription(o); await gathered(pc);
    try { const s = pc.getSenders().find(x => x.track && x.track.kind === 'video'); if (s) { const p = s.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}]; const hq = +$('#q').value || 720;
      p.encodings[0].maxBitrate = CAM ? ({720:5e6, 1080:10e6, 1440:16e6, 2160:25e6}[hq] || 8e6) : ({480:800e3, 720:1500e3, 1080:3000e3}[hq] || 1500e3);
      if (CAM) { p.encodings[0].maxFramerate = +$('#fps').value || 30; p.degradationPreference = 'maintain-framerate'; }
      await s.setParameters(p); } } catch (e) {}
    const r = await fetch('/g/offer?k=' + encodeURIComponent(K), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, name, sdp:pc.localDescription.sdp, cam:CAM})});
    if (!r.ok) { const x = await r.text(); err(r.status === 503 ? t('Režie teď neběží') : x); retryT = setTimeout(() => offer(name), 4000); }
  }
  function retry(name) { if (leaving) return; state(t('Spojení vypadlo – připojuji znovu…'), 'warn'); clearTimeout(retryT); retryT = setTimeout(() => offer(name).catch(() => {}), 2500); }
  function leave(text) {
    leaving = true; gen++; clearTimeout(retryT); clearTimeout(discT); clearTimeout(connT);
    try { pc && pc.close(); } catch (e) {} pc = null;
    fetch('/g/leave?k=' + encodeURIComponent(K), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}), keepalive:true}).catch(() => {});
    $('#tally').className = 'tally'; $('#live').hidden = true; $('#setup').hidden = false; err(text || '');
  }
  $('#join').onclick = () => { if (!stream) return; join(); };
  $('#bLeave').onclick = () => leave('');
  $('#bMic').onclick = () => { const a = stream.getAudioTracks()[0]; if (!a) return; a.enabled = !a.enabled; $('#bMic').classList.toggle('off', !a.enabled); };
  $('#bCam').onclick = () => { const v = stream.getVideoTracks()[0]; if (!v) return; v.enabled = !v.enabled; $('#bCam').classList.toggle('off', !v.enabled); };
  $('#bSnd').onclick = () => { const r = $('#ret'); r.muted = !r.muted; $('#bSnd').classList.toggle('off', r.muted); };
  document.querySelectorAll('[data-ack]').forEach(b => b.onclick = () => { fetch('/g/msg?k=' + encodeURIComponent(K), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, text:b.dataset.ack})}).catch(() => {}); $('#gmsg').hidden = true; });
  window.addEventListener('pagehide', () => { leaving = true; try { pc && pc.close(); } catch (e) {} });
})();
