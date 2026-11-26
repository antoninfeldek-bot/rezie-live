'use strict';
/* Kameraman: slyší režii, mluví po stisku tlačítka, mobil svítí jako tally jeho kamery, velké pokyny od režie */
(() => {
  const q = new URLSearchParams(location.search), K = q.get('k') || '', EN = q.get('lang') === 'en';
  const T = {'Interkom pro kameramany':'Crew intercom', 'Nasaď si sluchátka. Uslyšíš režii a můžeš jí odpovědět.':'Put on headphones. You will hear the director and can reply.', 'Tvoje jméno':'Your name',
    'Připojit se k režii':'Connect to the director', 'Připojuji…':'Connecting…', 'Režie mluví':'Director is talking', 'Moment':'Wait', 'Problém':'Problem', 'Drž a mluv s režií':'Hold to talk to the director',
    'Mluvíš…':'Talking…', 'Mikrofon trvale':'Mic always on', 'Odejít':'Leave', 'VE VYSÍLÁNÍ':'ON AIR', 'NÁHLED – připrav se':'PREVIEW – get ready', 'Připraven':'Standby',
    'Vyber svou kameru':'Choose your camera', '— vyber svou kameru —':'— choose your camera —', 'Spojení vypadlo – připojuji znovu…':'Connection lost – reconnecting…',
    'Odkaz je neplatný nebo starý. Požádej o nový.':'This link is invalid or old. Ask for a new one.', 'Prohlížeč nepovolil mikrofon.':'The browser blocked the microphone.', 'Kameraman':'Camera operator',
    'Režie teď neběží':'The director app is not running'};
  const t = s => EN && T[s] || s;
  if (EN) { document.documentElement.lang = 'en'; document.title = 'Live Director – crew'; document.querySelectorAll('[data-t]').forEach(e => { e.textContent = t(e.textContent.trim()); }); }
  const $ = s => document.querySelector(s);
  const id = (() => { try { let v = localStorage.getItem('rz-crew-id'); if (!v) { v = 'c' + Math.random().toString(36).slice(2, 12); localStorage.setItem('rz-crew-id', v); } return v; } catch (e) { return 'c' + Math.random().toString(36).slice(2, 12); } })();
  let mic = null, pc = null, es = null, leaving = false, openMic = false, retryT = 0, name = '', myCam = '', ac = null;
  try { $('#name').value = localStorage.getItem('rz-crew-name') || ''; myCam = localStorage.getItem('rz-crew-cam') || ''; } catch (e) {}
  const err = s => { const e = $('#err'); e.textContent = s; e.hidden = !s; };
  const post = (p, o) => fetch(p + '?k=' + encodeURIComponent(K), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.assign({id}, o))}).catch(() => {});
  const setMic = on => { if (mic) mic.getAudioTracks().forEach(tr => { tr.enabled = on; }); $('#ptt').classList.toggle('on', on); $('#ptt').firstChild.textContent = on ? t('Mluvíš…') : t('Drž a mluv s režií'); };
  // krátké pípnutí + vibrace u nového pokynu
  function beep() {
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.12); } catch (e) {}
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
  }
  function tally(air, pv) {
    $('#tally').className = 'ctally' + (air ? ' air' : pv ? ' pv' : '');
    $('#tstate').textContent = air ? t('VE VYSÍLÁNÍ') : pv ? t('NÁHLED – připrav se') : myCam ? t('Připraven') : t('Vyber svou kameru');
  }
  const gathered = p => new Promise(res => { if (p.iceGatheringState === 'complete') return res(); const to = setTimeout(res, 3000); p.addEventListener('icegatheringstatechange', () => { if (p.iceGatheringState === 'complete') { clearTimeout(to); res(); } }); });

  async function join() {
    name = ($('#name').value || t('Kameraman')).trim().slice(0, 40); try { localStorage.setItem('rz-crew-name', name); } catch (e) {}
    err('');
    if (!mic) { try { mic = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}}); } catch (e) { return err(t('Prohlížeč nepovolil mikrofon.')); } }
    setMic(openMic);
    $('#setup').hidden = true; $('#live').hidden = false; leaving = false; $('#tstate').textContent = t('Připojuji…');
    $('#dir').play().catch(() => {});
    if (es) es.close();
    es = new EventSource(`/c/events?k=${encodeURIComponent(K)}&id=${id}&name=${encodeURIComponent(name)}`);
    es.onopen = () => offer();
    es.onerror = () => { if (leaving) return; fetch(`/c/events?k=${encodeURIComponent(K)}`, {method:'HEAD'}).then(r => { if (r.status === 403) { leaving = true; es.close(); $('#live').hidden = true; $('#setup').hidden = false; err(t('Odkaz je neplatný nebo starý. Požádej o nový.')); } }).catch(() => {}); };
    es.onmessage = async e => {
      let d; try { d = JSON.parse(e.data); } catch (er) { return; }
      if (d.t === 'answer' && pc) { try { await pc.setRemoteDescription({type:'answer', sdp:d.sdp}); } catch (er) {} }
      else if (d.t === 'cams') {
        const sel = $('#cam'); sel.innerHTML = `<option value="">${t('— vyber svou kameru —')}</option>` + d.list.map(c => `<option value="${c.id}">${c.name.replace(/</g, '')}</option>`).join('');
        if (d.cam) myCam = d.cam;
        if (myCam && d.list.some(c => c.id === myCam)) { sel.value = myCam; if (d.cam !== myCam) post('/c/msg', {kind:'cam', cam:myCam}); } else { myCam = ''; }
        tally(false, false);
      }
      else if (d.t === 'tally') tally(d.air, d.pv);
      else if (d.t === 'talk') $('#talkIn').hidden = !d.on;
      else if (d.t === 'msg') { $('#msgT').textContent = d.text; $('#msg').hidden = false; beep(); }
    };
  }
  async function offer() {
    if (pc) try { pc.close(); } catch (e) {}
    let ice = [{urls:['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302']}];
    try { const r = await fetch('/c/config?k=' + encodeURIComponent(K)); if (r.ok) { const c = await r.json(); if (c.iceServers && c.iceServers.length) ice = c.iceServers; } } catch (e) {}
    pc = new RTCPeerConnection({iceServers:ice});
    pc.addTrack(mic.getAudioTracks()[0], mic);
    pc.ontrack = e => { $('#dir').srcObject = new MediaStream([e.track]); $('#dir').play().catch(() => {}); };
    pc.onconnectionstatechange = () => { const s = pc.connectionState; if (s === 'failed' || s === 'disconnected') retry(); if (s === 'connected') tally(false, false); };
    await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
    const r = await fetch('/c/offer?k=' + encodeURIComponent(K), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, name, sdp:pc.localDescription.sdp})});
    if (!r.ok) { $('#tstate').textContent = r.status === 503 ? t('Režie teď neběží') : await r.text(); retryT = setTimeout(offer, 4000); }
  }
  function retry() { if (leaving) return; $('#tstate').textContent = t('Spojení vypadlo – připojuji znovu…'); clearTimeout(retryT); retryT = setTimeout(join, 2500); }
  function leave() { leaving = true; clearTimeout(retryT); try { pc && pc.close(); } catch (e) {} if (es) es.close(); $('#live').hidden = true; $('#setup').hidden = false; }

  $('#join').onclick = join;
  $('#cam').onchange = e => { myCam = e.target.value; try { localStorage.setItem('rz-crew-cam', myCam); } catch (er) {} post('/c/msg', {kind:'cam', cam:myCam}); tally(false, false); };
  const ptt = $('#ptt');
  ptt.addEventListener('pointerdown', e => { e.preventDefault(); ptt.setPointerCapture(e.pointerId); if (!openMic) setMic(true); });
  const stop = () => { if (!openMic) setMic(false); };
  ptt.addEventListener('pointerup', stop); ptt.addEventListener('pointercancel', stop);
  ptt.addEventListener('contextmenu', e => e.preventDefault());
  $('#bOpen').onclick = () => { openMic = !openMic; $('#bOpen').classList.toggle('on', openMic); setMic(openMic); };
  $('#bVol').onclick = () => { const a = $('#dir'); a.muted = !a.muted; $('#bVol').classList.toggle('off', a.muted); };
  $('#bLeave').onclick = leave;
  document.querySelectorAll('[data-ack]').forEach(b => b.onclick = () => { post('/c/msg', {kind:'ack', text:b.dataset.ack}); $('#msg').hidden = true; });
  // obrazovka nesmí zhasnout (mobil slouží jako tally)
  let lock = null;
  const awake = async () => { try { if (!lock && navigator.wakeLock && !document.hidden) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) {} };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) awake(); });
  $('#join').addEventListener('click', awake);
})();
