'use strict';
/* ================= 📡 Síťové vstupy: NDI, SRT, RTMP, IP kamery (RTSP), HLS =================
   – NDI: obraz a zvuk z jiného počítače (OBS, vMix, NDI Screen Capture), NDI kamer a mobilů (NDI HX Camera)
   – SRT / RTMP příjem: mobil (Larix Broadcaster, Prism), OBS nebo jiný počítač posílá obraz rovnou do režie – i přes internet
   – adresa: IP kamera (rtsp://…), cizí SRT/RTMP server, HLS (.m3u8), odkaz na video
   Jen v desktopové aplikaci. Obraz chodí jako I420, zvuk se přimíchá do mix pultu jako běžný kanál. */
const NIN = (() => {
  const can = () => !!(window.rzNative && window.rzNative.inOpen);
  const isIn = s => s && (s.type === 'netin' || s.type === 'ndiin');
  let wkReady = null;

  /* ---------- zvuk: malý přehrávač s vyrovnávací pamětí (AudioWorklet) ---------- */
  const WK = `class P extends AudioWorkletProcessor{constructor(){super();this.q=[];this.len=0;this.pos=0;this.rate=sampleRate;this.fr=0;this.started=false;
    this.port.onmessage=e=>{const d=e.data;this.rate=d.rate||sampleRate;this.q.push(d.buf);this.len+=d.buf.length/2;
      const max=this.rate*0.4;while(this.len>max&&this.q.length>1){const b=this.q.shift();this.len-=b.length/2;this.pos=0;}};}
    process(i,o){const L=o[0][0],R=o[0][1]||o[0][0],step=this.rate/sampleRate;
      if(!this.started){if(this.len<this.rate*0.06){L.fill(0);R.fill(0);return true;}this.started=true;}
      for(let k=0;k<L.length;k++){if(!this.q.length){L[k]=R[k]=0;this.started=false;continue;}
        const b=this.q[0],n=b.length/2,j=this.pos|0;L[k]=b[j*2];R[k]=b[j*2+1];this.pos+=step;
        while(this.q.length&&this.pos>=this.q[0].length/2){this.pos-=this.q[0].length/2;this.len-=this.q[0].length/2;this.q.shift();}}
      return true;}}registerProcessor('rz-in',P);`;
  function ensureAudio(s) {
    if (s._an || !actx || !actx.audioWorklet) return;
    if (!wkReady) wkReady = actx.audioWorklet.addModule(URL.createObjectURL(new Blob([WK], {type:'application/javascript'})));
    s._an = 'pending';
    wkReady.then(() => { const n = new AudioWorkletNode(actx, 'rz-in', {numberOfInputs:0, outputChannelCount:[2]}); s._an = n; attachAudio(s, n); if (S.tabCur === 'audio') renderMixer(); })
      .catch(e => { s._an = null; HLT.note('NDI/SRT zvuk: ' + e.message); });
  }

  /* ---------- obraz ---------- */
  function onVideo(d) {
    const s = srcById(d.id);
    if (!s || !isIn(s)) { window.rzNative.inAck(d.id); return; }
    try {
      if (!(s.el instanceof HTMLCanvasElement)) s.el = document.createElement('canvas');
      const f = new VideoFrame(d.buf, d.fmt === 1 ? {format:'BGRA', codedWidth:d.w, codedHeight:d.h, timestamp:0} : {format:'I420', codedWidth:d.w, codedHeight:d.h, timestamp:0});
      if (s.el.width !== d.w || s.el.height !== d.h) { s.el.width = d.w; s.el.height = d.h; s.aspect = d.w / d.h; }
      s.el.getContext('2d').drawImage(f, 0, 0); f.close();
      s.dirty = true; s.hasVideo = true; s._last = performance.now(); s._frames = (s._frames || 0) + 1;
    } catch (e) { HLT.note('Vstup ' + s.name + ': ' + e.message); }
    window.rzNative.inAck(d.id);
  }
  function onAudio(d) {
    const s = srcById(d.id); if (!s || !isIn(s)) return;
    ensureAudio(s);
    if (s._an && s._an.port) { const f = new Float32Array(d.buf.buffer.slice(d.buf.byteOffset, d.buf.byteOffset + d.buf.byteLength)); s._an.port.postMessage({rate:d.rate, buf:f}, [f.buffer]); }
  }
  function onState(d) {
    const s = srcById(d.id); if (!s || !isIn(s)) return;
    const was = s._st && s._st.state; s._st = d; s.missing = d.state === 'error';
    if (d.state === 'on' && was !== 'on') toast('📡 ' + s.name + ' – ' + L('signál je tady'));
    if (d.state === 'error' && d.msg === 'nolib') s._st.msg = L('V počítači chybí NDI. Nainstaluj zdarma NDI Tools (ndi.video/tools) a zkus to znovu.');
    if (S.tabCur === 'sources' || S.tabCur === 'props') renderSources();
  }

  function open(s) {
    if (!can()) { s.missing = true; return; }
    if (!(s.el instanceof HTMLCanvasElement)) { s.el = document.createElement('canvas'); s.el.width = s.props.w || 1280; s.el.height = s.props.h || 720; const x = s.el.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, s.el.width, s.el.height); }
    s.hasVideo = true; s.aspect = s.el.width / s.el.height; s.missing = false; s._st = {state:'wait', msg:''};
    window.rzNative.inOpen(Object.assign({}, s.props, {id:s.id, kind:s.type === 'ndiin' ? 'ndi' : 'ff', rate:actx ? actx.sampleRate : 48000, fps:s.props.fps || CFG.video.fps}))
      .then(r => { s._ips = r.ips || []; if (S.tabCur === 'sources') renderSources(); }).catch(() => {});
    ensureAudio(s);
  }

  /* ---------- přidání ---------- */
  const usedPorts = mode => S.sources.filter(x => x.type === 'netin' && x.props.mode === mode).map(x => x.props.port);
  const freePort = (mode, base) => { let p = base; while (usedPorts(mode).includes(p)) p++; return p; };
  async function add(type) {
    if (type !== 'netin' && type !== 'ndiin') return false;
    if (!can()) { alert(L('Příjem přes síť (NDI, SRT, RTMP) funguje jen v desktopové aplikaci.')); return true; }
    if (type === 'ndiin') {
      toast(L('Hledám NDI zdroje v síti…'));
      const r = await window.rzNative.inFind();
      if (!r.ok && r.error === 'nolib') { alert(L('V počítači chybí NDI. Nainstaluj zdarma NDI Tools (ndi.video/tools) a zkus to znovu.')); return true; }
      const list = (r.list || []);
      const f = await dialog(L('NDI vstup'), `${list.length ? `<label>${L('Zdroj v síti')}<select name="n">${list.map(n => `<option>${esc(n)}</option>`).join('')}</select></label>` : `<p class="warn">${L('V síti jsem nenašel žádný NDI zdroj. Zkontroluj, že je druhý počítač ve stejné síti a posílá NDI. Název můžeš napsat ručně.')}</p>`}
        <label>${L('Nebo název ručně (POČÍTAČ (Zdroj))')}<input name="m" placeholder="STUDIO-PC (OBS)"></label>
        <label class="chk"><input type="checkbox" name="low"> ${L('Nízká kvalita (náhled – šetří síť a výkon)')}</label>`);
      if (!f) return true;
      const name = (f.m || '').trim() || f.n; if (!name) return true;
      const s = newSource('ndiin', '🔗 ' + name.replace(/^.*\(/, '').replace(/\)$/, '')); s.props = {name, low:!!f.low};
      S.sources.push(s); open(s); addToPreview(s); return true;
    }
    const fps = CFG.video.fps;
    const f = await dialog(L('Obraz přes síť (SRT / RTMP / IP kamera)'), `<label>${L('Jak')}<select name="mode">
        <option value="srt">📱 ${L('Přijímat SRT – mobil (Larix Broadcaster), OBS, jiný počítač, i přes internet')}</option>
        <option value="rtmp">📡 ${L('Přijímat RTMP – OBS, mobil, dron, kamera s RTMP')}</option>
        <option value="url">🔗 ${L('Připojit se na adresu – IP kamera (rtsp://), SRT, RTMP, HLS (.m3u8), video')}</option></select></label>
      <label>${L('Adresa (jen pro „Připojit se“)')}<input name="url" placeholder="rtsp://192.168.1.20:554/stream1"></label>
      <label>${L('Rozlišení v režii')}<select name="size"><option value="1280x720">1280×720</option><option value="1920x1080" ${W >= 1920 ? 'selected' : ''}>1920×1080</option><option value="1080x1920">1080×1920 (${L('na výšku')})</option><option value="640x360">640×360</option></select></label>
      <p class="dim">${L('SRT je nejlepší volba pro mobil a internet – vydrží výpadky sítě. Po přidání uvidíš adresu, kterou zadáš do mobilu nebo OBS.')}</p>`);
    if (!f) return true;
    const [w, h] = f.size.split('x').map(Number);
    if (f.mode === 'url' && !/^(rtsp|rtsps|srt|rtmp|rtmps|udp|rtp|https?):\/\//i.test((f.url || '').trim())) { alert(L('Adresa musí začínat rtsp://, srt://, rtmp://, udp:// nebo https://')); return true; }
    const p = {mode:f.mode, w, h, fps};
    if (f.mode === 'srt') { p.port = freePort('srt', 9000); p.latency = 200; }
    if (f.mode === 'rtmp') { p.port = freePort('rtmp', 1935); p.key = Math.random().toString(36).slice(2, 8); }
    if (f.mode === 'url') { p.url = f.url.trim(); p.re = /^https?:\/\//i.test(p.url) && !/\.m3u8/i.test(p.url); }
    const label = f.mode === 'url' ? (p.url.replace(/^\w+:\/\//, '').split(/[/?]/)[0]) : (f.mode.toUpperCase() + ' ' + p.port);
    const s = newSource('netin', '📡 ' + label); s.props = p;
    S.sources.push(s); open(s); addToPreview(s); return true;
  }
  function restore(s) { if (!isIn(s)) return false; open(s); return true; }
  function remove(s) { if (isIn(s) && can()) window.rzNative.inClose(s.id); if (s._an && s._an.disconnect) try { s._an.disconnect(); } catch (e) {} }

  /* ---------- karta zdroje ---------- */
  const stTxt = st => !st ? '' : st.state === 'on' ? '🟢 ' + L('signál') : st.state === 'wait' ? '🟡 ' + L('čekám na signál') : st.state === 'error' ? '🔴 ' + L('chyba') : '⚪ ' + L('vypnuto');
  function card(s) {
    if (!isIn(s)) return '';
    const p = s.props, st = s._st, ips = s._ips && s._ips.length ? s._ips : ['IP-ADRESA-POČÍTAČE'];
    let how = '';
    if (s.type === 'netin' && p.mode === 'srt') how = `<p>${L('Do mobilu / OBS zadej:')}</p>${ips.map(ip => `<code class="cp" data-copy="srt://${ip}:${p.port}">srt://${ip}:${p.port}</code>`).join('<br>')}
      <p class="dim">${L('Larix Broadcaster: Nastavení → Connections → New → URL výše, Mode: Caller. OBS: Nastavení → Vysílání → Vlastní, server = adresa výše. Mimo tvou Wi-Fi je potřeba na routeru přesměrovat port')} ${p.port} (UDP) ${L('na tento počítač, nebo použít Tailscale.')}</p>
      <label>${L('Zpoždění (ms) – víc = odolnější proti výpadkům')}<input type="number" min="20" max="5000" step="20" data-nin="latency" value="${p.latency || 200}"></label>`;
    if (s.type === 'netin' && p.mode === 'rtmp') how = `<p>${L('Server:')}</p>${ips.map(ip => `<code class="cp" data-copy="rtmp://${ip}:${p.port}/live">rtmp://${ip}:${p.port}/live</code>`).join('<br>')}
      <p>${L('Klíč streamu:')} <code class="cp" data-copy="${esc(p.key)}">${esc(p.key)}</code></p><p class="dim">${L('Najednou může posílat jen jedno zařízení. RTMP má větší zpoždění než SRT.')}</p>`;
    if (s.type === 'netin' && p.mode === 'url') how = `<p class="dim">${esc(p.url)}</p>`;
    if (s.type === 'ndiin') how = `<p class="dim">NDI: ${esc(p.name)}${p.low ? ' · ' + L('nízká kvalita') : ''}</p>`;
    return `<div class="sec"><b>${s.type === 'ndiin' ? '🔗 NDI' : '📡 ' + (p.mode === 'url' ? L('Adresa') : p.mode.toUpperCase())}</b> ${stTxt(st)} ${st && st.msg && st.state !== 'on' ? `<span class="dim">${esc(st.msg)}</span>` : ''}
      ${how}<div class="btns"><button data-nin-a="re">⟳ ${L('Připojit znovu')}</button>${s.type === 'ndiin' ? `<button data-nin-a="low">${p.low ? L('Plná kvalita') : L('Nízká kvalita')}</button>` : ''}</div></div>`;
  }

  function init() {
    if (!can()) return;
    window.rzNative.onIn(onVideo, onAudio, onState);
    document.addEventListener('click', e => {
      const c = e.target.closest && e.target.closest('[data-copy]');
      if (c && c.closest('.src')) { navigator.clipboard.writeText(c.dataset.copy).then(() => toast(L('Zkopírováno'))).catch(() => {}); return; }
      const b = e.target.closest && e.target.closest('[data-nin-a]'); if (!b) return;
      const card = b.closest('[data-id]'), s = card && srcById(card.dataset.id); if (!s) return;
      if (b.dataset.ninA === 'low') s.props.low = !s.props.low;
      open(s); save(); renderSources();
    });
    document.addEventListener('change', e => {
      const k = e.target.dataset && e.target.dataset.nin; if (!k) return;
      const card = e.target.closest('[data-id]'), s = card && srcById(card.dataset.id); if (!s) return;
      s.props[k] = +e.target.value; open(s); save();
    });
    // hlídání: obraz přestal chodit
    setInterval(() => { for (const s of S.sources) if (isIn(s) && s._st && s._st.state === 'on' && s._last && performance.now() - s._last > 4000) { s._st = {state:'wait', msg:L('obraz nechodí')}; if (S.tabCur === 'sources') renderSources(); } }, 2000);
  }
  return {init, add, restore, remove, card, can};
})();
