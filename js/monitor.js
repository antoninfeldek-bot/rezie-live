'use strict';
/* ================= 📊 STAV VYSÍLÁNÍ: všechno důležité na jednom místě =================
   vysílání (každé místo zvlášť), kodér, internet (test rychlosti), hosté a kameramani (kvalita spojení),
   počítač, dálkové ovládání. Nahoře jedna velká kontrolka: ✅ / ⚠ / 🔴. Tečka u záložky „Stav“ svítí stejně. */
const MON = (() => {
  const ST = {hist:[], speed:null, speedBusy:false, peers:new Map(), level:'ok', issues:[], last:0};
  const fmt = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };
  const pill = (lv, t) => `<span class="mpill ${lv}">${t}</span>`;
  const NAME = {starting:'připojuji', live:'živě', reconnecting:'znovu se připojuje', stopped:'zastaveno'};

  /* ---------- kvalita spojení s hosty a kameramany (WebRTC statistiky) ---------- */
  async function peerStats(key, pc) {
    if (!pc) return null;
    let st; try { st = await pc.getStats(); } catch (e) { return null; }
    const prev = ST.peers.get(key) || {}, o = {state:pc.connectionState, t:performance.now()};
    let bytes = 0, lost = 0, recv = 0, pair = null, cands = {};
    st.forEach(r => {
      if (r.type === 'inbound-rtp' && !r.isRemote) { bytes += r.bytesReceived || 0; lost += r.packetsLost || 0; recv += r.packetsReceived || 0; if (r.kind === 'video') { o.w = r.frameWidth; o.h = r.frameHeight; o.fps = r.framesPerSecond; } if (r.kind === 'audio' || r.jitter) o.jitter = Math.round((r.jitter || 0) * 1000); }
      if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') pair = r;
      if (r.type === 'local-candidate' || r.type === 'remote-candidate') cands[r.id] = r;
    });
    if (pair) {
      o.rtt = pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null;
      const lc = cands[pair.localCandidateId], rc = cands[pair.remoteCandidateId], types = [lc && lc.candidateType, rc && rc.candidateType];
      o.path = types.includes('relay') ? 'turn' : types.every(x => x === 'host') ? 'lan' : 'net';
    }
    if (prev.t && bytes >= prev.bytes) o.kbps = Math.round((bytes - prev.bytes) * 8 / ((o.t - prev.t) / 1000) / 1000);
    const dl = lost - (prev.lost || 0), dr = recv - (prev.recv || 0);
    o.loss = dr + dl > 0 ? Math.round(dl / (dr + dl) * 1000) / 10 : (prev.loss || 0);
    o.bytes = bytes; o.lost = lost; o.recv = recv;
    ST.peers.set(key, o);
    return o;
  }

  /* ---------- vyhodnocení: co je v pořádku a co ne ---------- */
  function evaluate() {
    const iss = [], add = (lv, t) => iss.push({lv, t});
    const s = STR.info(), n = NAT.stats(), h = HLT.details();
    if (s.live) {
      if (s.nat) {
        s.nat.outs.forEach(o => {
          if (o.kind === 'net' && o.state === 'reconnecting') add('bad', `${o.name}: ${L('spojení vypadlo, připojuji znovu')}`);
          else if (o.kind === 'net' && o.state !== 'live') add('warn', `${o.name}: ${L(NAME[o.state] || o.state)}`);
          if (o.congested) add('warn', `${o.name}: ${L('internet nestíhá')}`);
          if (o.kind === 'file' && o.state !== 'live' && o.state !== 'starting') add('warn', L('Pojistná nahrávka neběží'));
        });
        if (n.vb && n.vbTarget && n.vb < n.vbTarget * 0.95) add('warn', L('Datový tok snížen kvůli pomalému internetu') + ` (${Math.round(n.vb / 1000)} / ${Math.round(n.vbTarget / 1000)} kbps)`);
        if (s.nat.slate) add('bad', L('Běží záložní obraz „Technické potíže“'));
      }
      if (s.srv && s.srv.speed && s.srv.speed < 0.95) add('warn', L('Kódování nestíhá v reálném čase') + ` (${s.srv.speed}×)`);
      if (s.status === 'error' || s.status === 'retry') add('bad', L('Vysílání má potíže – podívej se do záložky Vysílání'));
    }
    if (h.fps && h.fps < 18 && !document.hidden) add('warn', L('Počítač nestíhá') + ` (${h.fps} fps)`);
    if (h.audio && h.audio !== 'running') add('bad', L('Zvuk neběží') + ` (${h.audio})`);
    if (h.miss.length) add('warn', L('Chybí zdroje:') + ' ' + h.miss.join(', '));
    REM.guests().forEach((g, id) => {
      const p = ST.peers.get('g:' + id), nm = g.s.name;
      if (g.pc && g.pc.connectionState === 'failed') add('bad', `👤 ${nm}: ${L('spojení selhalo')}`);
      else if (p && p.loss > 5) add('warn', `👤 ${nm}: ${L('ztráta paketů')} ${p.loss} %`);
      else if (p && p.rtt > 400) add('warn', `👤 ${nm}: ${L('velké zpoždění')} ${p.rtt} ms`);
    });
    ICM.crew().forEach((c, id) => { const p = ST.peers.get('c:' + id); if (p && p.loss > 8) add('warn', `🎥 ${c.name}: ${L('ztráta paketů')} ${p.loss} %`); });
    if (ST.speed && s.live) { const need = needMbps(); if (ST.speed.up < need) add('warn', L('Internet je na tvoje nastavení pomalý') + ` (${ST.speed.up} / ${need} Mb/s)`); }
    ST.issues = iss; ST.level = iss.some(x => x.lv === 'bad') ? 'bad' : iss.length ? 'warn' : 'ok';
    const dot = $('#monDot'); if (dot) { dot.className = 'mondot ' + ST.level; dot.title = iss.map(x => x.t).join('\n') || L('Vše v pořádku'); }
  }
  // kolik internetu (odesílání) potřebuje aktuální nastavení: místa × (video + zvuk) s rezervou 30 %
  function needMbps() { const s = STR.info(), d = Math.max(1, s.dests || 1); return +((d * (s.vb + CFG.stream.ab) / 1000) * 1.3).toFixed(1); }

  /* ---------- vykreslení ---------- */
  function spark(arr, w = 260, h = 40) {
    if (arr.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}"></svg>`;
    const mx = Math.max(...arr, 1), pts = arr.map((v, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - 2 - v / mx * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  const pathName = p => p === 'turn' ? L('přes TURN') : p === 'lan' ? L('místní síť') : p === 'net' ? L('přímo přes internet') : '—';
  function render() {
    const box = $('#page-status'); if (!box || !POP.on('status')) return;
    const s = STR.info(), n = NAT.stats(), h = HLT.details();
    const lvIcon = {ok:'✅', warn:'⚠', bad:'🔴'}[ST.level];
    const total = ST.hist.length ? ST.hist[ST.hist.length - 1] : 0;
    const dests = s.nat ? s.nat.outs : [];
    const guests = [...REM.guests()], crew = [...ICM.crew()];
    const peerRow = (key, icon, name, pc) => { const p = ST.peers.get(key) || {}, st = pc ? pc.connectionState : '—', lv = st === 'connected' ? (p.loss > 5 || p.rtt > 400 ? 'warn' : 'ok') : st === 'failed' ? 'bad' : 'warn';
      return `<tr><td>${icon} ${esc(name)}</td><td>${pill(lv, esc(L({connected:'připojen', connecting:'připojuje se', new:'připojuje se', failed:'selhalo', disconnected:'přerušeno', closed:'odpojen'}[st] || st)))}</td>
        <td>${p.rtt != null ? p.rtt + ' ms' : '—'}</td><td>${p.loss != null ? p.loss + ' %' : '—'}</td><td>${p.kbps != null ? p.kbps + ' kbps' : '—'}</td><td>${p.w ? `${p.w}×${p.h}${p.fps ? ' · ' + Math.round(p.fps) + ' fps' : ''}` : '—'}</td><td>${pathName(p.path)}</td></tr>`; };
    const sp = ST.speed, need = needMbps();
    box.innerHTML = `<div class="mon">
      <div class="mbanner ${ST.level}"><b>${lvIcon} ${ST.level === 'ok' ? L('Vše běží v pořádku') : ST.level === 'warn' ? L('Pozor') : L('Problém')}</b>
        ${ST.issues.length ? `<ul>${ST.issues.map(x => `<li class="mi-${x.lv}">${esc(x.t)}</li>`).join('')}</ul>` : `<span class="dim">${s.live ? L('Vysílání, zvuk i počítač jsou v pořádku.') : L('Vysílání neběží. Zvuk i počítač jsou v pořádku.')}</span>`}</div>
      <div class="mgrid">
      <section class="mcard wide"><h4>📡 ${L('Vysílání')}</h4>
        <div class="mrow"><span>${L('Stav')}</span><b>${s.live ? pill(s.status === 'live' ? 'ok' : s.status === 'error' ? 'bad' : 'warn', `● ${L('ŽIVĚ')} ${s.start ? fmt((performance.now() - s.start) / 1000) : ''}`) : pill('off', L('Vypnuto'))}</b>
          <span>${L('Výstup')}</span><b>${CFG.out().join('×')} · ${CFG.video.fps} fps</b><span>${L('Režim')}</span><b>${esc({app:L('Nativní'), rtmp:'RTMP', whip:'WHIP'}[s.mode] || s.mode)}</b></div>
        <div class="mrow"><span>${L('Celkový tok dat ven')}</span><b>${total ? (total / 1000).toFixed(2) + ' Mb/s' : '—'}</b><span class="mspark">${spark(ST.hist)}</span></div>
        ${s.live && s.nat ? `<table class="mtab"><tr><th>${L('Místo')}</th><th>${L('Stav')}</th><th>${L('Tok')}</th><th>${L('Běží')}</th><th>${L('Výpadky')}</th><th></th></tr>
          ${dests.map(o => `<tr><td>${o.kind === 'file' ? '💾 ' : ''}${esc(o.name)}</td><td>${pill(o.state === 'live' ? (o.congested ? 'warn' : 'ok') : o.state === 'reconnecting' ? 'bad' : 'warn', esc(L(NAME[o.state] || o.state)))}</td>
            <td>${o.kbps ? Math.round(o.kbps) + ' kbps' : '—'}</td><td>${o.uptime ? fmt(o.uptime) : '—'}</td><td>${o.restarts || 0}</td><td class="dim">${o.congested ? '⚠ ' + L('internet nestíhá') : o.last && o.state !== 'live' ? esc(o.last.slice(0, 60)) : ''}</td></tr>`).join('')}</table>
          <div class="mrow"><span>🎛 ${L('Kodér')}</span><b>${n.codec ? `H.264 ${n.w}×${n.h} · ${n.fps.toFixed(1)} fps · ${Math.round(n.vb / 1000)} kbps${n.vb < n.vbTarget ? ` (${L('cíl')} ${Math.round(n.vbTarget / 1000)})` : ''}` : '—'}</b>
            <span>${L('Zpožděné snímky')}</span><b>${n.late || 0}</b><span>${L('Fronta kodéru')}</span><b>${n.queue || 0}</b></div>` : ''}
        ${s.live && s.srv ? `<div class="mrow"><span>${L('Kódování')}</span><b>${s.srv.fps || '—'} fps · ${s.srv.kbps ? Math.round(s.srv.kbps) + ' kbps' : '—'} · ${L('rychlost')} ${s.srv.speed || '—'}× · ${L('zahozené snímky')} ${s.srv.drop || 0}</b></div>` : ''}
        ${s.live && s.stats ? `<div class="dim">${esc(s.stats)}</div>` : ''}
      </section>
      <section class="mcard"><h4>🌐 ${L('Internet')}</h4>
        ${sp ? `<div class="mbig"><div><small>${L('Odezva')}</small><b>${sp.ping} ms</b></div><div><small>${L('Stahování')}</small><b>${sp.down} Mb/s</b></div><div><small>${L('Odesílání')}</small><b class="${sp.up >= need ? '' : 'warnt'}">${sp.up} Mb/s</b></div></div>
          <p class="dim">${L('Změřeno')} ${new Date(sp.t).toLocaleTimeString().slice(0, 5)}. ${sp.up >= need * 1.5 ? '✅ ' + L('Na tvoje nastavení internet bohatě stačí.') : sp.up >= need ? '🟡 ' + L('Stačí, ale bez velké rezervy.') : '🔴 ' + L('Na tvoje nastavení je odesílání pomalé – sniž datový tok nebo počet míst.')}</p>` : `<p class="dim">${L('Zatím neměřeno.')}</p>`}
        <p class="dim">${L('Tvoje nastavení potřebuje odesílání aspoň')} <b>${need} Mb/s</b> (${s.dests || 1} × ${(s.vb / 1000).toFixed(1)} Mb/s ${L('+ zvuk a rezerva')}).</p>
        <div class="btns"><button data-mon="speed" ${ST.speedBusy ? 'disabled' : ''}>${ST.speedBusy ? '⏳ ' + L('Měřím…') : '⚡ ' + L('Změřit rychlost internetu')}</button></div></section>
      <section class="mcard"><h4>🖥 ${L('Počítač')}</h4>
        <div class="mrow"><span>${L('Snímky za sekundu')}</span><b>${pill(h.fps >= 26 ? 'ok' : h.fps >= 18 ? 'warn' : 'bad', h.fps + ' fps')}</b></div>
        <div class="mrow"><span>${L('Kreslení jednoho snímku')}</span><b>${h.cost} ms</b></div>
        <div class="mrow"><span>${L('Paměť')}</span><b>${h.mem}</b></div>
        <div class="mrow"><span>${L('Zvuk')}</span><b>${pill(h.audio === 'running' ? 'ok' : 'bad', esc(h.audio))}</b></div>
        <div class="mrow"><span>${L('Nahrávání')}</span><b>${R.rec ? pill('ok', '⏺ ' + fmt((performance.now() - R.rec.start) / 1000)) : '—'}${R.iso.length ? ' · ISO ' + R.iso.length : ''}</b></div>
        <div class="mrow"><span>${L('Chybějící zdroje')}</span><b>${h.miss.length ? pill('warn', esc(h.miss.join(', '))) : '—'}</b></div>
        <div class="mrow"><span>${L('Chyby')}</span><b>${h.errs}</b></div></section>
      <section class="mcard wide"><h4>👤 ${L('Hosté a kameramani')}</h4>
        ${guests.length || crew.length ? `<table class="mtab"><tr><th></th><th>${L('Stav')}</th><th>${L('Odezva')}</th><th>${L('Ztráta')}</th><th>${L('Tok k nám')}</th><th>${L('Obraz')}</th><th>${L('Spojení')}</th></tr>
          ${guests.map(([id, g]) => peerRow('g:' + id, '👤', g.s.name, g.pc)).join('')}${crew.map(([id, c]) => peerRow('c:' + id, '🎥', c.name, c.pc)).join('')}</table>
          <p class="dim">${L('Odezva pod 150 ms a ztráta pod 2 % je výborná. „Přes TURN“ = síť blokuje přímé spojení, obraz jde přes server (funguje, jen o kousek větší zpoždění).')}</p>` : `<p class="dim">${L('Nikdo není připojený.')}</p>`}</section>
      <section class="mcard"><h4>📱 ${L('Dálkově')}</h4>${remoteInfo()}</section>
      </div></div>`;
  }
  function remoteInfo() {
    const i = REM.info ? REM.info() : null;
    if (!i || !i.on) return `<p class="dim">${L('Místní síť je vypnutá (záložka 📱 Dálkově).')}</p>`;
    const t = i.tunnel || {};
    return `<div class="mrow"><span>${L('Místní síť')}</span><b>${pill('ok', L('zapnuto'))}</b></div>
      <div class="mrow"><span>${L('Přes internet')}</span><b>${t.status === 'on' ? pill('ok', L('zapnuto')) : t.status === 'starting' ? pill('warn', L('spouští se')) : pill('off', L('vypnuto'))}</b></div>
      <div class="mrow"><span>${L('Ovladače')}</span><b>${i.remotes || 0}</b><span>${L('Čtečky')}</span><b>${i.prompters || 0}</b></div>
      <div class="mrow"><span>TURN</span><b>${i.turn ? pill('ok', L('připravený')) : pill('off', L('nenastavený'))}</b></div>`;
  }
  async function speed() {
    if (ST.speedBusy) return;
    if (R.stream && !confirm(L('Test na pár sekund vytíží internet a může na chvíli zhoršit vysílání. Pokračovat?'))) return;
    const b = REM.base && REM.base(); if (!b) return toast(L('Test rychlosti funguje jen v aplikaci pro Mac nebo přes node server.js.'));
    ST.speedBusy = true; render();
    try { const r = await fetch(b + '/net/speed', {method:'POST'}); if (!r.ok) throw new Error(await r.text()); ST.speed = await r.json(); }
    catch (e) { toast(e.message); }
    ST.speedBusy = false; evaluate(); render();
  }

  /* ---------- smyčka ---------- */
  async function tick() {
    const s = STR.info();
    // celkový tok dat ven
    let tot = 0;
    if (s.live && s.nat) tot = s.nat.outs.filter(o => o.kind === 'net' && o.state === 'live').reduce((a, o) => a + (o.kbps || 0), 0);
    else if (s.live && s.srv && s.srv.kbps) tot = s.srv.kbps * Math.max(1, s.dests);
    ST.hist.push(tot); if (ST.hist.length > 120) ST.hist.shift();
    const vis = POP.on('status');
    if (vis) {
      await Promise.all([...[...REM.guests()].map(([id, g]) => peerStats('g:' + id, g.pc)), ...[...ICM.crew()].map(([id, c]) => peerStats('c:' + id, c.pc))]);
    } else if (REM.guests().size || ICM.crew().size) {
      // i bez otevřené stránky občas zkontrolovat kvalitu (kvůli kontrolce)
      if (performance.now() - ST.last > 5000) { ST.last = performance.now(); await Promise.all([...[...REM.guests()].map(([id, g]) => peerStats('g:' + id, g.pc)), ...[...ICM.crew()].map(([id, c]) => peerStats('c:' + id, c.pc))]); }
    }
    for (const k of [...ST.peers.keys()]) { const [t, id] = k.split(':'); if (!(t === 'g' ? REM.guests().has(id) : ICM.crew().has(id))) ST.peers.delete(k); }
    evaluate();
    if (vis) render();
  }
  function init() {
    const box = $('#page-status');
    box.addEventListener('click', e => { if (e.target.closest('[data-mon="speed"]')) speed(); });
    setInterval(() => { tick().catch(e => HLT.note('Stav: ' + e.message)); }, 1000);
  }
  return {init, render};
})();
