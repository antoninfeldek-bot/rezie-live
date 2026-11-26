'use strict';
/* Čtečka Režie Live na iPadu u čtecího zařízení: text se posouvá podle režie, plynule (60 fps) */
(() => {
  const q = new URLSearchParams(location.search), K = q.get('k') || '', EN = q.get('lang') === 'en';
  const T = {'Zrcadlit':'Mirror', 'podle režie':'like app', 'zapnuto':'on', 'vypnuto':'off', 'Špatný klíč – naskenuj QR kód v režii znovu.':'Wrong key – scan the QR code in the director app again.',
    'Spojení s režií přerušeno – připojuji znovu…':'Connection lost – reconnecting…'};
  const t = s => EN && T[s] || s;
  if (EN) { document.documentElement.lang = 'en'; document.title = 'Live Director – prompter'; document.querySelectorAll('[data-t]').forEach(e => { e.textContent = t(e.textContent.trim()); }); }
  const $ = s => document.querySelector(s), txt = $('#txt'), wrap = $('#wrap');
  const loc = (() => { try { return JSON.parse(localStorage.getItem('rz-prompter')) || {}; } catch (e) { return {}; } })();
  loc.mir = loc.mir || 'auto'; loc.scale = loc.scale || 1;
  const saveLoc = () => { try { localStorage.setItem('rz-prompter', JSON.stringify(loc)); } catch (e) {} };
  let S = null, pos = 0, last = performance.now(), es = null, text = null;

  const k = () => S ? innerWidth / (S.ref || 1280) * loc.scale : 1;
  function look() {
    if (!S) return;
    if (text !== S.text) { text = S.text; txt.textContent = S.text; }
    txt.style.fontSize = (S.size * k()) + 'px';
    const m = loc.mir === 'auto' ? S.mirror : loc.mir === 'on';
    wrap.classList.toggle('mirror', m);
    $('#mirV').textContent = t({auto:'podle režie', on:'zapnuto', off:'vypnuto'}[loc.mir]);
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (S && S.playing) pos += S.speed * dt;
    const kk = k(), max = Math.max(0, (txt.scrollHeight - innerHeight) / kk);
    if (pos > max) pos = max; if (pos < 0) pos = 0;
    txt.style.transform = `translateY(${-pos * kk}px)`;
    requestAnimationFrame(frame);
  }
  function onState(d) {
    const first = !S; S = d; look();
    const diff = d.pos - pos;
    if (first || !d.playing || Math.abs(diff) > 40) pos = d.pos;   // velký rozdíl (skok, reset) → hned
    else pos += diff * 0.35;                                      // malý rozdíl → plynulá korekce
  }
  function connect() {
    if (es) es.close();
    es = new EventSource('/p/events?k=' + encodeURIComponent(K));
    es.onopen = () => { $('#st').className = ''; $('#msg').hidden = true; };
    es.onerror = () => {
      $('#st').className = 'off';
      fetch('/p/events?k=' + encodeURIComponent(K), {method:'HEAD'}).then(r => { const m = $('#msg'); m.hidden = false; m.textContent = r.status === 403 ? t('Špatný klíč – naskenuj QR kód v režii znovu.') : t('Spojení s režií přerušeno – připojuji znovu…'); if (r.status === 403) es.close(); }).catch(() => {});
    };
    es.onmessage = e => { try { const d = JSON.parse(e.data); if (d && typeof d.text === 'string') onState(d); } catch (er) {} };
  }
  // ovládací lišta se ukáže po klepnutí
  let hideT = 0;
  const showBar = () => { $('#bar').classList.remove('hide'); clearTimeout(hideT); hideT = setTimeout(() => $('#bar').classList.add('hide'), 4000); };
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#bar')) showBar(); });
  $('#bMir').onclick = () => { loc.mir = {auto:'on', on:'off', off:'auto'}[loc.mir]; saveLoc(); look(); showBar(); };
  $('#bSm').onclick = () => { loc.scale = Math.max(0.4, +(loc.scale - 0.1).toFixed(2)); saveLoc(); look(); showBar(); };
  $('#bBg').onclick = () => { loc.scale = Math.min(3, +(loc.scale + 0.1).toFixed(2)); saveLoc(); look(); showBar(); };
  $('#bFull').onclick = () => { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); showBar(); };
  // obrazovka nesmí zhasnout
  let lock = null;
  const awake = async () => { try { if (!lock && navigator.wakeLock && !document.hidden) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) {} };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { awake(); if (!es || es.readyState === 2) connect(); } });
  addEventListener('resize', look);
  awake(); requestAnimationFrame(frame);
  if (!K) { const m = $('#msg'); m.hidden = false; m.textContent = t('Špatný klíč – naskenuj QR kód v režii znovu.'); } else connect();
})();
