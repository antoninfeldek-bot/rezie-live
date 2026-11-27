'use strict';
/* Ovladač Režie Live pro iPad / mobil / druhý počítač (běží v prohlížeči, nic se neinstaluje) */
(() => {
  const q = new URLSearchParams(location.search), K = q.get('k') || '';
  const EN = q.get('lang') === 'en';
  const T = {'Ovladač':'Remote', 'NÁHLED':'PREVIEW', 'VYSÍLÁNÍ':'PROGRAM', 'Klepnutí = rovnou do vysílání':'Tap = straight to program', 'Všechny grafiky OUT':'All graphics OUT',
    'Právě běží':'Now', 'Další:':'Next:', '◀ Předchozí':'◀ Previous', 'Další ▶':'Next ▶', 'Scénář start / stop':'Rundown start / stop', 'Pomaleji':'Slower', 'Rychleji':'Faster',
    'Rychlost:':'Speed:', '⏮ Na začátek':'⏮ To the start', 'Přepínání':'Switch', 'Grafika':'Graphics', 'Zvuk':'Audio', 'Scénář':'Rundown', 'Čtečka':'Prompter',
    '⏺ Nahrávat program start/stop':'⏺ Record program start/stop', '📡 Vysílání start/stop':'📡 Streaming start/stop', '⛶ Celá obrazovka':'⛶ Full screen', 'Zavřít':'Close',
    '● ŽIVĚ':'● LIVE', 'Opravdu spustit / zastavit vysílání?':'Really start / stop streaming?', 'Špatný klíč – naskenuj QR kód v režii znovu.':'Wrong key – scan the QR code in the director app again.',
    'Spojení s režií přerušeno – připojuji znovu…':'Connection to the director app lost – reconnecting…', 'Připojeno':'Connected', 'Režie neběží':'Director app is not running', 'Zatím žádné scény':'No scenes yet',
    'Zatím žádný zvuk':'No audio yet', 'Ztlumit':'Mute', 'host':'guest'};
  const t = s => EN && T[s] || s;
  if (EN) { document.documentElement.lang = 'en'; document.querySelectorAll('[data-t]').forEach(e => { e.textContent = t(e.textContent.trim()); }); document.title = 'Live Director – remote'; }
  const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
  let S = null, es = null, dragging = {}, lastSend = {};

  function msg(text, ms) { const m = $('#msg'); m.textContent = text; m.hidden = !text; clearTimeout(msg.t); if (ms) msg.t = setTimeout(() => { m.hidden = true; }, ms); }
  async function send(a, v) {
    try { const r = await fetch('/r/act?k=' + encodeURIComponent(K), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({a, v})});
      if (r.status === 403) msg(t('Špatný klíč – naskenuj QR kód v režii znovu.')); else { const x = await r.text(); if (x !== 'ok') msg(t('Režie neběží'), 2000); } }
    catch (e) {}
    if (navigator.vibrate) navigator.vibrate(12);
  }
  // plynulé posílání faderů (max ~20× za sekundu)
  function sendThrottled(a, v) { const n = performance.now(), l = lastSend[a] || {t:0}; l.v = v; lastSend[a] = l; if (n - l.t > 50) { l.t = n; send(a, v); } else { clearTimeout(l.to); l.to = setTimeout(() => { l.t = performance.now(); send(a, l.v); }, 60); } }

  // role ovladače: všechno / jen grafika (+ scénář, čtečka) / jen zvuk
  function setRole(r) {
    const allow = r === 'gfx' ? ['gfx', 'rd', 'pr'] : r === 'aud' ? ['aud'] : null;
    document.querySelectorAll('.rnav [data-go]').forEach(b => { b.hidden = !!allow && !allow.includes(b.dataset.go); });
    for (const id of ['bRec', 'bStream']) { const b = $('#' + id); if (b) b.hidden = !!allow; }
    if (allow) { const first = document.querySelector('.rnav [data-go="' + allow[0] + '"]'); if (first) first.click(); }
    const ch = $('#role'); if (ch) ch.textContent = r === 'gfx' ? t('Grafika') : r === 'aud' ? t('Zvuk') : '';
  }
  function connect() {
    if (es) es.close();
    es = new EventSource('/r/events?k=' + encodeURIComponent(K));
    es.onopen = () => { $('#conn').className = 'dot on'; msg(''); };
    es.onerror = () => { $('#conn').className = 'dot off'; msg(t('Spojení s režií přerušeno – připojuji znovu…')); fetch('/r/events?k=' + encodeURIComponent(K), {method:'HEAD'}).then(r => { if (r.status === 403) { es.close(); msg(t('Špatný klíč – naskenuj QR kód v režii znovu.')); } }).catch(() => {}); };
    es.onmessage = e => { try { const d = JSON.parse(e.data); if (d && d.t === 'role') return setRole(d.r); if (d && d.scenes) { S = d; render(); } } catch (er) {} };
  }

  const fmt = s => { const neg = s < 0; s = Math.abs(s); return (neg ? '-' : '') + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  function render() {
    // stav nahoře
    $('#chips').innerHTML = (S.live ? `<b class="chip red">${t('● ŽIVĚ')}</b>` : '') + (S.rec ? '<b class="chip red">REC</b>' : '') + (S.iso ? '<b class="chip">ISO</b>' : '');
    if (S.thumbs) { $('#thPv').src = S.thumbs.pv; $('#thPg').src = S.thumbs.pg; }
    // scény
    const sc = $('#scenes'), key = S.scenes.map(x => x.id + x.name).join('|');
    if (sc.dataset.k !== key) { sc.dataset.k = key; sc.innerHTML = S.scenes.map((x, i) => `<button data-sc="${x.id}"><small>${i + 1}</small>${esc(x.name)}</button>`).join('') || `<p class="dim">${t('Zatím žádné scény')}</p>`; }
    sc.querySelectorAll('button').forEach(b => { b.classList.toggle('pv', b.dataset.sc === S.pv); b.classList.toggle('pg', b.dataset.sc === S.pg); });
    // přechody
    const tr = $('#trs'), tk = S.trs.map(x => x.id + x.name).join('|');
    if (tr.dataset.k !== tk) { tr.dataset.k = tk; tr.innerHTML = S.trs.map(x => `<button data-tr="${x.id}">${esc(x.name)}</button>`).join(''); }
    tr.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tr === S.tr));
    // makra
    const mc = $('#macros'), ml = S.macros || [], mk2 = ml.map(x => x.id + x.name).join('|');
    if (mc && mc.dataset.k !== mk2) { mc.dataset.k = mk2; mc.innerHTML = ml.length ? `<h3 class="dim" style="grid-column:1/-1;margin:8px 0 0;font-size:13px">🎬 ${t('Makra')}</h3>` + ml.map(x => `<button data-a="macro.${x.id}">${esc(x.name)}</button>`).join('') : ''; }
    if (mc) mc.querySelectorAll('[data-a]').forEach(b => { const m = ml.find(x => 'macro.' + x.id === b.dataset.a); b.classList.toggle('pg', !!(m && m.run)); });
    // grafika
    const gf = $('#gfx'), gk = S.gfx.map(x => x.id + x.name).join('|');
    if (gf.dataset.k !== gk) { gf.dataset.k = gk; gf.innerHTML = S.gfx.map((x, i) => `<button data-gfx="${x.id}"><small>F${i + 1}</small>${esc(x.name)}</button>`).join(''); }
    gf.querySelectorAll('button').forEach(b => { const g = S.gfx.find(x => x.id === b.dataset.gfx); b.classList.toggle('pg', !!(g && g.on)); });
    // zvuk
    const mx = $('#mix'), chs = [...S.ch, {id:'master', name:'MASTER', pos:S.master.pos, lvl:S.master.lvl, master:true}], mk = chs.map(x => x.id + x.name).join('|');
    if (mx.dataset.k !== mk) {
      mx.dataset.k = mk;
      mx.innerHTML = (S.ch.length ? '' : `<p class="dim">${t('Zatím žádný zvuk')}</p>`) + chs.map(c => `<div class="strip ${c.master ? 'master' : ''}" data-ch="${c.id}">
        <div class="sn">${c.master ? '🔴 ' : ''}${esc(c.name)}${c.type === 'guest' ? ' 👤' : ''}</div><div class="lv"><i></i></div>
        <input type="range" min="0" max="1000" data-fd="${c.id}">${c.master ? '<span></span>' : `<button data-mute="${c.id}">${t('Ztlumit')}</button>`}</div>`).join('');
    }
    chs.forEach(c => {
      const el = mx.querySelector(`[data-ch="${CSS.escape(c.id)}"]`); if (!el) return;
      el.querySelector('.lv i').style.width = Math.round(c.lvl * 100) + '%';
      el.querySelector('.lv').className = 'lv' + (c.lvl > 0.95 ? ' hot' : c.lvl > 0.8 ? ' warm' : '');
      const f = el.querySelector('input'); if (!dragging[c.id]) f.value = Math.round(c.pos * 1000);
      const m = el.querySelector('[data-mute]'); if (m) m.classList.toggle('on', !!c.mute);
      el.classList.toggle('air', !!c.air);
    });
    // scénář + čtečka
    $('#rdName').textContent = S.rd ? S.rd.name : '—'; $('#rdLeft').textContent = S.rd ? fmt(S.rd.left) : '--:--'; $('#rdLeft').classList.toggle('over', !!(S.rd && S.rd.over));
    $('#rdNext').textContent = S.rd && S.rd.next ? S.rd.next : '—';
    $('#prPlay').textContent = S.pr.on ? '⏸' : '▶'; $('#prSpeed').textContent = S.pr.speed;
  }

  // ovládání
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go) { document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.dataset.v === b.dataset.go)); document.querySelectorAll('.rnav button').forEach(x => x.classList.toggle('on', x === b)); return; }
    if (b.dataset.sc) return send(($('#direct').checked ? 'pg:' : 'pv:') + b.dataset.sc);
    if (b.dataset.tr) return send('tr:' + b.dataset.tr);
    if (b.dataset.gfx) return send('gfx:' + b.dataset.gfx);
    if (b.dataset.mute) return send('mute:' + b.dataset.mute);
    if (b.dataset.a) return send(b.dataset.a);
    if (b.id === 'cut') return send('cut');
    if (b.id === 'auto') return send('auto');
    if (b.id === 'gfxOut') return send('gfx.allout');
    if (b.id === 'more') { $('#sheet').hidden = false; return; }
    if (b.id === 'sheetClose') { $('#sheet').hidden = true; return; }
    if (b.id === 'bRec') { send('rec'); $('#sheet').hidden = true; return; }
    if (b.id === 'bStream') { if (confirm(t('Opravdu spustit / zastavit vysílání?'))) send('stream'); $('#sheet').hidden = true; return; }
    if (b.id === 'bFull') { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); $('#sheet').hidden = true; }
  });
  document.addEventListener('input', e => {
    const f = e.target;
    if (f.id === 'tbar') return sendThrottled('tbar', f.value / 1000);
    if (f.dataset.fd) { dragging[f.dataset.fd] = true; sendThrottled('vol:' + f.dataset.fd, f.value / 1000); }
  });
  document.addEventListener('change', e => { const f = e.target; if (f.dataset.fd) { send('vol:' + f.dataset.fd, f.value / 1000); setTimeout(() => { dragging[f.dataset.fd] = false; }, 600); } });
  ['pointerup', 'touchend'].forEach(ev => document.addEventListener(ev, () => setTimeout(() => { for (const k in dragging) dragging[k] = false; }, 700)));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!es || es.readyState === 2)) connect(); });
  if (!K) msg(t('Špatný klíč – naskenuj QR kód v režii znovu.')); else connect();
})();
