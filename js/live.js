'use strict';
/* ================= 🏆 Živě: skóre a časomíra, chat z Twitche / YouTube, ankety diváků =================
   Hodnoty jdou do grafik přes značky: {skore.domaci} {skore.hoste} {skore.D} {skore.H} {skore.cas} {skore.perioda}
   {chat.jmeno} {chat.text}  {anketa.otazka} {anketa.1k} {anketa.1} {anketa.1%} {anketa.1n} {anketa.1pruh} … {anketa.hlasu}
   Šablony grafik: Skóre (sport), Zpráva z chatu, Anketa. */
const LIVE = (() => {
  const D = () => ({score:{home:'DOMÁCÍ', away:'HOSTÉ', h:0, a:0, period:'1.', clockMin:20, down:false, ms:0, run:false, t0:0},
    poll:{q:L('Kdo vyhraje?'), opts:['', '', '', ''], open:false, votes:{}}, chat:{kind:'twitch', ch:'', vid:'', show:null}});
  let C = D();
  const RT = {ws:null, yt:null, msgs:[], state:'off', err:'', ytKey:'', ytTimer:0, ytChat:'', ytPage:''};
  const save_ = () => ({score:Object.assign({}, C.score, {run:false, ms:clockMs()}), poll:{q:C.poll.q, opts:C.poll.opts, open:false, votes:{}}, chat:{kind:C.chat.kind, ch:C.chat.ch, vid:C.chat.vid}});
  const load = d => { C = D(); if (d) { Object.assign(C.score, d.score || {}); Object.assign(C.poll, d.poll || {}, {votes:{}, open:false}); Object.assign(C.chat, d.chat || {}); } C.score.run = false; };

  /* ---------- časomíra ---------- */
  const clockMs = () => C.score.ms + (C.score.run ? performance.now() - C.score.t0 : 0);
  function clockTxt() {
    const sc = C.score, el = clockMs() / 1000, left = sc.down ? Math.max(0, sc.clockMin * 60 - el) : el;
    if (sc.down && left <= 0 && sc.run) { sc.ms = sc.clockMin * 60000; sc.run = false; toast('⏱ ' + L('Čas vypršel')); AUT.emit('clock0'); draw(); }
    const p = n => String(Math.floor(n)).padStart(2, '0');
    return left < 60 && sc.down ? `${Math.floor(left)}.${Math.floor((left % 1) * 10)}` : `${p(left / 60)}:${p(left % 60)}`;
  }
  function clock(a) {
    const sc = C.score;
    if (a === 'toggle') { if (sc.run) { sc.ms = clockMs(); sc.run = false; } else { sc.t0 = performance.now(); sc.run = true; } }
    if (a === 'reset') { sc.ms = 0; sc.run = false; }
    draw(); save();
  }
  const scoreAdd = (side, n) => { const sc = C.score; sc[side] = Math.max(0, (sc[side] | 0) + n); draw(); save(); };

  /* ---------- anketa ---------- */
  function tally() {
    const n = [0, 0, 0, 0]; for (const v of Object.values(C.poll.votes)) if (v >= 1 && v <= 4) n[v - 1]++;
    const tot = n.reduce((a, b) => a + b, 0); return {n, tot};
  }
  function vote(user, text) {
    if (!C.poll.open) return;
    const m = /^\s*[!#]?\s*([1-4])\s*$/.exec(text); if (!m) return;
    const i = +m[1]; if (!C.poll.opts[i - 1]) return;
    C.poll.votes[user.toLowerCase()] = i; drawPoll();
  }

  /* ---------- značky pro grafiku ---------- */
  function resolve(s) {
    if (s.indexOf('{') < 0) return s;
    return s.replace(/\{(skore|chat|anketa)\.([\w%]+)\}/g, (m, g, k) => {
      if (g === 'skore') { const sc = C.score; return k === 'domaci' ? sc.home : k === 'hoste' ? sc.away : k === 'D' ? String(sc.h) : k === 'H' ? String(sc.a) : k === 'cas' ? clockTxt() : k === 'perioda' ? sc.period : m; }
      if (g === 'chat') { const c = C.chat.show; return k === 'jmeno' ? (c ? c.user : '') : k === 'text' ? (c ? c.text : '') : m; }
      if (g === 'anketa') {
        if (k === 'otazka') return C.poll.q;
        const {n, tot} = tally();
        if (k === 'hlasu') return tot ? tot + ' ' + L('hlasů') : (C.poll.open ? L('Hlasujte v chatu: napište 1, 2, 3 nebo 4') : '');
        const mm = /^([1-4])(k|%|n|pruh)?$/.exec(k); if (!mm) return m;
        const i = +mm[1] - 1, opt = C.poll.opts[i]; if (!opt) return '';
        const pct = tot ? Math.round(n[i] / tot * 100) : 0;
        if (!mm[2]) return opt; if (mm[2] === 'k') return (i + 1) + '.'; if (mm[2] === 'n') return String(n[i]); if (mm[2] === '%') return pct + ' %';
        if (mm[2] === 'pruh') return '█'.repeat(Math.round(pct / 5)) || '▏';
      }
      return m;
    });
  }

  /* ---------- chat: Twitch (bez přihlášení) ---------- */
  function addMsg(user, text, color) {
    RT.msgs.push({id:uid(), user, text:String(text).slice(0, 300), color, t:Date.now()}); if (RT.msgs.length > 80) RT.msgs.shift();
    vote(user, text); drawChat();
  }
  function twitch(ch) {
    ch = ch.trim().toLowerCase().replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').replace(/^#/, '').split(/[/?#]/)[0];
    if (!ch) return;
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); RT.ws = ws; RT.state = 'conn'; drawChat();
    ws.onopen = () => { ws.send('CAP REQ :twitch.tv/tags'); ws.send('PASS SCHMOOPIIE'); ws.send('NICK justinfan' + (10000 + Math.floor(Math.random() * 80000))); ws.send('JOIN #' + ch); };
    ws.onmessage = e => {
      for (const line of String(e.data).split('\r\n')) {
        if (!line) continue;
        if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }
        if (/ 366 /.test(line)) { RT.state = 'on'; RT.err = ''; drawChat(); }
        const m = /^(?:@(\S+) )?:(\w+)!\S+ PRIVMSG #\S+ :(.*)$/.exec(line); if (!m) continue;
        const tags = Object.fromEntries((m[1] || '').split(';').map(x => x.split('=')));
        addMsg(tags['display-name'] || m[2], m[3], tags.color || '');
      }
    };
    ws.onclose = () => { if (RT.ws !== ws) return; RT.state = 'wait'; drawChat(); setTimeout(() => { if (RT.ws === ws) twitch(ch); }, 3000); };
    ws.onerror = () => { RT.err = L('spojení s Twitchem selhalo'); };
  }
  /* ---------- chat: YouTube (potřebuje vlastní API klíč – zdarma v Google Cloud) ---------- */
  async function youtube(v) {
    const m = /(?:v=|youtu\.be\/|\/live\/|\/shorts\/)([\w-]{11})/.exec(v), id = m ? m[1] : v.trim();
    if (!RT.ytKey) { RT.err = L('Chybí API klíč YouTube'); drawChat(); return; }
    RT.state = 'conn'; RT.err = ''; drawChat(); const tok = RT.yt = uid();
    try {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(RT.ytKey)}`).then(r => r.json());
      if (r.error) throw new Error(r.error.message);
      const chat = r.items && r.items[0] && r.items[0].liveStreamingDetails && r.items[0].liveStreamingDetails.activeLiveChatId;
      if (!chat) throw new Error(L('Video teď nevysílá živě (nebo má vypnutý chat)'));
      RT.ytChat = chat; RT.ytPage = ''; RT.state = 'on'; drawChat();
      let first = true;
      const poll = async () => {
        if (RT.yt !== tok) return;
        try {
          const q = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(chat)}&part=snippet,authorDetails&maxResults=200&key=${encodeURIComponent(RT.ytKey)}${RT.ytPage ? '&pageToken=' + RT.ytPage : ''}`).then(r => r.json());
          if (q.error) throw new Error(q.error.message);
          RT.ytPage = q.nextPageToken || RT.ytPage;
          const items = q.items || []; for (const it of first ? items.slice(-20) : items) addMsg(it.authorDetails.displayName, it.snippet.displayMessage || '', '');
          first = false; RT.state = 'on'; RT.err = '';
          RT.ytTimer = setTimeout(poll, Math.max(6000, q.pollingIntervalMillis || 6000));
        } catch (e) { RT.err = e.message; RT.state = 'wait'; drawChat(); RT.ytTimer = setTimeout(poll, 15000); }
      };
      poll();
    } catch (e) { RT.state = 'error'; RT.err = e.message; drawChat(); }
  }
  function disconnect() { if (RT.ws) { const w = RT.ws; RT.ws = null; try { w.close(); } catch (e) {} } RT.yt = null; clearTimeout(RT.ytTimer); RT.state = 'off'; drawChat(); }
  function connect() { disconnect(); RT.msgs = []; if (C.chat.kind === 'twitch') twitch(C.chat.ch || ''); else youtube(C.chat.vid || ''); }
  function showMsg(m) {
    C.chat.show = m ? {user:m.user, text:m.text} : null;
    const G = S.gfx.list.find(g => g.els.some(e => /\{chat\./.test((e.p && e.p.text) || '')));
    if (G) { if (m) { if (!GFX.isOn(G)) GFX.setIn(G, true); } else GFX.setIn(G, false); }
    else if (m) toast(L('Přidej grafiku ze šablony „Zpráva z chatu“ (stránka Grafika).'));
    drawChat();
  }

  /* ---------- karta ---------- */
  const sel = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${n}</option>`).join('');
  function renderTab() {
    const el = $('#tab-live'); if (!el) return;
    const sc = C.score, p = C.poll, c = C.chat;
    el.innerHTML = `<div class="sec"><h4>🏆 ${L('Skóre a časomíra')}</h4>
      <div class="score">
        <div class="team"><input data-lv="score.home" value="${esc(sc.home)}"><b class="big" id="lvH">${sc.h}</b><div class="btns"><button data-lva="h+1">+1</button><button data-lva="h+2">+2</button><button data-lva="h+3">+3</button><button data-lva="h-1">−1</button></div></div>
        <div class="team"><input data-lv="score.away" value="${esc(sc.away)}"><b class="big" id="lvA">${sc.a}</b><div class="btns"><button data-lva="a+1">+1</button><button data-lva="a+2">+2</button><button data-lva="a+3">+3</button><button data-lva="a-1">−1</button></div></div>
      </div>
      <div class="btns"><b class="big" id="lvClock">${clockTxt()}</b><button data-lva="clock" class="${sc.run ? 'on' : ''}">${sc.run ? '⏸ ' + L('Stop') : '▶ ' + L('Start')}</button><button data-lva="creset">⟲ ${L('Vynulovat')}</button>
        <label>${L('Perioda')}<input data-lv="score.period" value="${esc(sc.period)}" size="6"></label></div>
      <div class="btns"><label class="chk"><input type="checkbox" data-lvc="score.down" ${sc.down ? 'checked' : ''}> ${L('Odpočítávat od')}</label><input type="number" min="1" max="180" data-lv="score.clockMin" value="${sc.clockMin}" style="width:70px"> min
        <button data-lva="sreset">${L('Skóre 0:0')}</button></div>
      <p class="dim">${L('Do grafiky: šablona „Skóre (sport)“, nebo vlastní text se značkami {skore.domaci} {skore.D} : {skore.H} {skore.hoste} {skore.cas} {skore.perioda}. Body a časomíru můžeš dát na klávesy v záložce Ovládání.')}</p></div>

      <div class="sec"><h4>💬 ${L('Chat diváků')}</h4>
      <div class="btns"><select data-lv="chat.kind">${sel({twitch:'Twitch', youtube:'YouTube'}, c.kind)}</select>
        ${c.kind === 'twitch' ? `<input data-lv="chat.ch" value="${esc(c.ch)}" placeholder="${L('název kanálu')}">` : `<input data-lv="chat.vid" value="${esc(c.vid)}" placeholder="${L('odkaz na živé video')}"><input type="password" id="lvKey" value="${esc(RT.ytKey)}" placeholder="API klíč">`}
        <button data-lva="${RT.state === 'off' ? 'conn' : 'disc'}">${RT.state === 'off' ? L('Připojit') : L('Odpojit')}</button>
        <span>${RT.state === 'on' ? '🟢 ' + L('připojeno') : RT.state === 'conn' ? '🟡 ' + L('připojuji') : RT.state === 'wait' ? '🟠 ' + L('znovu se připojuji') : RT.state === 'error' ? '🔴' : ''} <span class="dim">${esc(RT.err)}</span></span></div>
      ${c.kind === 'youtube' ? `<p class="dim">${L('YouTube potřebuje API klíč (zdarma): console.cloud.google.com → nový projekt → Knihovna → YouTube Data API v3 → Povolit → Přihlašovací údaje → Vytvořit klíč API. Klíč se neukládá.')}</p>` : ''}
      <div id="lvMsgs" class="chatlist"></div>
      <div class="btns"><button data-lva="hide">${L('Skrýt zprávu z vysílání')}</button></div>
      <p class="dim">${L('Klikni na zprávu → ukáže se ve vysílání (grafika ze šablony „Zpráva z chatu“).')}</p></div>

      <div class="sec"><h4>📊 ${L('Anketa')}</h4>
      <label>${L('Otázka')}<input data-lv="poll.q" value="${esc(p.q)}"></label>
      ${p.opts.map((o, i) => `<label>${i + 1}. <input data-lv="poll.opts.${i}" value="${esc(o)}" placeholder="${L('možnost')} ${i + 1}${i > 1 ? ' (' + L('nepovinné') + ')' : ''}"></label>`).join('')}
      <div class="btns"><button data-lva="popen" class="${p.open ? 'on' : ''}">${p.open ? '■ ' + L('Ukončit hlasování') : '▶ ' + L('Spustit hlasování')}</button><button data-lva="preset">${L('Vynulovat hlasy')}</button></div>
      <div id="lvPoll"></div>
      <p class="dim">${L('Diváci hlasují v chatu napsáním čísla (1, 2, 3, 4). Každý má jeden hlas, platí poslední. Do grafiky: šablona „Anketa“.')}</p></div>`;
    drawChat(); drawPoll();
  }
  function drawChat() {
    const el = $('#lvMsgs'); if (!el) return;
    const at = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    el.innerHTML = RT.msgs.map(m => `<div class="cm ${C.chat.show && C.chat.show.text === m.text && C.chat.show.user === m.user ? 'on' : ''}" data-lvm="${m.id}"><b style="color:${/^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#c4b5fd'}">${esc(m.user)}</b> ${esc(m.text)}</div>`).join('') || `<p class="dim">${L('Zatím žádné zprávy.')}</p>`;
    if (at) el.scrollTop = el.scrollHeight;
  }
  function drawPoll() {
    const el = $('#lvPoll'); if (!el) return;
    const {n, tot} = tally();
    el.innerHTML = C.poll.opts.map((o, i) => o ? `<div class="pollrow"><span>${i + 1}. ${esc(o)}</span><i style="width:${tot ? n[i] / tot * 100 : 0}%"></i><b>${n[i]} (${tot ? Math.round(n[i] / tot * 100) : 0} %)</b></div>` : '').join('') + `<p class="dim">${L('Hlasů celkem')}: ${tot}</p>`;
  }
  function draw() { const h = $('#lvH'), a = $('#lvA'); if (h) h.textContent = C.score.h; if (a) a.textContent = C.score.a; if (S.tabCur === 'live') renderTab(); }

  function set(path, v) {
    const k = path.split('.'); let o = C; for (let i = 0; i < k.length - 1; i++) o = o[k[i]];
    const last = k[k.length - 1]; o[last] = typeof o[last] === 'number' ? +v : v;
  }
  function act(a) {
    const m = /^([ha])([+-]\d)$/.exec(a); if (m) return scoreAdd(m[1], +m[2]);
    if (a === 'clock') clock('toggle'); if (a === 'creset') clock('reset');
    if (a === 'sreset') { C.score.h = C.score.a = 0; draw(); save(); }
    if (a === 'conn') { const k = $('#lvKey'); if (k) RT.ytKey = k.value.trim(); connect(); renderTab(); }
    if (a === 'disc') { disconnect(); renderTab(); }
    if (a === 'hide') showMsg(null);
    if (a === 'popen') { C.poll.open = !C.poll.open; if (C.poll.open) toast('📊 ' + L('Hlasování spuštěno')); renderTab(); }
    if (a === 'preset') { C.poll.votes = {}; drawPoll(); }
  }
  function init() {
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-lva]'); if (b) { act(b.dataset.lva); return; }
      const m = e.target.closest && e.target.closest('[data-lvm]'); if (m) { const x = RT.msgs.find(z => z.id === m.dataset.lvm); if (x) showMsg(x); }
    });
    document.addEventListener('change', e => {
      const t = e.target; if (!t.dataset) return;
      if (t.dataset.lv) { set(t.dataset.lv, t.value); save(); if (t.dataset.lv === 'chat.kind') { disconnect(); renderTab(); } if (t.dataset.lv.startsWith('poll')) drawPoll(); }
      if (t.dataset.lvc) { set(t.dataset.lvc, t.checked); save(); }
    });
    setInterval(() => { const el = $('#lvClock'); if (el) el.textContent = clockTxt(); else if (C.score.run) clockTxt(); }, 100);
  }
  const ctl = add => {
    add('score.h1', '🏆 Domácí +1', () => scoreAdd('h', 1), 'Skóre'); add('score.a1', '🏆 Hosté +1', () => scoreAdd('a', 1), 'Skóre');
    add('score.hm', '🏆 Domácí −1', () => scoreAdd('h', -1), 'Skóre'); add('score.am', '🏆 Hosté −1', () => scoreAdd('a', -1), 'Skóre');
    add('score.clock', '⏱ Časomíra start / stop', () => clock('toggle'), 'Skóre'); add('score.creset', '⏱ Časomíra vynulovat', () => clock('reset'), 'Skóre');
    add('poll.toggle', '📊 Anketa spustit / ukončit', () => act('popen'), 'Skóre'); add('chat.hide', '💬 Skrýt zprávu z chatu', () => showMsg(null), 'Skóre');
    add('cut.mark', '📍 Značka do střihového listu', () => CUT.mark(), 'Nahrávání a vysílání');
  };
  return {init, load, save:save_, resolve, renderTab, ctl};
})();
