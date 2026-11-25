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

function hasFfmpeg() {
  try { return spawnSync(FFMPEG, ['-version']).status === 0; } catch (e) { return false; }
}

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type });
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

function startFf({ url, vb = 4500, fps = 30 }) {
  stopFf();
  vb = Math.max(500, +vb || 4500); fps = +fps || 30;
  const args = [
    '-hide_banner', '-loglevel', 'info',
    '-fflags', '+genpts', '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(fps * 2), '-keyint_min', String(fps * 2), '-sc_threshold', '0',
    '-b:v', vb + 'k', '-maxrate', vb + 'k', '-bufsize', vb * 2 + 'k',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2',
    '-f', 'flv', url
  ];
  console.log('▶ Start vysílání →', url.replace(/[^/]+$/, '••••'));
  const p = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  ff = p;
  p.stdin.on('error', () => {});
  p.stderr.on('data', d => {
    const s = d.toString().trim().split(/\r|\n/).filter(Boolean).pop();
    if (s) { last = s; if (/error|failed|refused|invalid/i.test(s)) console.log('ffmpeg:', s); }
  });
  p.on('error', e => { last = 'CHYBA: ' + e.message; console.log(last); if (ff === p) ff = null; });
  p.on('close', code => { console.log('■ FFmpeg skončil (kód ' + code + ')'); if (ff === p) ff = null; });
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && (url === '/' || url === '/rezie.html')) {
    return fs.readFile(path.join(__dirname, 'rezie.html'), (e, buf) =>
      e ? send(res, 404, 'rezie.html nenalezen vedle server.js') : send(res, 200, buf, 'text/html; charset=utf-8'));
  }
  if (req.method === 'GET' && url === '/status') {
    return send(res, 200, JSON.stringify({ running: !!ff, ffmpeg: hasFfmpeg(), last }), 'application/json');
  }
  if (req.method === 'POST' && url === '/start') {
    try {
      const cfg = await readJson(req);
      if (!/^rtmps?:\/\//.test(cfg.url || '')) return send(res, 400, 'Špatná adresa (musí začínat rtmp:// nebo rtmps://)');
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
  console.log(hasFfmpeg() ? '✔ FFmpeg nalezen – vysílání bude fungovat.' : '✖ FFmpeg NENALEZEN – režie poběží, ale vysílat nepůjde. Viz NAVOD.md.');
  console.log('Ukončení: Ctrl + C\n');
});
