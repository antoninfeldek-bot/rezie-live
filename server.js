// Režie Live – přenosový server
// Spuštění:  node server.js     potom otevři  http://localhost:8080
// Potřebuje: Node.js 18+ a FFmpeg (příkaz "ffmpeg" musí fungovat v terminálu).
// Nic dalšího se instalovat nemusí (žádné npm balíčky).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const PORT = +process.env.PORT || 8080;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
let ff = null;
let last = '';
const clients = new Set();   // Server-Sent Events – vzdálené ovládání (Stream Deck, Companion)
const MIME = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon'};

let ffOk = null, encoders = null, stats = {};
function hasFfmpeg() {
  if (ffOk === null) { try { ffOk = spawnSync(FFMPEG, ['-version']).status === 0; } catch (e) { ffOk = false; } }
  return ffOk;
}
// Zjistí, které H.264 kodéry jsou k dispozici a opravdu fungují (grafická karta apod.)
function detectEncoders() {
  if (encoders) return encoders;
  if (!hasFfmpeg()) return (encoders = []);
  const list = ['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox'];
  let out = ''; try { out = spawnSync(FFMPEG, ['-hide_banner', '-encoders']).stdout.toString(); } catch (e) {}
  encoders = list.filter(e => out.includes(' ' + e + ' ')).filter(e => {
    if (e === 'libx264') return true;
    try { return spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=s=256x144:d=0.2', '-c:v', e, '-f', 'null', '-'], {timeout:8000}).status === 0; } catch (er) { return false; }
  });
  return encoders;
}
const ENC_ARGS = {
  libx264:['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency'],
  h264_nvenc:['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'll', '-rc', 'cbr'],
  h264_qsv:['-c:v', 'h264_qsv', '-preset', 'veryfast'],
  h264_amf:['-c:v', 'h264_amf', '-usage', 'lowlatency', '-rc', 'cbr'],
  h264_videotoolbox:['-c:v', 'h264_videotoolbox', '-realtime', '1']
};

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

function readJson(req) {
  return new Promise((ok, fail) => {
    let d = '';
    req.on('data', c => (d += c));
    req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { fail(e); } });
  });
}

function stopFf() {
  if (!ff) return;
  const p = ff; ff = null;
  try { p.stdin.end(); } catch (e) {}
  setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 4000);
}

