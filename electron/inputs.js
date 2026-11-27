// Režie Live – síťové vstupy: NDI (z jiného počítače, OBS, vMixu, kamer) a SRT / RTMP / RTSP / HLS (přes FFmpeg).
// Obraz jde do režie jako I420 (o 60 % menší než RGBA), zvuk jako float stereo.
// Režie potvrzuje každý snímek – když nestíhá, nový snímek se zahodí (nikdy se nic nehromadí).
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

module.exports = function setupInputs({ ipcMain, send, ffmpeg, binDir }) {
  const ins = new Map();   // id → {p, c, want, pend, timer}
  const recvBin = () => ['ndi-recv', 'ndi-recv.exe'].flatMap(n => [path.join(binDir, n), path.join(__dirname, 'ndi', n)]).find(f => { try { return fs.existsSync(f); } catch (e) { return false; } });
  const st = (id, state, msg) => send('rz:in:st', { id, state, msg: msg || '' });

  // rozřezání proudu bajtů na hotové snímky (bez zbytečného kopírování)
  function chunker(onPkt) {
    let bufs = [], have = 0;
    const take = n => {
      const out = Buffer.allocUnsafe(n); let o = 0;
      while (o < n) { const b = bufs[0], k = Math.min(b.length, n - o); b.copy(out, o, 0, k); o += k; if (k === b.length) bufs.shift(); else bufs[0] = b.subarray(k); }
      have -= n; return out;
    };
    return { push(d) { bufs.push(d); have += d.length; onPkt(take, () => have); } };
  }
  const video = (x, id, w, h, fmt, buf) => {
    if (x.pend >= 2) { x.drop = (x.drop || 0) + 1; return; }   // režie nestíhá → zahodit
    x.pend++; if (!x.live) { x.live = true; st(id, 'on'); }
    send('rz:in:v', { id, w, h, fmt, buf });
  };
  const audio = (id, rate, buf) => send('rz:in:a', { id, rate, buf });

  function argsFor(c) {
    const W = (c.w | 0) || 1280, H = (c.h | 0) || 720, fps = +c.fps || 30, rate = (c.rate | 0) || 48000;
    const a = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    let url = String(c.url || '');
    if (c.mode === 'srt') url = `srt://0.0.0.0:${(c.port | 0) || 9000}?mode=listener&latency=${((c.latency | 0) || 200) * 1000}${c.pass ? '&passphrase=' + encodeURIComponent(c.pass) : ''}`;
    if (c.mode === 'rtmp') { a.push('-listen', '1'); url = `rtmp://0.0.0.0:${(c.port | 0) || 1935}/live/${encodeURIComponent(c.key || 'rezie')}`; }
    if (/^rtsp/i.test(url)) a.push('-rtsp_transport', 'tcp');
    if (/^(srt|rtmp|rtsp|udp|rtp)/i.test(url)) a.push('-fflags', 'nobuffer', '-flags', 'low_delay', '-probesize', '500000', '-analyzeduration', '1000000');
    if (c.mode === 'url' && c.re) a.push('-re', '-stream_loop', '-1');
    if (/^https?:/i.test(url)) a.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    a.push('-i', url,
      '-map', '0:v:0', '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=${fps}`,
      '-pix_fmt', 'yuv420p', '-f', 'rawvideo', 'pipe:1',
      '-map', '0:a:0?', '-ac', '2', '-ar', String(rate), '-f', 'f32le', 'pipe:3');
    return { a, W, H, rate };
  }

  function startFf(id, x) {
    const { a, W, H, rate } = argsFor(x.c);
    const p = spawn(ffmpeg, a, { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] }); x.p = p;
    const fsz = W * H * 3 / 2;
    const vc = chunker((take, have) => { while (have() >= fsz) video(x, id, W, H, 0, take(fsz)); });
    const ac = chunker((take, have) => { const n = have() - (have() % 8); if (n >= 4096) audio(id, rate, take(n)); });
    p.stdout.on('data', d => vc.push(d)); p.stdio[3].on('data', d => ac.push(d));
    let err = ''; p.stderr.on('data', d => { err = (err + d).slice(-400); });
    p.on('error', e => { x.err = e.message; });
    p.on('close', () => { if (x.p !== p) return; x.p = null; x.live = false; x.pend = 0; again(id, x, (err.trim().split('\n').pop() || x.err || '').slice(0, 200)); });
  }

  function startNdi(id, x) {
    const bin = recvBin(); if (!bin) { st(id, 'error', 'chybí ndi-recv'); return; }
    const p = spawn(bin, [String(x.c.name || ''), x.c.low ? 'low' : 'high'], { stdio: ['pipe', 'pipe', 'pipe'] }); x.p = p;
    p.stdin.on('error', () => {});
    const ch = chunker((take, have) => {
      for (;;) {
        if (!x.hdr) { if (have() < 5) return; const h = take(5); x.hdr = { t: String.fromCharCode(h[0]), n: h.readUInt32LE(1) }; }
        if (have() < x.hdr.n) return;
        const b = take(x.hdr.n), t = x.hdr.t; x.hdr = null;
        if (t === 'V') video(x, id, b.readUInt32LE(0), b.readUInt32LE(4), b[11], b.subarray(12));
        else if (t === 'A') audio(id, b.readUInt32LE(0), b.subarray(7));
      }
    });
    p.stdout.on('data', d => ch.push(d));
    let line = '', last = '';
    p.stderr.on('data', d => {
      line += d; let i;
      while ((i = line.indexOf('\n')) >= 0) {
        const l = line.slice(0, i).trim(); line = line.slice(i + 1); last = l;
        if (l === 'WAIT') st(id, 'wait', 'čekám na zdroj v síti');
        else if (l === 'LOST') { x.live = false; st(id, 'wait', 'zdroj neposílá obraz'); }
        else if (l.startsWith('ERR')) st(id, 'error', l.slice(4));
      }
    });
    p.on('error', e => { x.err = e.message; });
    p.on('close', () => { if (x.p !== p) return; x.p = null; x.live = false; x.pend = 0; x.hdr = null; if (/nolib/.test(last)) { x.want = false; st(id, 'error', 'nolib'); return; } again(id, x, last.replace(/^ERR /, '')); });
  }

  function again(id, x, msg) {
    if (!x.want) { st(id, 'off'); return; }
    st(id, 'wait', msg);
    clearTimeout(x.timer); x.timer = setTimeout(() => { if (x.want && !x.p) start(id, x); }, x.c.mode === 'url' ? 3000 : 800);
  }
  function start(id, x) { x.pend = 0; x.live = false; (x.c.kind === 'ndi' ? startNdi : startFf)(id, x); }
  function stop(id) {
    const x = ins.get(id); if (!x) return; x.want = false; clearTimeout(x.timer); ins.delete(id);
    const p = x.p; x.p = null; if (p) { try { p.kill(); } catch (e) {} }
  }

  ipcMain.handle('rz:in:open', (e, c) => {
    stop(c.id);
    const x = { c, want: true, pend: 0 }; ins.set(c.id, x); st(c.id, 'wait', c.kind === 'ndi' ? 'hledám zdroj' : c.mode === 'url' ? 'připojuji' : 'čekám na signál');
    start(c.id, x);
    return { ok: true, ips: lanIps() };
  });
  ipcMain.on('rz:in:close', (e, id) => stop(id));
  ipcMain.on('rz:in:ack', (e, id) => { const x = ins.get(id); if (x && x.pend > 0) x.pend--; });
  ipcMain.handle('rz:in:ips', () => lanIps());
  // seznam NDI zdrojů v síti (asi 3 s)
  ipcMain.handle('rz:in:find', () => new Promise(res => {
    const bin = recvBin(); if (!bin) return res({ ok: false, error: 'chybí ndi-recv' });
    const p = spawn(bin, ['--find'], { stdio: ['ignore', 'ignore', 'pipe'] }); let out = '';
    p.stderr.on('data', d => { out += d; });
    p.on('error', er => res({ ok: false, error: er.message }));
    p.on('close', () => { if (/ERR nolib/.test(out)) return res({ ok: false, error: 'nolib' }); res({ ok: true, list: out.split('\n').filter(l => l.startsWith('SRC ')).map(l => l.slice(4).trim()) }); });
    setTimeout(() => { try { p.kill(); } catch (e) {} }, 6000);
  }));
  return { closeAll: () => [...ins.keys()].forEach(stop) };
};
