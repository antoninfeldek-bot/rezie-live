'use strict';
/* ================= NASTAVENÍ (jako v OBS): obraz, vysílání, nahrávání, zvuk, obecné, pokročilé =================
   Načte se ještě před režií – rozlišení plátna a snímková frekvence se berou odsud. */
const CFG = (() => {
  const D = {
    video:{base:'1920x1080', out:'same', fps:30, camRes:720},
    stream:{keyint:2, rc:'cbr', profile:'high', hw:'auto', ab:160, delay:0, retryMax:10, lowLatency:true},
    rec:{vb:10000, isoVb:8000, fmt:'mp4', ab:192, autoRec:false, stopWithStream:true},
    audio:{rate:48000, monitor:'', meterFall:'normal'},
    gen:{confirmStart:true, confirmStop:true, keepAwake:true, preview:'auto'},
  };
  let C;
  try { C = JSON.parse(localStorage.getItem('rezie-settings')) || {}; } catch (e) { C = {}; }
  for (const k in D) C[k] = Object.assign({}, D[k], C[k] || {});
  const save = () => { try { localStorage.setItem('rezie-settings', JSON.stringify(C)); } catch (e) {} };
  const wh = s => { const m = /^(\d+)x(\d+)$/.exec(s || ''); return m ? [+m[1], +m[2]] : [1920, 1080]; };
  // výstup (vysílání a nahrávání) – buď stejný jako plátno, nebo zmenšený se zachováním poměru stran
  const outWH = () => { const [bw, bh] = wh(C.video.base); if (C.video.out === 'same') return [bw, bh]; const [ow, oh] = wh(C.video.out); return [ow & ~1, oh & ~1]; };
  const BASES = {'1920x1080':'1920×1080 (Full HD 16:9)', '1280x720':'1280×720 (HD 16:9)', '2560x1440':'2560×1440 (2K 16:9)', '3840x2160':'3840×2160 (4K 16:9)',
    '1080x1920':'1080×1920 (na výšku 9:16 – TikTok, Reels, Shorts)', '1080x1080':'1080×1080 (čtverec 1:1)', '1440x1080':'1440×1080 (4:3)'};
  function outOptions(base) {
    const [bw, bh] = wh(base || C.video.base), o = {same:`${L('Stejné jako plátno')} (${bw}×${bh})`};
    for (const k of [0.75, 2 / 3, 0.5]) { const w = Math.round(bw * k) & ~1, h = Math.round(bh * k) & ~1; o[`${w}x${h}`] = `${w}×${h}`; }
    if (bw > bh && bh > 1080) o['1920x1080'] = '1920×1080'; if (bw > bh && bh > 720) o['1280x720'] = '1280×720';
    return o;
  }
  // H.264 úroveň podle rozlišení a fps (aby to kodér i platformy přijaly)
  function level(w, h, fps) {
    const fs = Math.ceil(w / 16) * Math.ceil(h / 16), mbps = fs * fps;
    if (fs <= 8192 && mbps <= 245760) return '28';     // 4.0
    if (fs <= 8704 && mbps <= 522240) return '2a';     // 4.2
    if (fs <= 22080 && mbps <= 589824) return '32';    // 5.0
    if (fs <= 36864 && mbps <= 983040) return '33';    // 5.1
    return '34';                                       // 5.2
  }
  function codecs() {
    const [w, h] = outWH(), lv = level(w, h, C.video.fps);
    const P = {high:'6400', main:'4d00', baseline:'42e0'};
    const order = [C.stream.profile, 'high', 'main', 'baseline'].filter((v, i, a) => a.indexOf(v) === i);
    const lvs = [lv, '33', '34'].filter((v, i, a) => a.indexOf(v) === i);
    return order.flatMap(p => lvs.map(l => 'avc1.' + P[p] + l));
  }

  /* ---------- okno nastavení ---------- */
  const opt = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${n}</option>`).join('');
  const SEC = [['gen', '⚙ Obecné'], ['video', '🖥 Obraz'], ['stream', '📡 Vysílání'], ['rec', '⏺ Nahrávání'], ['audio', '🔊 Zvuk'], ['adv', '🛠 Pokročilé']];
  let cur = 'video', draft = null, outs = [];
  function body() {
    const v = draft.video, s = draft.stream, r = draft.rec, a = draft.audio, g = draft.gen;
    const live = typeof R !== 'undefined' && !!R.stream;
    if (cur === 'gen') return `
      <label class="chk"><input type="checkbox" data-k="gen.confirmStart" ${g.confirmStart ? 'checked' : ''}> ${L('Před spuštěním vysílání se zeptat')}</label>
      <label class="chk"><input type="checkbox" data-k="gen.confirmStop" ${g.confirmStop ? 'checked' : ''}> ${L('Před ukončením vysílání se zeptat')}</label>
      <label class="chk"><input type="checkbox" data-k="rec.autoRec" ${r.autoRec ? 'checked' : ''}> ${L('Při vysílání automaticky nahrávat program')}</label>
      <label class="chk"><input type="checkbox" data-k="rec.stopWithStream" ${r.stopWithStream ? 'checked' : ''}> ${L('Po skončení vysílání zastavit i automatické nahrávání')}</label>
      <label class="chk"><input type="checkbox" data-k="gen.keepAwake" ${g.keepAwake ? 'checked' : ''}> ${L('Při vysílání a nahrávání nenechat počítač usnout ani zhasnout obrazovku')}</label>
      ${typeof UPD !== 'undefined' ? UPD.box() : ''}`;
    if (cur === 'video') return `
      <label>${L('Rozlišení plátna (základní)')}<select data-k="video.base">${opt(Object.fromEntries(Object.entries(BASES).map(([k, n]) => [k, L(n)])), v.base)}</select></label>
      <label>${L('Výstupní rozlišení (vysílání a nahrávka)')}<select data-k="video.out">${opt(outOptions(v.base), v.out)}</select></label>
      <label>${L('Snímková frekvence (FPS)')}<select data-k="video.fps">${opt({24:'24', 25:'25 (PAL – Evropa, TV)', 30:'30', 50:'50 (PAL)', 60:'60'}, v.fps)}</select></label>
      <label>${L('Výchozí rozlišení nových kamer')}<select data-k="video.camRes">${opt({480:'480p', 720:'720p', 1080:'1080p', 2160:'4K (2160p)'}, v.camRes)}</select></label>
      <p class="dim">${L('Na výšku (9:16) je pro TikTok, Instagram Reels a YouTube Shorts. 60 fps je plynulejší (sport, hry), ale potřebuje silnější počítač a o ~50 % vyšší datový tok. 25/50 fps sedí k evropskému osvětlení (nebliká).')}</p>
      <p class="warn" ${v.base !== C.video.base || +v.fps !== C.video.fps ? '' : 'hidden'}>⟳ ${L('Změna plátna nebo FPS se projeví po restartu studia (projekt se uloží).')}${live ? ' ' + L('V desktopové aplikaci vysílání během restartu nespadne – poběží záložní obraz.') : ''}</p>`;
    if (cur === 'stream') return `
      <div class="grid2">
      <label>${L('Kodér')}<select data-k="stream.hw">${opt({auto:L('Automaticky (grafika, když je)'), hw:L('Grafická karta (hardware)'), sw:L('Procesor (software, x264)')}, s.hw)}</select></label>
      <label>${L('Řízení datového toku')}<select data-k="stream.rc">${opt({cbr:L('CBR – stálý (doporučeno pro vysílání)'), vbr:L('VBR – proměnlivý')}, s.rc)}</select></label>
      <label>${L('Interval klíčových snímků (s)')}<select data-k="stream.keyint">${opt({1:'1', 2:L('2 (doporučeno – YouTube, Twitch, Facebook)'), 3:'3', 4:'4'}, s.keyint)}</select></label>
      <label>${L('Profil H.264')}<select data-k="stream.profile">${opt({high:'High', main:'Main', baseline:L('Baseline (staré telefony)')}, s.profile)}</select></label>
      <label>${L('Datový tok zvuku')}<select data-k="stream.ab">${opt({96:'96 kbps', 128:'128 kbps', 160:'160 kbps', 192:'192 kbps', 256:'256 kbps', 320:'320 kbps'}, s.ab)}</select></label>
      <label class="chk"><input type="checkbox" data-k="stream.lowLatency" ${s.lowLatency ? 'checked' : ''}> ${L('Nízké zpoždění kodéru')}</label></div>
      <p class="dim">${L('Datový tok videa a místa, kam vysílat, nastavíš v záložce Vysílání.')} ${L('Doporučení datového toku:')} 720p30 2500–4000 · 1080p30 4500–6000 · 1080p60 6000–9000 · 1440p 9000–13000 · 4K 15000–25000 kbps.</p>`;
    if (cur === 'rec') return `
      <div class="grid2">
      <label>${L('Kvalita nahrávky programu (kbps)')}<input type="number" min="2000" max="100000" step="1000" data-k="rec.vb" value="${r.vb}"></label>
      <label>${L('Kvalita ISO nahrávek kamer (kbps)')}<input type="number" min="2000" max="100000" step="1000" data-k="rec.isoVb" value="${r.isoVb}"></label>
      <label>${L('Formát')}<select data-k="rec.fmt">${opt({mp4:L('MP4 (doporučeno – otevře všechno)'), webm:'WebM (VP9)'}, r.fmt)}</select></label>
      <label>${L('Datový tok zvuku')}<select data-k="rec.ab">${opt({128:'128 kbps', 192:'192 kbps', 256:'256 kbps', 320:'320 kbps'}, r.ab)}</select></label></div>
      <p class="dim">${L('Pro střih: 1080p → 15 000–25 000 kbps, 4K → 40 000+ kbps. Pojistná nahrávka při nativním vysílání má vždy stejnou kvalitu jako stream (MKV). Složku pro nahrávky nastavíš v záložce Nahrávky.')}</p>`;
    if (cur === 'audio') return `
      <label>${L('Vzorkovací frekvence')}<select data-k="audio.rate">${opt({48000:L('48 kHz (doporučeno – video, TV)'), 44100:L('44,1 kHz (hudba, CD)')}, a.rate)}</select></label>
      <label>${L('Odposlech (sluchátka) – výstupní zařízení')}<select data-k="audio.monitor"><option value="">${L('Výchozí zařízení systému')}</option>${outs.map(d => `<option value="${esc(d.deviceId)}" ${d.deviceId === a.monitor ? 'selected' : ''}>${esc(d.label || d.deviceId.slice(0, 8))}</option>`).join('')}</select></label>
      <p class="warn" ${+a.rate !== C.audio.rate ? '' : 'hidden'}>⟳ ${L('Změna vzorkování se projeví po restartu studia.')}</p>
      <p class="dim">${L('Zpoždění jednotlivých mikrofonů (když zvuk předbíhá obraz) a efekty nastavíš na stránce Zvuk.')}</p>`;
    if (cur === 'adv') return `
      <label>${L('Zpoždění vysílání (s)')}<input type="number" min="0" max="120" step="1" data-k="stream.delay" value="${s.delay}"></label>
      <p class="dim">${L('Vysílání půjde ven o tolik sekund později (pojistka proti nechtěným věcem ve vysílání, nebo proti napovídání v soutěžích). Pojistná nahrávka se nezpožďuje. Jen v desktopové aplikaci.')}</p>
      <label>${L('Nejdelší čekání mezi pokusy o znovupřipojení (s)')}<input type="number" min="2" max="60" step="1" data-k="stream.retryMax" value="${s.retryMax}"></label>
      <label>${L('Náhled v režii')}<select data-k="gen.preview">${opt({auto:L('Automaticky (při zátěži méně často)'), full:L('Vždy plynule'), low:L('Úsporně (šetří výkon pro vysílání)')}, g.preview)}</select></label>
      <div class="btns"><button data-do="reset">↺ ${L('Vrátit výchozí nastavení')}</button></div>`;
    return '';
  }
  function open(section) {
    if (section) cur = section;
    draft = JSON.parse(JSON.stringify(C));
    const d = document.createElement('dialog'); d.className = 'settings'; d.id = 'setDlg';
    d.innerHTML = `<form method="dialog"><h3>⚙ ${L('Nastavení')}</h3><div class="setw"><nav>${SEC.map(([k, n]) => `<button type="button" data-sec="${k}" class="${k === cur ? 'on2' : ''}">${L(n)}</button>`).join('')}</nav><div class="setb"></div></div>
      <div class="btns end"><button value="cancel">${L('Zrušit')}</button><button type="button" data-do="apply" class="primary">${L('Uložit')}</button></div></form>`;
    document.body.appendChild(d);
    const fill = () => { d.querySelector('.setb').innerHTML = body(); d.querySelectorAll('nav button').forEach(b => b.classList.toggle('on2', b.dataset.sec === cur)); };
    fill(); d.showModal();
    if (navigator.mediaDevices) navigator.mediaDevices.enumerateDevices().then(ds => { outs = ds.filter(x => x.kind === 'audiooutput' && x.deviceId !== 'default'); if (cur === 'audio') fill(); }).catch(() => {});
    d.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.sec) { cur = b.dataset.sec; fill(); }
      if (b.dataset.do === 'reset' && confirm(L('Vrátit všechna nastavení na výchozí?'))) { draft = JSON.parse(JSON.stringify(D)); fill(); }
      if (b.dataset.do === 'apply') { apply(); d.close(); }
    });
    d.addEventListener('change', e => {
      const k = e.target.dataset.k; if (!k) return; const [a, b] = k.split('.');
      let val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      if (e.target.type === 'number' || ['fps', 'camRes', 'keyint', 'ab', 'rate'].includes(b)) val = +val;
      if (b === 'base') draft.video.out = 'same';
      draft[a][b] = val; fill();
    });
    d.addEventListener('close', () => d.remove());
  }
  function apply() {
    const restart = draft.video.base !== C.video.base || +draft.video.fps !== C.video.fps || +draft.audio.rate !== C.audio.rate;
    const mon = draft.audio.monitor !== C.audio.monitor;
    for (const k in draft) C[k] = draft[k];
    save();
    if (mon) setMonitorDevice();
    if (typeof STR !== 'undefined' && LAY.isShown('stream')) STR.renderTab();
    if (restart) {
      const live = !!R.stream, app = !!window.rzNative, recs = !!(R.rec || R.iso.length);
      if (live && !app && !confirm(L('Restart studia teď přeruší vysílání. Pokračovat?'))) return toast(L('Nastavení uloženo – projeví se při příštím spuštění'));
      if (recs && !confirm(L('Nahrávání se zastaví a uloží. Pokračovat?'))) return toast(L('Nastavení uloženo – projeví se při příštím spuštění'));
      if (R.rec) toggleRec(); if (R.iso.length) toggleIso();
      try { localStorage.setItem('rezie-project', JSON.stringify(serialize())); } catch (e) {}
      window.__rzRestart = true;
      setTimeout(() => { location.href = location.pathname + '?recover=1'; }, recs ? 1200 : 50);
    } else toast(L('Nastavení uloženo'));
  }
  function setMonitorDevice() {
    if (typeof actx === 'undefined' || !actx || !actx.setSinkId) return;
    actx.setSinkId(C.audio.monitor || '').catch(e => toast(L('Výstup zvuku nejde změnit:') + ' ' + e.message));
  }
  // nenechat usnout počítač během vysílání / nahrávání
  let lock = null;
  async function awake(on) {
    if (!C.gen.keepAwake) on = false;
    try { if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } else if (!on && lock) { await lock.release(); lock = null; } } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && typeof R !== 'undefined' && (R.stream || R.rec)) awake(true); });
  return {get video() { return C.video; }, get stream() { return C.stream; }, get rec() { return C.rec; }, get audio() { return C.audio; }, get gen() { return C.gen; },
    base:() => wh(C.video.base), out:outWH, codecs, open, setMonitorDevice, awake};
})();