function startFf({targets, url, vb = 4500, fps = 30, res = '1080', enc = 'libx264'}) {
  stopFf();
  targets = (targets && targets.length ? targets : [url]).filter(Boolean);
  vb = Math.max(500, +vb || 4500); fps = +fps || 30;
  if (!ENC_ARGS[enc] || !detectEncoders().includes(enc)) enc = 'libx264';
  const args = ['-hide_banner', '-loglevel', 'info', '-fflags', '+genpts', '-probesize', '1000000', '-analyzeduration', '1000000', '-i', 'pipe:0',
    '-map', '0:v:0', '-map', '0:a:0?', ...ENC_ARGS[enc],
    ...(res === '720' ? ['-vf', 'scale=-2:720'] : []),
    '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(fps * 2), '-keyint_min', String(fps * 2), ...(enc === 'libx264' ? ['-sc_threshold', '0'] : []),
    '-b:v', vb + 'k', '-maxrate', vb + 'k', '-bufsize', vb * 2 + 'k',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2'];
  if (targets.length === 1) args.push('-f', 'flv', targets[0]);
  else args.push('-f', 'tee', targets.map(t => '[f=flv:onfail=ignore]' + t).join('|'));   // víc míst najednou; když jedno spadne, ostatní jedou dál
  console.log(`▶ Start vysílání (${enc}, ${res}p, ${vb} kbps) →`, targets.map(t => t.replace(/[^/]+$/, '••••')).join(', '));
  const p = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  ff = p; stats = {};
  p.stdin.on('error', () => {});
  p.stderr.on('data', d => {
    const lines = d.toString().split(/\r|\n/).filter(Boolean);
    for (const s of lines) {
      const g = re => { const m = re.exec(s); return m ? +m[1] : undefined; };
      if (/frame=\s*\d+/.test(s) && /speed=/.test(s)) stats = {frame:g(/frame=\s*(\d+)/), fps:g(/fps=\s*([\d.]+)/), kbps:g(/bitrate=\s*([\d.]+)kbits/), drop:g(/drop=\s*(\d+)/) || 0, speed:g(/speed=\s*([\d.]+)x/)};
      else { last = s.trim(); if (/error|failed|refused|invalid|denied|unauthor/i.test(s)) console.log('ffmpeg:', s.trim()); }
    }
  });
  p.on('error', e => { last = 'CHYBA: ' + e.message; console.log(last); if (ff === p) ff = null; });
  p.on('close', code => { console.log('■ FFmpeg skončil (kód ' + code + ')'); if (ff === p) ff = null; });
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = req.url.split('?')[0];

  if (url === '/events') {
    res.writeHead(200, {'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive'});
    res.write(': ok\n\n'); clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  const act = /^\/action\/([\w.-]+)$/.exec(url);
  if (act) {
    const q = new URL(req.url, 'http://x').searchParams, v = q.has('v') ? +q.get('v') : undefined;
    const msg = 'data: ' + JSON.stringify({a:act[1], v}) + '\n\n'; clients.forEach(c => c.write(msg));
    return send(res, 200, clients.size ? 'ok' : 'Režie není připojená (zapni v Ovládání „Povolit ovládání přes server.js“)');
  }
  if (req.method === 'GET' && !['/status'].includes(url)) {
    const rel = url === '/' ? '/index.html' : decodeURIComponent(url);
    const file = path.normalize(path.join(__dirname, rel));
    if (!file.startsWith(__dirname + path.sep) || /server\.js$|\.md$|\.git/.test(file)) return send(res, 404, 'nenalezeno');
    return fs.readFile(file, (e, buf) => e ? send(res, 404, 'nenalezeno') : send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream'));
  }
  if (req.method === 'GET' && url === '/status') {
    return send(res, 200, JSON.stringify({ running: !!ff, ffmpeg: hasFfmpeg(), encoders: detectEncoders(), last, stats: ff ? stats : {} }), 'application/json');
  }
  if (req.method === 'POST' && url === '/start') {
    try {
      const cfg = await readJson(req);
      const t = (cfg.targets && cfg.targets.length ? cfg.targets : [cfg.url]);
      if (!t.every(u => /^rtmps?:\/\//.test(u || ''))) return send(res, 400, 'Špatná adresa (musí začínat rtmp:// nebo rtmps://)');
      if (!hasFfmpeg()) return send(res, 500, 'FFmpeg nenalezen. Nainstaluj ho (viz NAVOD.md).');
      last = ''; startFf(cfg); return send(res, 200, 'ok');
    } catch (e) { return send(res, 400, 'Chyba: ' + e.message); }
  }
  if (req.method === 'POST' && url === '/chunk') {
    if (!ff) { req.resume(); return send(res, 409, 'nevysílá se'); }
    const p = ff;
    req.on('data', d => { try { p.stdin.write(d); } catch (e) {} });
    req.on('end', () => send(res, 200, 'ok'));
    return;
  }
  if (req.method === 'POST' && url === '/stop') { stopFf(); return send(res, 200, 'ok'); }
  send(res, 404, 'nenalezeno');
}).listen(PORT, '127.0.0.1', () => {
  console.log('\n🎬 Režie Live běží na  http://localhost:' + PORT);
  console.log(hasFfmpeg() ? '✔ FFmpeg nalezen – vysílání bude fungovat. Kódování: ' + detectEncoders().join(', ') : '✖ FFmpeg NENALEZEN – režie poběží, ale vysílat nepůjde. Viz NAVOD.md.');
  console.log('Ukončení: Ctrl + C\n');
});
