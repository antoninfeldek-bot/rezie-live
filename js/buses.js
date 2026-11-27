'use strict';
/* ================= 🔀 ZVUKOVÉ SBĚRNICE (aux mixy) =================
   Každá sběrnice = vlastní mix na vlastní výstup (sluchátka moderátora, reproduktory v sále, nahrávací zařízení…).
   U každého kanálu nastavíš, kolik z něj jde do sběrnice. „Před fejdrem“ = nezávislé na hlavním mixu (typické pro odposlechy). */
const BUS = (() => {
  const C = () => S.buses || (S.buses = []);
  const RT = new Map();   // id sběrnice → {g, dest, el, an, sends:Map(srcId → {n, from})}
  let outs = [];
  function nodes(b) {
    let r = RT.get(b.id);
    if (!r) {
      r = {g:actx.createGain(), dest:actx.createMediaStreamDestination(), an:actx.createAnalyser(), sends:new Map(), el:new Audio()};
      r.an.fftSize = 512; r.g.connect(r.dest); r.g.connect(r.an);
      r.el.srcObject = r.dest.stream; r.el.autoplay = true; RT.set(b.id, r);
      sink(b); r.el.play().catch(() => {});
    }
    return r;
  }
  function sink(b) { const r = RT.get(b.id); if (!r || !r.el.setSinkId) return; r.el.setSinkId(b.dev || '').catch(e => { b.err = e.message; }); }
  function srcNode(id, pre) {   // odkud brát signál kanálu
    if (id === 'master') return masterFader;
    const s = srcById(id); if (!s || !s.audio || !s.audio.gainN) return null;
    return pre ? s.audio.panN : s.audio.gainN;
  }
  function sync() {
    if (!actx) return;
    for (const b of C()) {
      const r = nodes(b);
      r.g.gain.setTargetAtTime(b.mute ? 0 : b.vol, actx.currentTime, 0.03);
      for (const [id, lvl] of Object.entries(b.sends)) {
        let sn = r.sends.get(id); const from = srcNode(id, b.pre && id !== 'master');
        if (sn && sn.from !== from) { try { sn.from && sn.from.disconnect(sn.n); } catch (e) {} sn.n.disconnect(); r.sends.delete(id); sn = null; }
        if (!from) continue;
        if (!sn) { const n = actx.createGain(); from.connect(n); n.connect(r.g); sn = {n, from}; r.sends.set(id, sn); }
        const s = srcById(id), muted = id !== 'master' && s && s.audio && s.audio.mute;
        sn.n.gain.setTargetAtTime(muted ? 0 : lvl, actx.currentTime, 0.03);
      }
      for (const [id, sn] of r.sends) if (!(id in b.sends)) { try { sn.from.disconnect(sn.n); } catch (e) {} sn.n.disconnect(); r.sends.delete(id); }
    }
    for (const [id, r] of RT) if (!C().some(b => b.id === id)) { r.el.pause(); r.el.srcObject = null; r.g.disconnect(); r.sends.forEach(sn => { try { sn.from.disconnect(sn.n); } catch (e) {} }); RT.delete(id); }
  }
  function render() {
    const host = $('#tab-audio'); if (!host) return;
    let box = $('#busBox'); if (!box) { box = document.createElement('div'); box.id = 'busBox'; host.appendChild(box); }
    const chans = S.sources.filter(s => s.audio && s.audio.gainN);
    box.innerHTML = `<div class="sec"><h4>🔀 ${L('Sběrnice (vlastní mixy na jiné výstupy)')}</h4>
      ${C().map(b => `<div class="buscard" data-bid="${b.id}">
        <div class="bushead"><input data-bk="name" value="${esc(b.name)}" style="width:150px">
          <select data-bk="dev"><option value="">${L('Výchozí výstup systému')}</option>${outs.map(d => `<option value="${esc(d.deviceId)}" ${d.deviceId === b.dev ? 'selected' : ''}>${esc(d.label || 'Výstup')}</option>`).join('')}</select>
          <label class="chk"><input type="checkbox" data-bk="pre" ${b.pre ? 'checked' : ''}> ${L('před fejdrem')}</label>
          <button data-ba="mute" class="${b.mute ? 'on' : ''}">M</button><input type="range" min="0" max="1.5" step="0.01" value="${b.vol}" data-bk="vol" title="${L('Hlasitost sběrnice')}"><span class="buslv"><i data-blv="${b.id}"></i></span><button data-ba="del">✕</button></div>
        ${b.err ? `<p class="warn">${esc(b.err)}</p>` : ''}
        <div class="bussends">${[{id:'master', name:'🔴 ' + L('Celý program')}, ...chans.map(s => ({id:s.id, name:icon(s) + ' ' + s.name}))].map(c => `<label><span>${esc(c.name)}</span><input type="range" min="0" max="1.5" step="0.01" value="${b.sends[c.id] || 0}" data-send="${c.id}"><output>${Math.round((b.sends[c.id] || 0) * 100)} %</output></label>`).join('')}</div></div>`).join('')}
      <div class="btns"><button data-ba="add">+ ${L('Přidat sběrnici')}</button><button data-ba="virt" title="${L('Program do Zoomu, Teams, Meet… přes virtuální zvukové zařízení')}">🔌 ${L('Zvuk programu do Zoomu / Teams')}</button></div>
      <p class="dim">${L('Např. „Sluchátka moderátora“ (mikrofony + host, bez hudby) na zvukovou kartu, nebo „Sál“ (program) na reproduktory. Výstupy jsou zvukové karty a sluchátka připojené k Macu.')}</p></div>`;
  }
  function init() {
    const host = $('#tab-audio');
    host.addEventListener('input', e => {
      const t = e.target, card = t.closest('[data-bid]'); if (!card) return; const b = C().find(x => x.id === card.dataset.bid); if (!b) return;
      if (t.dataset.send) { const v = +t.value; if (v > 0) b.sends[t.dataset.send] = v; else delete b.sends[t.dataset.send]; const o = t.parentElement.querySelector('output'); if (o) o.textContent = Math.round(v * 100) + ' %'; }
      if (t.dataset.bk === 'vol') b.vol = +t.value;
      sync(); save();
    });
    host.addEventListener('change', e => {
      const t = e.target, card = t.closest('[data-bid]'); if (!card) return; const b = C().find(x => x.id === card.dataset.bid); if (!b || !t.dataset.bk) return;
      if (t.dataset.bk === 'name') b.name = t.value.trim() || 'Sběrnice';
      if (t.dataset.bk === 'dev') { b.dev = t.value; b.err = ''; sink(b); }
      if (t.dataset.bk === 'pre') b.pre = t.checked;
      sync(); save(); render();
    });
    host.addEventListener('click', e => {
      const t = e.target.closest('[data-ba]'); if (!t) return; const card = t.closest('[data-bid]'), b = card && C().find(x => x.id === card.dataset.bid);
      if (t.dataset.ba === 'add') { if (C().length >= 6) return; C().push({id:uid(), name:L('Sběrnice') + ' ' + String.fromCharCode(65 + C().length), dev:'', vol:1, mute:false, pre:true, sends:{}}); }
      if (t.dataset.ba === 'virt') {
        // virtuální zvuková karta: Mac = BlackHole, Windows = VB-Cable (obojí zdarma). V Zoomu pak jako mikrofon vybereš její výstup.
        const v = outs.find(d => /blackhole|vb-?audio|cable input|loopback|soundflower|virtual|voicemeeter/i.test(d.label));
        if (!v) { alert(L('Nenašel jsem virtuální zvukové zařízení. Nainstaluj zdarma: Mac → BlackHole (existential.audio/blackhole), Windows → VB-Cable (vb-audio.com/Cable). Pak restartuj aplikaci a klikni znovu.')); return; }
        if (C().length >= 6) return;
        C().push({id:uid(), name:'🔌 ' + L('Program → Zoom/Teams'), dev:v.deviceId, vol:1, mute:false, pre:false, sends:{master:1}});
        toast('🔌 ' + L('Hotovo. V Zoomu / Teams vyber jako mikrofon:') + ' ' + v.label.replace(/\s*\(.*\)$/, ''));
      }
      if (t.dataset.ba === 'del' && b) S.buses = C().filter(x => x !== b);
      if (t.dataset.ba === 'mute' && b) b.mute = !b.mute;
      sync(); save(); render();
    });
    navigator.mediaDevices && navigator.mediaDevices.enumerateDevices().then(ds => { outs = ds.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default'); if (LAY.isShown('audio')) render(); }).catch(() => {});
    setInterval(() => {
      sync();
      if (LAY.isShown('audio')) for (const [id, r] of RT) { const el = document.querySelector(`[data-blv="${id}"]`); if (el) { const p = peak(r.an); el.style.width = Math.round(clamp((20 * Math.log10(p || 1e-5) + 60) / 60, 0, 1) * 100) + '%'; } }
    }, 300);
  }
  const load = d => { RT.forEach(r => { try { r.el.pause(); r.g.disconnect(); } catch (e) {} }); RT.clear(); S.buses = Array.isArray(d) ? d.map(b => Object.assign({vol:1, pre:true, sends:{}}, b, {err:''})) : []; };
  return {init, render, sync, load, save:() => C().map(b => ({id:b.id, name:b.name, dev:b.dev, vol:b.vol, mute:b.mute, pre:b.pre, sends:b.sends}))};
})();
