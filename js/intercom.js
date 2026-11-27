'use strict';
/* ================= INTERKOM: režie ↔ kameramani a pokyny pro hosta =================
   – režie mluví vlastním mikrofonem (NEJDE do vysílání) jen tomu, komu drží tlačítko „Mluvit“
   – kameraman slyší režii ve sluchátkách, může odpovědět, mobil mu svítí jako tally jeho kamery
   – hostovi jde hlas režie do sluchátek (program se mu na tu chvíli ztlumí), divák nic neslyší
   – textové pokyny velkým písmem + odpovědi 👍 / ⏳ / ❌ */
const ICM = (() => {
  const CREW = new Map();   // id → {pc, name, cam, talkG, dest, inG, an, air, pv, aEl, ok}
  const ST = {mic:null, src:null, bus:null, out:null, dev:'', talking:new Set(), log:[], open:false, keyHeld:false};
  const QUICK_CREW = ['🔴 Za 5 s jdeš do vysílání', '🔍 Přibliž', '🔭 Oddal', '🎯 Zaostři', '⬅ Doleva', '➡ Doprava', '⬆ Nahoru', '⬇ Dolů', '✋ Drž záběr', '✅ Volný – můžeš se přesunout'];
  const QUICK_GUEST = ['⏱ Za 10 s jsi ve vysílání', '🔴 Jsi ve vysílání', '📷 Dívej se do kamery', '🔊 Mluv hlasitěji', '🎧 Nasaď si sluchátka', '💡 Posuň se ke světlu', '⏳ Chvilku počkej', '✅ Výborně, díky!'];
  const post = (path, o) => fetch(REM.base() + path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(o)}).catch(() => {});
  const log = (t) => { const d = new Date(); ST.log.unshift(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '  ' + t); ST.log.length = Math.min(ST.log.length, 12); if (ST.open) renderLog(); };

  /* ---------- mikrofon režie (zvlášť, nejde do programu) ---------- */
  async function ensureMic() {
    if (ST.src) return true;
    try {
      ST.mic = await navigator.mediaDevices.getUserMedia({audio:{deviceId:ST.dev ? {exact:ST.dev} : undefined, echoCancellation:true, noiseSuppression:true, autoGainControl:true}});
      ST.src = actx.createMediaStreamSource(ST.mic); ST.bus = actx.createGain(); ST.src.connect(ST.bus);
      return true;
    } catch (e) { toast(L('Mikrofon pro interkom nejde zapnout:') + ' ' + e.message); return false; }
  }
  async function setDev(id) {
    ST.dev = id; try { localStorage.setItem('rezie-icom-mic', id); } catch (e) {}
    if (ST.mic) { ST.mic.getTracks().forEach(t => t.stop()); try { ST.src.disconnect(); } catch (e) {} ST.src = null; const old = ST.bus; await ensureMic(); old && CREW.forEach(c => { try { ST.bus.connect(c.talkG); } catch (e) {} }); REM.guests().forEach(g => { if (g.talkG) try { ST.bus.connect(g.talkG); } catch (e) {} }); }
  }
  const output = () => { if (!ST.out) { ST.out = actx.createGain(); ST.out.connect(actx.destination); } return ST.out; };   // odpovědi kameramanů → sluchátka režie

  /* ---------- mluvení (push-to-talk) ---------- */
  function guestTalkNode(g) {
    if (!g.talkG) { g.talkG = actx.createGain(); g.talkG.gain.value = 0; g.talkG.connect(g.mmDest); if (ST.bus) ST.bus.connect(g.talkG); }
    return g.talkG;
  }
  async function talk(target, on) {   // target: 'crew' (všichni kameramani) | 'c:<id>' | 'g:<id>'
    if (on && !(await ensureMic())) return;
    const t = actx.currentTime;
    const crewT = target === 'crew' ? [...CREW.keys()] : target.startsWith('c:') ? [target.slice(2)] : [];
    for (const id of crewT) { const c = CREW.get(id); if (!c) continue; if (on && ST.bus) try { ST.bus.connect(c.talkG); } catch (e) {} c.talkG.gain.setTargetAtTime(on ? 1 : 0, t, 0.02); post('/lan/crew/' + id, {t:'talk', on}); }
    if (target.startsWith('g:')) {
      const id = target.slice(2), g = REM.guests().get(id);
      if (g && g.mm) { const n = guestTalkNode(g); if (on && ST.bus) try { ST.bus.connect(n); } catch (e) {} n.gain.setTargetAtTime(on ? 1 : 0, t, 0.02); g.mm.gain.setTargetAtTime(on ? 0.25 : 1, t, 0.05); post('/lan/guest/' + id, {t:'talk', on}); }
    }
    if (on) ST.talking.add(target); else ST.talking.delete(target);
    document.querySelectorAll(`#icom [data-ptt="${CSS.escape(target)}"]`).forEach(b => b.classList.toggle('on', on));
    const hb = $('#bIcom'); if (hb) hb.classList.toggle('talk', ST.talking.size > 0);
  }
  function message(target, text) {
    text = String(text || '').trim().slice(0, 200); if (!text) return;
    const ids = target === 'crew' ? [...CREW.keys()].map(i => 'c:' + i) : [target];
    for (const t of ids) {
      if (t.startsWith('c:')) post('/lan/crew/' + t.slice(2), {t:'msg', text});
      else if (t.startsWith('g:')) post('/lan/guest/' + t.slice(2), {t:'msg', text});
    }
    log('➜ ' + nameOf(target) + ': ' + text);
  }
  const nameOf = t => t === 'crew' ? L('Všichni kameramani') : t.startsWith('c:') ? (CREW.get(t.slice(2)) || {}).name || '?' : t.startsWith('g:') ? ((REM.guests().get(t.slice(2)) || {}).s || {}).name || '?' : t;

  /* ---------- připojení kameramana (WebRTC, jen zvuk) ---------- */
  async function crewOffer(d) {
    closeCrew(d.id, true);
    const c = {name:d.name, cam:'', air:null, pv:null, lvl:0};
    CREW.set(d.id, c);
    c.talkG = actx.createGain(); c.talkG.gain.value = 0; c.dest = actx.createMediaStreamDestination(); c.talkG.connect(c.dest);
    if (ST.bus) ST.bus.connect(c.talkG);
    const pc = new RTCPeerConnection({iceServers:await REM.iceList()}); c.pc = pc;
    pc.ontrack = e => {
      if (e.track.kind !== 'audio') return;
      c.aEl = new Audio(); c.aEl.muted = true; c.aEl.srcObject = new MediaStream([e.track]); c.aEl.play().catch(() => {});
      const s = actx.createMediaStreamSource(new MediaStream([e.track]));
      c.inG = actx.createGain(); c.an = actx.createAnalyser(); c.an.fftSize = 512; s.connect(c.inG); c.inG.connect(c.an); c.inG.connect(output());
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { c.ok = true; toast(`🎥 ${c.name} ${L('je na interkomu')}`); render(); sendCams(d.id); }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { if (CREW.get(d.id) === c) closeCrew(d.id); }
    };
    await pc.setRemoteDescription({type:'offer', sdp:d.sdp});
    for (const tr of pc.getTransceivers()) if (tr.receiver.track && tr.receiver.track.kind === 'audio') { tr.direction = 'sendrecv'; await tr.sender.replaceTrack(c.dest.stream.getAudioTracks()[0]); break; }
    await pc.setLocalDescription(await pc.createAnswer());
    await REM.gathered(pc);
    await post('/lan/crew/' + d.id, {t:'answer', sdp:pc.localDescription.sdp});
    render();
  }
  function closeCrew(id, quiet) {
    const c = CREW.get(id); if (!c) return; CREW.delete(id);
    try { c.pc && c.pc.close(); } catch (e) {} try { c.inG && c.inG.disconnect(); } catch (e) {} try { c.talkG.disconnect(); } catch (e) {}
    if (c.aEl) c.aEl.srcObject = null;
    if (!quiet) { toast(`🎥 ${c.name} ${L('odešel z interkomu')}`); render(); }
  }
  const cams = () => S.sources.filter(s => s.type === 'camera' || s.type === 'guest' || s.type === 'screen').map(s => ({id:s.id, name:s.name}));
  function sendCams(id) { const l = cams(), ids = id ? [id] : [...CREW.keys()]; ids.forEach(i => post('/lan/crew/' + i, {t:'cams', list:l, cam:(CREW.get(i) || {}).cam || ''})); }
  function onMsg(d) {
    if (d.t === 'crewOffer') crewOffer(d).catch(e => { HLT.note('Interkom: ' + e.message); });
    else if (d.t === 'crewLeave') closeCrew(d.id);
    else if (d.t === 'crewMsg') {
      const c = CREW.get(d.id); if (!c) return;
      if (d.kind === 'cam') { c.cam = d.cam; c.air = null; render(); return; }
      log('🎥 ' + c.name + ': ' + d.text); toast(`🎥 ${c.name}: ${d.text}`);
    }
    else if (d.t === 'guestMsg') { const g = REM.guests().get(d.id); const n = g ? g.s.name : L('Host'); log('👤 ' + n + ': ' + d.text); toast(`👤 ${n}: ${d.text}`); }
  }
  // tally kameramanů + měřáky (každých 250 ms)
  let camKey = '';
  function tick() {
    if (ST.open) REM.guests().forEach((g, id) => { const d = document.querySelector(`#icom [data-tl="g:${CSS.escape(id)}"]`); if (d) d.className = 'tl ' + (g.air ? 'air' : g.pv ? 'pv' : ''); });
    if (!CREW.size) return;
    const onAir = onAirSet(), inPv = sceneSources(prevScene(), new Set());
    CREW.forEach((c, id) => {
      const air = !!c.cam && onAir.has(c.cam), pv = !!c.cam && inPv.has(c.cam);
      if (air !== c.air || pv !== c.pv) { c.air = air; c.pv = pv; post('/lan/crew/' + id, {t:'tally', air, pv}); const d = document.querySelector(`#icom [data-tl="c:${CSS.escape(id)}"]`); if (d) d.className = 'tl ' + (air ? 'air' : pv ? 'pv' : ''); }
      if (c.an && ST.open) { const p = peak(c.an), el = document.querySelector(`#icom [data-lv="${CSS.escape(id)}"]`); if (el) el.style.width = Math.round(clamp((20 * Math.log10(p || 1e-5) + 60) / 60, 0, 1) * 100) + '%'; }
    });
    const k = cams().map(x => x.id + x.name).join('|'); if (k !== camKey) { camKey = k; sendCams(); }
  }

  /* ---------- panel ---------- */
  function open() { if (POP.hasId('icom')) { POP.open('icom'); return; } ST.open = true; let p = $('#icom'); if (!p) { p = document.createElement('div'); p.id = 'icom'; p.className = 'icom'; document.body.appendChild(p); bind(p); } p.hidden = false; render(); listMics(); }
  function close() { if (POP.hasId('icom')) { POP.close('icom'); return; } ST.open = false; const p = $('#icom'); if (p) p.hidden = true; }
  let mics = [];
  function listMics() { navigator.mediaDevices.enumerateDevices().then(ds => { mics = ds.filter(d => d.kind === 'audioinput'); render(); }).catch(() => {}); }
  const pttBtn = (t, label) => `<button class="ptt ${ST.talking.has(t) ? 'on' : ''}" data-ptt="${esc(t)}" title="${L('Drž a mluv')}">🎙 ${label}</button>`;
  const quick = (t, list) => `<select data-qm="${esc(t)}"><option value="">💬 ${L('Pokyn…')}</option>${list.map(q => `<option>${esc(L(q))}</option>`).join('')}</select>`;
  function render() {
    const p = $('#icom'); if (!p || p.hidden) return;
    const on = REM.on(), gs = [...REM.guests()].filter(([, g]) => g.pc && g.pc.connectionState === 'connected');
    const camOpts = cur => `<option value="">— ${L('kamera')} —</option>` + cams().map(s => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    p.innerHTML = `<div class="ichead"><b>🎙 ${L('Interkom')}</b>
        <select id="icMic" title="${L('Mikrofon režie (nejde do vysílání)')}"><option value="">${L('Mikrofon režie: výchozí')}</option>${mics.map(m => `<option value="${esc(m.deviceId)}" ${m.deviceId === ST.dev ? 'selected' : ''}>${esc(m.label || 'Mic')}</option>`).join('')}</select>
        ${POP.hasId('icom') ? '' : `<button data-ic="pop" title="${L('Otevřít v samostatném okně')}">⧉</button>`}<button data-ic="close">✕</button></div>
      ${!on ? `<p class="warn">${L('Nejdřív zapni dálkové ovládání v místní síti (záložka 📱 Dálkově) a pošli kameramanům odkaz.')}</p>` : ''}
      <div class="icsec"><div class="icrow all">${pttBtn('crew', L('Všem kameramanům'))} ${quick('crew', QUICK_CREW)}<span class="dim">${L('nebo drž')} <kbd>§</kbd></span></div>
      ${[...CREW].map(([id, c]) => `<div class="icrow"><span class="tl ${c.air ? 'air' : c.pv ? 'pv' : ''}" data-tl="c:${esc(id)}"></span><span class="nm">🎥 ${esc(c.name)}</span>
        <select data-cam="${esc(id)}">${camOpts(c.cam)}</select><span class="lv"><i data-lv="${esc(id)}"></i></span>${pttBtn('c:' + id, L('Mluvit'))} ${quick('c:' + id, QUICK_CREW)}</div>`).join('') || `<p class="dim">${L('Zatím žádný kameraman. Odkaz je v záložce 📱 Dálkově.')}</p>`}</div>
      <div class="icsec"><h4>👤 ${L('Hosté – pokyny před vysíláním')}</h4>
      ${gs.map(([id, g]) => `<div class="icrow"><span class="tl ${g.air ? 'air' : g.pv ? 'pv' : ''}" data-tl="g:${esc(id)}"></span><span class="nm">👤 ${esc(g.s.name)}</span>${pttBtn('g:' + id, L('Mluvit s hostem'))} ${quick('g:' + id, QUICK_GUEST)}</div>`).join('') || `<p class="dim">${L('Žádný připojený host.')}</p>`}
      <p class="dim">${L('Hlas režie slyší jen host ve sluchátkách – do vysílání nejde. Program se mu při tom ztlumí.')}</p></div>
      <div class="icsend"><select id="icTo"><option value="crew">${L('Všichni kameramani')}</option>${[...CREW].map(([id, c]) => `<option value="c:${esc(id)}">🎥 ${esc(c.name)}</option>`).join('')}${gs.map(([id, g]) => `<option value="g:${esc(id)}">👤 ${esc(g.s.name)}</option>`).join('')}</select>
        <input id="icTxt" placeholder="${L('Napiš pokyn a dej Enter')}" maxlength="200"><button data-ic="send">${L('Poslat')}</button></div>
      <pre class="iclog"></pre>`;
    renderLog();
  }
  function renderLog() { const l = document.querySelector('#icom .iclog'); if (l) l.textContent = ST.log.join('\n'); }
  function bind(p) {
    const down = e => { const b = e.target.closest('[data-ptt]'); if (!b) return; e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); talk(b.dataset.ptt, true); };
    const up = e => { const b = e.target.closest('[data-ptt]'); if (!b) return; talk(b.dataset.ptt, false); };
    p.addEventListener('pointerdown', down); p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up);
    p.addEventListener('click', e => { const a = e.target.dataset.ic; if (a === 'close') close(); if (a === 'pop') POP.open('icom'); if (a === 'send') { message($('#icTo').value, $('#icTxt').value); $('#icTxt').value = ''; } });
    p.addEventListener('keydown', e => { if (e.target.id === 'icTxt' && e.key === 'Enter') { message($('#icTo').value, e.target.value); e.target.value = ''; } e.stopPropagation(); });
    p.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'icMic') setDev(t.value);
      if (t.dataset.qm !== undefined && t.value) { message(t.dataset.qm, t.value); t.value = ''; }
      if (t.dataset.cam) { const c = CREW.get(t.dataset.cam); if (c) { c.cam = t.value; c.air = null; sendCams(t.dataset.cam); } }
    });
  }
  function init() {
    try { ST.dev = localStorage.getItem('rezie-icom-mic') || ''; } catch (e) {}
    const b = $('#bIcom'); if (b) b.onclick = () => ST.open ? close() : open();
    // držení klávesy § / ` = mluvit ke všem kameramanům
    const isKey = e => e.code === 'Backquote' || e.code === 'IntlBackslash' || e.key === '§';
    addEventListener('keydown', e => { if (!isKey(e) || e.repeat || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; e.preventDefault(); ST.keyHeld = true; talk('crew', true); }, true);
    addEventListener('keyup', e => { if (!isKey(e) || !ST.keyHeld) return; ST.keyHeld = false; talk('crew', false); }, true);
    addEventListener('blur', () => { [...ST.talking].forEach(t => talk(t, false)); });
    setInterval(tick, 250);
  }
  return {init, open, close, render, onMsg, talk, message, crew:() => CREW};
})();
