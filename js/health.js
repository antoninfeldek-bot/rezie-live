'use strict';
/* ================= SPOLEHLIVOST: hlídání výkonu, chyb, zařízení a automatické ukládání =================
   – ukazatel v horní liště (snímky za sekundu, zátěž, paměť, chyby) – kliknutím podrobnosti
   – projekt se ukládá průběžně + každou minutu záloha (když by se hlavní uložení poškodilo)
   – odpojená kamera / mikrofon se po zapojení samy znovu připojí
   – když se zvuk zasekne (systém ho uspí), sám se znovu spustí */
const HLT = (() => {
  const H = {lastSave:0, n:0, t:performance.now(), fps:0, cost:0, errs:[], low:0, warned:0, lastBak:0, reconnecting:false, devT:0};
  const note = m => { H.errs.push(new Date().toLocaleTimeString() + '  ' + String(m).slice(0, 240)); if (H.errs.length > 60) H.errs.shift(); };
  window.addEventListener('error', e => note(e.message || e.type));
  window.addEventListener('unhandledrejection', e => note(e.reason && (e.reason.message || e.reason)));

  const frame = () => { H.n++; };
  function level() {
    if (H.fps < 18 || H.cost > 40) return 'bad';
    if (H.fps < 26 || H.cost > 25) return 'warn';
    return 'ok';
  }
  function details() {
    const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : '—';
    const miss = S.sources.filter(s => s.missing).map(s => s.name);
    return {fps:Math.round(H.fps), cost:H.cost.toFixed(1), mem, audio:actx ? actx.state : '—', miss, errs:H.errs.length};
  }
  function tick() {
    const now = performance.now(), dt = now - H.t;
    H.fps = H.n * 1000 / dt; H.n = 0; H.t = now; H.cost = frameCost;
    const el = $('#health');
    if (el) {
      const d = details(), lv = d.miss.length && level() === 'ok' ? 'warn' : level();
      el.className = 'health ' + lv;
      el.textContent = `● ${d.fps} fps`;
      el.title = `${L('Výkon')}: ${d.fps} fps · ${L('kreslení snímku')} ${d.cost} ms · ${L('paměť')} ${d.mem} · ${L('zvuk')}: ${d.audio}` +
        (d.miss.length ? `\n${L('Chybí zdroje')}: ${d.miss.join(', ')}` : '') + (d.errs ? `\n${L('Chyby')}: ${d.errs}` : '') + `\n${L('Klikni pro podrobnosti')}`;
    }
    // trvale nízký výkon → jedno upozornění (když je okno vidět)
    if (!document.hidden && H.fps > 0 && H.fps < 20) H.low++; else H.low = 0;
    if (H.low >= 6 && now - H.warned > 120000) { H.warned = now; toast(L('Počítač nestíhá – zavři jiné programy nebo sniž rozlišení kamer. Vysílání má přednost před náhledem.')); }
    // zvuk se zasekl (macOS ho uspí po odpojení sluchátek apod.)
    if (actx && actx.state !== 'running' && actx.state !== 'closed') actx.resume().catch(() => {});
    // průběžné uložení + záloha každou minutu
    if (now - H.lastSave > 5000) { H.lastSave = now; try { save(); } catch (e) {} }
    if (now - H.lastBak > 60000) { H.lastBak = now; try { const cur = localStorage.getItem('rezie-project'); if (cur && cur.length > 50) localStorage.setItem('rezie-project-bak', cur); } catch (e) {} }
    // chybějící kamery / mikrofony zkusit znovu (každých 5 s)
    if (now - H.devT > 5000) { H.devT = now; reconnect(); }
  }
  async function reconnect() {
    if (H.reconnecting) return;
    const miss = S.sources.filter(s => s.missing && s.deviceId && (s.type === 'camera' || s.type === 'mic')); if (!miss.length) return;
    H.reconnecting = true;
    try {
      const ds = await navigator.mediaDevices.enumerateDevices();
      for (const s of miss) {
        if (!ds.some(d => d.deviceId === s.deviceId)) continue;
        try { if (s.type === 'camera') await openCamera(s); else await openMic(s); toast(L('Znovu připojeno:') + ' ' + s.name); renderSources(); renderMixer(); }
        catch (e) { note(s.name + ': ' + e.message); }
      }
    } catch (e) {}
    H.reconnecting = false;
  }
  function show() {
    const d = details();
    dialog(L('Stav aplikace'), `<table>
      <tr><td>${L('Snímky za sekundu')}</td><td><b>${d.fps}</b> ${d.fps >= 26 ? '✅' : d.fps >= 18 ? '🟡' : '🔴'}</td></tr>
      <tr><td>${L('Kreslení jednoho snímku')}</td><td>${d.cost} ms</td></tr>
      <tr><td>${L('Paměť')}</td><td>${d.mem}</td></tr>
      <tr><td>${L('Zvuk')}</td><td>${d.audio}</td></tr>
      <tr><td>${L('Chybějící zdroje')}</td><td>${d.miss.length ? esc(d.miss.join(', ')) : '—'}</td></tr></table>
      <p class="dim">${L('Projekt se ukládá automaticky. Odpojená kamera nebo mikrofon se po zapojení samy znovu připojí. V aplikaci pro Mac vysílání nepřestane, ani když okno spadne – mezitím běží tabulka „Technické potíže“.')}</p>
      <h4>${L('Poslední chyby')}</h4><pre class="errlog">${H.errs.length ? esc(H.errs.slice(-15).join('\n')) : L('žádné')}</pre>`, true);
  }
  function init() {
    const el = $('#health'); if (el) el.onclick = show;
    navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', () => setTimeout(reconnect, 800));
    setInterval(tick, 1000);
  }
  return {init, frame, note, reconnect};
})();
