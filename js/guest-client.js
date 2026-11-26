'use strict';
/* Host Režie Live: kamera + mikrofon z mobilu / počítače přímo do režie (WebRTC), zpátky vidí program a slyší ostatní */
(() => {
  const q = new URLSearchParams(location.search), K = q.get('k') || '', EN = q.get('lang') === 'en';
  const T = {'Připojení do vysílání':'Join the broadcast', 'Režie tě uvidí a uslyší. Ideálně použij sluchátka.':'The director will see and hear you. Headphones are best.',
    '📷 Povolit kameru a mikrofon':'📷 Allow camera and microphone', 'Tvoje jméno':'Your name', 'Kamera':'Camera', 'Mikrofon':'Microphone', 'Kvalita':'Quality', 'Připojit se':'Join', 'Odejít':'Leave',
    'Připojuji…':'Connecting…', 'Připojeno – čekáš v režii':'Connected – waiting in the studio', '● JSI VE VYSÍLÁNÍ':'● YOU ARE LIVE', 'V náhledu – za chvíli jdeš do vysílání':'In preview – you go live soon',
    'Spojení vypadlo – připojuji znovu…':'Connection lost – reconnecting…', 'Režie tě odpojila. Díky!':'The director disconnected you. Thanks!', 'Odkaz je neplatný nebo starý. Požádej o nový.':'This link is invalid or old. Ask for a new one.',
    'Prohlížeč nepovolil kameru. Povol ji v nastavení prohlížeče a načti stránku znovu.':'The browser blocked the camera. Allow it in browser settings and reload.',
    'Kamera v prohlížeči jde jen přes zabezpečené spojení (https).':'Camera in the browser only works over a secure connection (https).', 'Režie teď neběží':'The director app is not running', 'Host':'Guest',
    'Bez kamery':'No camera'};
  const t = s => EN && T[s] || s;
  if (EN) { document.documentElement.lang = 'en'; document.querySelectorAll('[data-t]').forEach(e => { e.textContent = t(e.textContent.trim()); }); document.title = 'Live Director – join as guest'; }
  const $ = s => document.querySelector(s);
  const id = (() => { try { let v = localStorage.getItem('rz-guest-id'); if (!v) { v = 'g' + Math.random().toString(36).slice(2, 12); localStorage.setItem('rz-guest-id', v); } return v; } catch (e) { return 'g' + Math.random().toString(36).slice(2, 12); } })();
  let stream = null, pc = null, es = null, leaving = false, retryT = 0, discT = 0;
  const err = s => { const e = $('#err'); e.textContent = s; e.hidden = !s; };
  const state = (s, cls) => { const g = $('#gstate'); g.textContent = s; g.className = 'gstate ' + (cls || ''); };
  try { $('#name').value = localStorage.getItem('rz-guest-name') || ''; } catch (e) {}
  if (!window.isSecureContext) err(t('Kamera v prohlížeči jde jen přes zabezpečené spojení (https).'));

  async function getMedia() {
    const h = +$('#q').value || 720, cam = $('#cam').value, mic = $('#mic').value;
    const v = cam === 'none' ? false : {deviceId:cam ? {exact:cam} : undefined, width:{ideal:Math.round(h * 16 / 9)}, height:{ideal:h}, frameRate:{ideal:30}};
    const st = await navigator.mediaDevices.getUserMedia({video:v, audio:{deviceId:mic ? {exact:mic} : undefined, echoCancellation:true, noiseSuppression:true, autoGainControl:true}});
    if (stream) stream.getTracks().forEach(x => x.stop());
    stream = st; $('#self').srcObject = st; $('#selfLive').srcObject = st;
  }
  async function listDevices() {
    const ds = await navigator.mediaDevices.enumerateDevices();
    const fill = (sel, kind, none) => { const cur = stream && stream.getTracks().find(x => x.kind === kind.replace('input', '')); const cid = cur && cur.getSettings().deviceId;
      sel.innerHTML = ds.filter(d => d.kind === kind).map((d, i) => `<option value="${d.deviceId}" ${d.deviceId === cid ? 'selected' : ''}>${(d.label || kind + ' ' + (i + 1)).replace(/</g, '')}</option>`).join('') + (none ? `<option value="none">${t('Bez kamery')}</option>` : ''); };
    fill($('#cam'), 'videoinput', true); fill($('#mic'), 'audioinput');
  }
  $('#allow').onclick = async () => {
    err('');
    try { stream = await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280}, height:{ideal:720}}, audio:true}); $('#self').srcObject = stream; }
    catch (e) { try { stream = await navigator.mediaDevices.getUserMedia({audio:true}); } catch (e2) { return err(t('Prohlížeč nepovolil kameru. Povol ji v nastavení prohlížeče a načti stránku znovu.')); } }
    await listDevices(); $('#allow').hidden = true; $('#form').hidden = false;
  };
  $('#cam').onchange = $('#mic').onchange = $('#q').onchange = () => getMedia().catch(e => err(e.message));

  const gathered = p => new Promise(res => { if (p.iceGatheringState === 'complete') return res(); const to = setTimeout(res, 2500); p.addEventListener('icegatheringstatechange', () => { if (p.iceGatheringState === 'complete') { clearTimeout(to); res(); } }); });
  async function join() {
    const name = ($('#name').value || t('Host')).trim().slice(0, 40); try { localStorage.setItem('rz-guest-name', name); } catch (e) {}
    $('#setup').hidden = true; $('#live').hidden = false; state(t('Připojuji…')); err(''); leaving = false;
    if (es) es.close();
    es = new EventSource(`/g/events?k=${encodeURIComponent(K)}&id=${id}&name=${encodeURIComponent(name)}`);
    es.onerror = () => { if (leaving) return; fetch(`/g/events?k=${encodeURIComponent(K)}&id=x`, {method:'HEAD'}).then(r => { if (r.status === 403) { leaving = true; es.close(); err(t('Odkaz je neplatný nebo starý. Požádej o nový.')); } }).catch(() => {}); };
    es.onmessage = async e => {
      let d; try { d = JSON.parse(e.data); } catch (er) { return; }
      if (d.t === 'answer' && pc) { try { await pc.setRemoteDescription({type:'answer', sdp:d.sdp}); } catch (er) { err(er.message); } }
      else if (d.t === 'tally') { $('#tally').className = 'tally' + (d.air ? ' air' : d.pv ? ' pv' : ''); state(d.air ? t('● JSI VE VYSÍLÁNÍ') : d.pv ? t('V náhledu – za chvíli jdeš do vysílání') : t('Připojeno – čekáš v režii'), d.air ? 'air' : d.pv ? 'pv' : ''); }
      else if (d.t === 'bye') { leave(t('Režie tě odpojila. Díky!')); }
    };
    es.onopen = () => offer(name);
  }
  async function offer(name) {
    if (pc) try { pc.close(); } catch (e) {}
    pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    const vt = stream.getVideoTracks()[0], at = stream.getAudioTracks()[0];
    if (vt) { vt.contentHint = 'motion'; pc.addTrack(vt, stream); } else pc.addTransceiver('video', {direction:'recvonly'});
    if (at) pc.addTrack(at, stream); else pc.addTransceiver('audio', {direction:'recvonly'});
    const ret = new MediaStream();
    pc.ontrack = e => { ret.addTrack(e.track); $('#ret').srcObject = ret; $('#ret').play().catch(() => {}); };
    pc.onconnectionstatechange = () => {
      const cs = pc.connectionState; clearTimeout(discT);
      if (cs === 'connected') state(t('Připojeno – čekáš v režii'));
      if (cs === 'disconnected') discT = setTimeout(() => retry(name), 5000);
      if (cs === 'failed') retry(name);
    };
    const o = await pc.createOffer(); await pc.setLocalDescription(o); await gathered(pc);
    try { const s = pc.getSenders().find(x => x.track && x.track.kind === 'video'); if (s) { const p = s.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}]; p.encodings[0].maxBitrate = (+$('#q').value >= 1080 ? 5000 : 2500) * 1000; await s.setParameters(p); } } catch (e) {}
    const r = await fetch('/g/offer?k=' + encodeURIComponent(K), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, name, sdp:pc.localDescription.sdp})});
    if (!r.ok) { const x = await r.text(); err(r.status === 503 ? t('Režie teď neběží') : x); retryT = setTimeout(() => offer(name), 4000); }
  }
  function retry(name) { if (leaving) return; state(t('Spojení vypadlo – připojuji znovu…'), 'warn'); clearTimeout(retryT); retryT = setTimeout(() => join(), 2500); }
  function leave(text) {
    leaving = true; clearTimeout(retryT); clearTimeout(discT);
    try { pc && pc.close(); } catch (e) {} pc = null; if (es) es.close();
    $('#tally').className = 'tally'; $('#live').hidden = true; $('#setup').hidden = false; err(text || '');
  }
  $('#join').onclick = () => { if (!stream) return; join(); };
  $('#bLeave').onclick = () => leave('');
  $('#bMic').onclick = () => { const a = stream.getAudioTracks()[0]; if (!a) return; a.enabled = !a.enabled; $('#bMic').classList.toggle('off', !a.enabled); };
  $('#bCam').onclick = () => { const v = stream.getVideoTracks()[0]; if (!v) return; v.enabled = !v.enabled; $('#bCam').classList.toggle('off', !v.enabled); };
  $('#bSnd').onclick = () => { const r = $('#ret'); r.muted = !r.muted; $('#bSnd').classList.toggle('off', r.muted); };
  window.addEventListener('pagehide', () => { leaving = true; try { pc && pc.close(); } catch (e) {} });
})();
