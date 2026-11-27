'use strict';
/* ================= Další zdroje: 📃 playlist videí, 🗂 prezentace, 🌐 web / chat =================
   – playlist: videa jdou automaticky za sebou (opakovat / náhodně)
   – prezentace: obrázky snímků (z PowerPointu/Keynote: Exportovat → Obrázky); další snímek PageDown / klikrem
   – web: libovolná stránka jako zdroj (skóre, počasí, grafika), i průhledná; chat z YouTube / Twitche do vysílání
     (jen v desktopové aplikaci – stránka se kreslí neviditelně a obraz jde rovnou do režie) */
const EXT = (() => {
  const files = new Map();   // id zdroje → [File] (soubory se neukládají – po restartu je vybereš znovu)
  const pickMany = accept => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = true; i.onchange = () => res([...i.files]); i.click(); });
  const canWeb = () => !!(window.rzNative && window.rzNative.webOpen);

  /* ---------- playlist ---------- */
  function plVideo(s) {
    let v = s.el;
    if (!(v instanceof HTMLVideoElement)) {
      v = document.createElement('video'); v.playsInline = true; v.preload = 'auto'; poolAdd(v); s.el = v;
      attachAudio(s, actx.createMediaElementSource(v));
      v.onloadedmetadata = () => { s.aspect = v.videoWidth / v.videoHeight; };
      v.onended = () => { AUT.emit('vend', s.id); plNext(s, 1, true); };
    }
    return v;
  }
  function plLoad(s, i, play) {
    const list = files.get(s.id) || []; if (!list.length) return;
    s.props.cur = ((i % list.length) + list.length) % list.length;
    const v = plVideo(s); if (v.src.startsWith('blob:')) URL.revokeObjectURL(v.src);
    v.src = URL.createObjectURL(list[s.props.cur]); s.hasVideo = true; s.missing = false;
    if (play) v.play().catch(() => {});
    refresh(s);
  }
  function plNext(s, k, auto) {
    const list = files.get(s.id) || []; if (!list.length) return;
    let i = s.props.cur + k;
    if (s.props.shuffle && list.length > 1) { do { i = Math.floor(Math.random() * list.length); } while (i === s.props.cur); }
    if (auto && i >= list.length && !s.props.loop) { refresh(s); return; }   // konec playlistu
    plLoad(s, i, true);
  }

  /* ---------- prezentace ---------- */
  function slDraw(s) {
    const imgs = s._imgs || [], im = imgs[s.props.cur]; if (!(s.el instanceof HTMLCanvasElement)) { s.el = document.createElement('canvas'); s.el.width = W; s.el.height = H; }
    const x = s.el.getContext('2d'); x.fillStyle = s.props.bg || '#000'; x.fillRect(0, 0, W, H);
    if (im && im.complete && im.naturalWidth) { const k = Math.min(W / im.naturalWidth, H / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k; x.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); }
    s.dirty = true; s.hasVideo = true; s.aspect = W / H;
  }
  function slGo(s, k) { const n = (s._imgs || []).length; if (!n) return; s.props.cur = Math.max(0, Math.min(n - 1, s.props.cur + k)); slDraw(s); refresh(s); save(); }
  async function slLoad(s, list) {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
    files.set(s.id, list);
    s._imgs = await Promise.all(list.map(f => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(im); im.src = URL.createObjectURL(f); })));
    s.props.cur = Math.min(s.props.cur || 0, s._imgs.length - 1); s.props.count = s._imgs.length; s.missing = false; slDraw(s);
  }
  // prezentace, která je ve vysílání (jinak v náhledu, jinak první)
  function activeSlides() {
    const all = S.sources.filter(s => s.type === 'slides' && s._imgs); if (!all.length) return null;
    const air = onAirSet(), pv = sceneSources(prevScene(), new Set());
    return all.find(s => air.has(s.id)) || all.find(s => pv.has(s.id)) || all[0];
  }

  /* ---------- web / chat ---------- */
  const CHAT_CSS = {
    youtube:'html,body,yt-live-chat-app,yt-live-chat-renderer,#item-list,#items,#item-scroller{background:transparent!important}yt-live-chat-header-renderer,#input-panel,#panel-pages,yt-live-chat-ticker-renderer,#chat-messages>#contents>#ticker{display:none!important}yt-live-chat-text-message-renderer{font-size:22px!important;padding:6px 12px!important;background:rgba(0,0,0,.55)!important;border-radius:10px;margin:4px 8px!important}#message,#author-name{color:#fff!important;font-size:22px!important}',
    twitch:'html,body,.chat-room,.chat-shell,.stream-chat,.chat-list--default,.chat-scrollable-area__message-container{background:transparent!important}.stream-chat-header,.chat-input,.chat-input__textarea,.community-highlight-stack__card,.chat-room__notifications{display:none!important}.chat-line__message{font-size:22px!important;color:#fff!important;background:rgba(0,0,0,.55);border-radius:10px;margin:4px 8px;text-shadow:0 1px 3px #000}'
  };
  function chatUrl(kind, v) {
    v = (v || '').trim();
    if (kind === 'youtube') { const m = /(?:v=|youtu\.be\/|\/live\/|\/shorts\/)([\w-]{11})/.exec(v); const id = m ? m[1] : v; return `https://www.youtube.com/live_chat?is_popout=1&dark_theme=1&v=${encodeURIComponent(id)}`; }
    if (kind === 'twitch') { const ch = v.replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').split(/[/?#]/)[0]; return `https://www.twitch.tv/popout/${encodeURIComponent(ch)}/chat?popout=&darkpopout`; }
    return /^https?:\/\//.test(v) ? v : 'https://' + v;
  }
  function webOpen(s) {
    if (!canWeb()) { s.missing = true; return; }
    const p = s.props; if (!(s.el instanceof HTMLCanvasElement)) { s.el = document.createElement('canvas'); }
    s.el.width = p.w; s.el.height = p.h; s.aspect = p.w / p.h; s.hasVideo = true; s.missing = false;
    window.rzNative.webOpen({id:s.id, url:p.url, w:p.w, h:p.h, fps:p.fps || 30, transparent:!!p.transparent, css:p.css || ''});
  }
  function webFrame(d) {
    const s = srcById(d.id); if (!s || !(s.el instanceof HTMLCanvasElement)) return;
    try {
      const f = new VideoFrame(d.buf, {format:'BGRA', codedWidth:d.w, codedHeight:d.h, timestamp:0});
      if (s.el.width !== d.w || s.el.height !== d.h) { s.el.width = d.w; s.el.height = d.h; s.aspect = d.w / d.h; }
      const x = s.el.getContext('2d'); x.clearRect(0, 0, d.w, d.h); x.drawImage(f, 0, 0); f.close(); s.dirty = true;
    } catch (e) { HLT.note('Web: ' + e.message); }
  }

  /* ---------- přidání zdroje ---------- */
  async function add(type) {
    if (type === 'playlist') {
      const list = await pickMany('video/*'); if (!list.length) return true;
      const s = newSource('playlist', L('Playlist') + ' ' + (S.sources.filter(x => x.type === 'playlist').length + 1));
      s.props = {loop:true, shuffle:false, cur:0, names:list.map(f => f.name)}; files.set(s.id, list);
      S.sources.push(s); plLoad(s, 0, true); addToPreview(s); return true;
    }
    if (type === 'slides') {
      const list = await pickMany('image/*'); if (!list.length) return true;
      const s = newSource('slides', L('Prezentace')); s.props = {cur:0, bg:'#000'};
      await slLoad(s, list); S.sources.push(s); addToPreview(s); return true;
    }
    if (type === 'web') {
      if (!canWeb()) { alert(L('Web a chat jako zdroj fungují jen v desktopové aplikaci.')); return true; }
      const f = await dialog(L('Web / chat jako zdroj'), `<label>${L('Co zobrazit')}<select name="kind"><option value="url">${L('Webová stránka (odkaz)')}</option><option value="youtube">${L('Chat z YouTube (živé vysílání)')}</option><option value="twitch">${L('Chat z Twitche')}</option></select></label>
        <label>${L('Odkaz / ID videa / kanál')}<input name="v" placeholder="https://… nebo youtube.com/watch?v=… nebo název kanálu"></label>
        <label>${L('Velikost')}<select name="size"><option value="1280x720">1280×720</option><option value="1920x1080">1920×1080</option><option value="480x800">480×800 (${L('chat na výšku')})</option><option value="800x600">800×600</option></select></label>
        <label class="chk"><input type="checkbox" name="tr" checked> ${L('Průhledné pozadí (když ho stránka má)')}</label>
        <p class="dim">${L('Chat z YouTube: vlož odkaz na své živé vysílání. Zprávy se ukážou s poloprůhledným pozadím – dej vrstvu chatu třeba do rohu obrazu.')}</p>`);
      if (!f || !f.v) return true;
      const [w, h] = f.size.split('x').map(Number), kind = f.kind;
      const s = newSource('web', kind === 'youtube' ? '💬 YouTube chat' : kind === 'twitch' ? '💬 Twitch chat' : (f.v.replace(/^https?:\/\//, '').split('/')[0] || 'Web'));
      s.props = {url:chatUrl(kind, f.v), kind, w, h, fps:kind === 'url' ? 30 : 15, transparent:!!f.tr || kind !== 'url', css:CHAT_CSS[kind] || ''};
      S.sources.push(s); webOpen(s); addToPreview(s);
      if (kind !== 'url') { const sc = prevScene(), l = sc && sc.layers.find(x => x.sourceId === s.id); if (l) { const k = Math.min(W * 0.3 / w, H * 0.8 / h); l.w = Math.round(w * k); l.h = Math.round(h * k); l.x = W - l.w - Math.round(W * 0.02); l.y = Math.round(H * 0.1); } }
      return true;
    }
    return false;
  }
  function restore(s) {
    if (s.type === 'web') { webOpen(s); return true; }
    if (s.type === 'playlist' || s.type === 'slides') { s.missing = true; if (s.type === 'slides') { s.el = document.createElement('canvas'); s.el.width = W; s.el.height = H; } return true; }
    return false;
  }
  function remove(s) { if (s.type === 'web' && canWeb()) window.rzNative.webClose(s.id); files.delete(s.id); }

  /* ---------- karta zdroje (Vlastnosti) ---------- */
  function card(s) {
    const p = s.props;
    if (s.type === 'playlist') {
      const list = files.get(s.id) || [], names = list.length ? list.map(f => f.name) : (p.names || []);
      return `<div class="sec"><b>📃 ${L('Playlist')}</b> ${s.missing ? `<button data-ext="plfiles">${L('Vybrat videa znovu')}</button>` : ''}
        <ol class="plist">${names.map((n, i) => `<li class="${i === p.cur ? 'cur' : ''}" data-ext="plgo" data-i="${i}">${esc(n)}</li>`).join('')}</ol>
        <div class="btns"><button data-ext="plprev">⏮</button><button data-ext="plplay">⏯</button><button data-ext="plnext">⏭</button><button data-ext="plfiles">+ ${L('Videa')}</button></div>
        <label class="chk"><input type="checkbox" data-extp="loop" ${p.loop ? 'checked' : ''}> ${L('Opakovat dokola')}</label>
        <label class="chk"><input type="checkbox" data-extp="shuffle" ${p.shuffle ? 'checked' : ''}> ${L('Náhodné pořadí')}</label></div>`;
    }
    if (s.type === 'slides') return `<div class="sec"><b>🗂 ${L('Prezentace')}</b> ${s.missing ? `<button data-ext="slfiles">${L('Vybrat snímky znovu')}</button>` : ''}
      <div class="btns"><button data-ext="slprev">◀</button><b>${L('Snímek')} ${(p.cur || 0) + 1} / ${p.count || (s._imgs || []).length || 0}</b><button data-ext="slnext">▶</button><button data-ext="slfiles">${L('Jiné snímky')}</button></div>
      <p class="dim">${L('Další snímek: PageDown / šipka klikru, předchozí: PageUp (platí pro prezentaci ve vysílání). Z PowerPointu nebo Keynote: Soubor → Exportovat → Obrázky (PNG/JPEG).')}</p></div>`;
    if (s.type === 'web') return `<div class="sec"><b>🌐 ${esc(p.kind === 'url' ? L('Webová stránka') : L('Chat'))}</b> <span class="dim">${esc(p.url.slice(0, 60))}</span>
      <div class="btns"><button data-ext="wreload">⟳ ${L('Načíst znovu')}</button><button data-ext="wurl">${L('Změnit odkaz')}</button></div>
      ${canWeb() ? '' : `<p class="warn">${L('Web a chat jako zdroj fungují jen v desktopové aplikaci.')}</p>`}</div>`;
    return '';
  }
  async function act(s, a, el) {
    if (a === 'plprev') plNext(s, -1); if (a === 'plnext') plNext(s, 1); if (a === 'plgo') plLoad(s, +el.dataset.i, true);
    if (a === 'plplay' && s.el instanceof HTMLVideoElement) { s.el.paused ? s.el.play().catch(() => {}) : s.el.pause(); }
    if (a === 'plfiles') { const list = await pickMany('video/*'); if (!list.length) return; const old = s.missing ? [] : (files.get(s.id) || []); files.set(s.id, old.concat(list)); s.props.names = files.get(s.id).map(f => f.name); if (s.missing || !s.el || !s.el.src) plLoad(s, 0, true); }
    if (a === 'slprev') slGo(s, -1); if (a === 'slnext') slGo(s, 1);
    if (a === 'slfiles') { const list = await pickMany('image/*'); if (list.length) await slLoad(s, list); }
    if (a === 'wreload' && canWeb()) window.rzNative.webClose(s.id), webOpen(s);
    if (a === 'wurl') { const f = await dialog(L('Změnit odkaz'), `<label>${L('Odkaz')}<input name="u" value="${esc(s.props.url)}"></label>`); if (f && f.u) { s.props.url = chatUrl('url', f.u); if (canWeb()) { window.rzNative.webClose(s.id); webOpen(s); } } }
    refresh(s); save();
  }
  function refresh(s) { if (LAY.isShown('props') || LAY.isShown('sources')) renderSources(); }
  function init() {
    if (canWeb()) window.rzNative.onWebFrame(webFrame);
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-ext]'); if (!b) return;
      const card = b.closest('[data-id]'), s = srcById(card ? card.dataset.id : '') || (S.sources.find(x => x.id === (b.closest('[data-sid]') || {}).dataset?.sid)); if (!s) return;
      act(s, b.dataset.ext, b);
    });
    document.addEventListener('change', e => {
      const k = e.target.dataset && e.target.dataset.extp; if (!k) return;
      const card = e.target.closest('[data-id]'), s = card && srcById(card.dataset.id); if (!s) return;
      s.props[k] = e.target.checked; save();
    });
    // klikr na prezentace: PageDown / PageUp
    addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')) || e.target.isContentEditable) return;
      if (e.key === 'PageDown' || e.key === 'PageUp') { const s = activeSlides(); if (s) { slGo(s, e.key === 'PageDown' ? 1 : -1); e.preventDefault(); } }
    }, true);
  }
  const loadCfg = () => {}; const save_ = () => null;
  return {init, add, restore, remove, card, load:loadCfg, save:save_, slidesNext:() => { const s = activeSlides(); if (s) slGo(s, 1); }, slidesPrev:() => { const s = activeSlides(); if (s) slGo(s, -1); }, chatUrl};
})();
