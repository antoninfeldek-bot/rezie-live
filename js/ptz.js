'use strict';
/* ================= 🎥 PTZ kamery (natáčení, zoom, předvolby) – VISCA přes síť =================
   Sony / BirdDog / Panasonic (VISCA over IP, UDP 52381), PTZOptics a většina dalších (VISCA TCP 5678 nebo UDP 1259).
   Šipky drž = pohyb, pusť = stop. Předvolby 1–9: klik = najet, „Uložit“ + klik = uložit aktuální pozici. */
const PTZ = (() => {
  const C = () => S.ptz || (S.ptz = {cams:[], sel:'', speed:10, zoom:4});
  const PROTO = {'visca-udp':'VISCA over IP (Sony, BirdDog, Panasonic) – UDP 52381', 'visca-tcp':'VISCA TCP (PTZOptics a další) – 5678', 'visca-raw-udp':'VISCA UDP (PTZOptics) – 1259'};
  let saveMode = false, lastErr = '';
  const h2 = n => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
  const cam = () => C().cams.find(c => c.id === C().sel) || C().cams[0];
  async function cmd(hex) {
    const c = cam(); if (!c || !c.ip) return;
    const x = (0x80 + (c.addr || 1)).toString(16), body = {ip:c.ip, port:c.port, proto:c.proto, hex:x + hex};
    let r;
    try { r = window.rzNative && window.rzNative.ptz ? await window.rzNative.ptz(body) : await (await fetch((REM.base() || '') + '/ptz', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})).json(); }
    catch (e) { r = {ok:false, error:L('funguje jen v aplikaci nebo přes node server.js')}; }
    const err = r && !r.ok ? r.error : '';
    if (err !== lastErr) { lastErr = err; const st = $('#ptzErr'); if (st) st.textContent = err ? '⚠ ' + err : ''; }
  }
  const drive = (h, v) => { const s = C().speed; cmd(`010601${h2(Math.round(s * 24 / 20) || 1)}${h2(Math.round(s * 20 / 20) || 1)}0${h}0${v}ff`); };
  const stop = () => cmd('0106010101' + '0303ff');
  const zoom = d => cmd(d === 0 ? '010407' + '00ff' : `010407${d > 0 ? '2' : '3'}${Math.min(7, C().zoom)}ff`);
  const preset = (n, store) => cmd(`01043f${store ? '01' : '02'}${h2(n)}ff`);
  const DIR = {ul:['1', '1'], u:['3', '1'], ur:['2', '1'], l:['1', '3'], r:['2', '3'], dl:['1', '2'], d:['3', '2'], dr:['2', '2']};

  function renderTab() {
    const box = $('#tab-ptz'); if (!box) return; const c = C(), k = cam();
    box.innerHTML = `<div class="ptzgrid">
      <div class="sec"><h4>🎥 ${L('PTZ kamery')}</h4>
        ${c.cams.map(x => `<div class="ptzcam ${k && x.id === k.id ? 'sel' : ''}" data-pid="${x.id}">
          <input data-pk="name" value="${esc(x.name)}" style="width:110px"><input data-pk="ip" value="${esc(x.ip)}" placeholder="192.168.1.50" style="width:120px">
          <select data-pk="proto">${Object.entries(PROTO).map(([v, n]) => `<option value="${v}" ${x.proto === v ? 'selected' : ''}>${esc(L(n))}</option>`).join('')}</select>
          <input data-pk="port" value="${x.port || ''}" placeholder="${L('port')}" style="width:60px"><button data-pa="sel">${L('Ovládat')}</button><button data-pa="del">✕</button></div>`).join('') || `<p class="dim">${L('Zatím žádná. Přidej kameru a zadej její IP adresu (najdeš ji v menu kamery nebo v routeru).')}</p>`}
        <div class="btns"><button data-pa="add">+ ${L('Přidat PTZ kameru')}</button></div><p id="ptzErr" class="warn">${lastErr ? '⚠ ' + esc(lastErr) : ''}</p></div>
      ${k ? `<div class="sec"><h4>${esc(k.name)}</h4>
        <div class="ptzpad">${['ul', 'u', 'ur', 'l', 'home', 'r', 'dl', 'd', 'dr'].map(d => d === 'home' ? `<button data-pa="home" title="${L('Výchozí pozice')}">⌂</button>` : `<button data-dir="${d}">${{ul:'↖', u:'↑', ur:'↗', l:'←', r:'→', dl:'↙', d:'↓', dr:'↘'}[d]}</button>`).join('')}</div>
        <div class="btns"><button data-zoom="-1">🔭 ${L('Oddálit')}</button><button data-zoom="1">🔍 ${L('Přiblížit')}</button><button data-pa="af">🎯 ${L('Autofokus')}</button></div>
        <label>${L('Rychlost pohybu')} <input type="range" min="1" max="20" value="${c.speed}" data-pc="speed"></label>
        <label>${L('Rychlost zoomu')} <input type="range" min="1" max="7" value="${c.zoom}" data-pc="zoom"></label></div>
      <div class="sec"><h4>${L('Předvolby')}</h4><div class="ptzpre">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-pre="${n}">${n}</button>`).join('')}</div>
        <label class="chk"><input type="checkbox" id="ptzSave" ${saveMode ? 'checked' : ''}> ${L('Uložit – další klik na číslo uloží aktuální pozici')}</label>
        <p class="dim">${L('Předvolby jdou přiřadit i na klávesy a Stream Deck (záložka Ovládání).')}</p></div>` : ''}</div>`;
  }
  function init() {
    const box = $('#tab-ptz');
    box.addEventListener('pointerdown', e => {
      const d = e.target.closest('[data-dir],[data-zoom]'); if (!d) return; e.preventDefault(); d.setPointerCapture(e.pointerId);
      if (d.dataset.dir) { const [hh, vv] = DIR[d.dataset.dir]; drive(hh, vv); } else zoom(+d.dataset.zoom);
      const up = () => { d.dataset.dir ? stop() : zoom(0); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up); };
      d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-pa],[data-pre]'); if (!b) return; const c = C();
      if (b.dataset.pre) { preset(+b.dataset.pre, saveMode); if (saveMode) { saveMode = false; toast(L('Předvolba uložena') + ' ' + b.dataset.pre); renderTab(); } return; }
      const a = b.dataset.pa, row = b.closest('[data-pid]'), x = row && c.cams.find(y => y.id === row.dataset.pid);
      if (a === 'add') { const n = {id:uid(), name:'PTZ ' + (c.cams.length + 1), ip:'', proto:'visca-udp', port:'', addr:1}; c.cams.push(n); c.sel = n.id; }
      if (a === 'del' && x) c.cams = c.cams.filter(y => y !== x);
      if (a === 'sel' && x) c.sel = x.id;
      if (a === 'home') cmd('010604ff'); if (a === 'af') cmd('01043802ff');
      save(); renderTab();
    });
    box.addEventListener('change', e => {
      const t = e.target, c = C();
      if (t.id === 'ptzSave') { saveMode = t.checked; return; }
      if (t.dataset.pc) { c[t.dataset.pc] = +t.value; save(); return; }
      const row = t.closest('[data-pid]'), x = row && c.cams.find(y => y.id === row.dataset.pid); if (!x || !t.dataset.pk) return;
      x[t.dataset.pk] = t.dataset.pk === 'port' ? (+t.value || '') : t.value.trim(); save();
    });
  }
  const load = d => { S.ptz = Object.assign({cams:[], sel:'', speed:10, zoom:4}, d || {}); };
  return {init, renderTab, load, save:() => C(), preset, cmd, cams:() => C().cams, select:id => { C().sel = id; }};
})();
