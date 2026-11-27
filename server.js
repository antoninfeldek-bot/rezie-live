// Režie Live – přenosový server
// Spuštění:  node server.js     potom otevři  http://localhost:8080
// Potřebuje: Node.js 18+ a FFmpeg (příkaz "ffmpeg" musí fungovat v terminálu).
// Nic dalšího se instalovat nemusí (žádné npm balíčky).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const https = require('https');
const os = require('os');
const crypto = require('crypto');
const dgram = require('dgram');
const net = require('net');

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

function startFf({targets, url, vb = 4500, fps = 30, res = '1080', out, keyint = 2, profile = 'high', ab = 160, rc = 'cbr', enc = 'libx264'}) {
  stopFf();
  targets = (targets && targets.length ? targets : [url]).filter(Boolean);
  vb = Math.max(500, +vb || 4500); fps = Math.min(120, Math.max(10, +fps || 30));
  const gop = Math.max(1, Math.round(fps * (+keyint || 2))); ab = Math.min(320, Math.max(64, +ab || 160));
  if (!['high', 'main', 'baseline'].includes(profile)) profile = 'high';
  const scale = Array.isArray(out) && out.length === 2 && out.every(n => Number.isInteger(n) && n >= 160 && n <= 4096) ? ['-vf', `scale=${out[0]}:${out[1]}`] : res === '720' ? ['-vf', 'scale=-2:720'] : [];
  if (!ENC_ARGS[enc] || !detectEncoders().includes(enc)) enc = 'libx264';
  const args = ['-hide_banner', '-loglevel', 'info', '-fflags', '+genpts', '-probesize', '1000000', '-analyzeduration', '1000000', '-i', 'pipe:0',
    '-map', '0:v:0', '-map', '0:a:0?', ...ENC_ARGS[enc],
    ...scale, ...(enc !== 'h264_amf' ? ['-profile:v', profile] : []),
    '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(gop), '-keyint_min', String(gop), ...(enc === 'libx264' ? ['-sc_threshold', '0'] : []),
    '-b:v', vb + 'k', '-maxrate', (rc === 'vbr' ? Math.round(vb * 1.5) : vb) + 'k', '-bufsize', vb * 2 + 'k',
    '-c:a', 'aac', '-b:a', ab + 'k', '-ar', '44100', '-ac', '2'];
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

/* ================= MÍSTNÍ SÍŤ: dálkové ovládání (iPad, mobil, druhý počítač) a hosté přes odkaz =================
   Zapíná se až z režie (záložka 📱 Dálkově). Běží na zvláštním portu přes HTTPS (kamera v mobilu jinak nejde).
   Přístup jen s tajným klíčem v odkazu – bez něj nejde nic ovládat ani se připojit. Vysílání a klíče jsou jen pro tento počítač. */
const appClients = new Set();      // okno režie (SSE)
const remotes = new Set();         // připojená dálková ovládání
const guests = new Map();          // id → {res, name}
const prompters = new Set();       // iPady u čtecího zařízení
const crews = new Map();           // kameramani (interkom): id → {res, name}
let prState = '{}';
let lan = null, lanState = '{}';
const badKeys = new Map();         // ochrana proti hádání klíče
const LAN_FILES = ['/crew.html', '/js/crew-client.js', '/remote.html', '/guest.html', '/prompter.html', '/js/prompter-client.js', '/js/remote-client.js', '/js/guest-client.js', '/js/qr.js', '/css/remote.css'];
const toApp = o => { const m = 'data: ' + JSON.stringify(o) + '\n\n'; appClients.forEach(c => c.write(m)); };
const sse = (req, res, set, extra) => {
  res.writeHead(200, {'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive', 'X-Accel-Buffering':'no'});
  res.write(': ok\n\n'); if (set) set.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { clearInterval(ping); if (set) set.delete(res); extra && extra(); });
};
function certFiles() {
  const dir = process.env.CERT_DIR || path.join(os.homedir(), '.rezie-live');
  const key = path.join(dir, 'lan-key.pem'), crt = path.join(dir, 'lan-cert.pem');
  try { if (fs.existsSync(key) && fs.existsSync(crt)) return {key:fs.readFileSync(key), cert:fs.readFileSync(crt)}; } catch (e) {}
  try {
    fs.mkdirSync(dir, {recursive:true});
    const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650', '-subj', '/CN=Rezie Live', '-keyout', key, '-out', crt], {timeout:20000});
    if (r.status === 0) return {key:fs.readFileSync(key), cert:fs.readFileSync(crt)};
  } catch (e) {}
  return null;   // bez OpenSSL → obyčejné HTTP (ovládání funguje, kamera hosta v mobilu ne)
}
function lanIps() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ip:a.address, name});
  return out.sort((a, b) => (/^(en|wl|eth)/.test(b.name) ? 1 : 0) - (/^(en|wl|eth)/.test(a.name) ? 1 : 0));
}
const lanInfo = () => lan ? {turnErr:cfErr, tunnel:{status:tun.status, url:tun.url, err:tun.err}, on:true, port:lan.port, https:lan.https, ips:lanIps().map(x => x.ip), remotes:remotes.size, prompters:prompters.size, crews:[...crews].map(([id, c]) => ({id, name:c.name})), guests:[...guests].map(([id, g]) => ({id, name:g.name}))} : {on:false};
function lanHandler(req, res, online) {
  res.setHeader('Cache-Control', 'no-cache');
  const u = new URL(req.url, 'http://x'), p = u.pathname, k = u.searchParams.get('k') || '';
  const ip = online ? String(req.headers['cf-connecting-ip'] || 'x') : req.socket.remoteAddress;
  const bad = badKeys.get(ip);
  if (bad && bad.n >= 30 && Date.now() - bad.t < 600000) return send(res, 429, 'Příliš mnoho pokusů – zkus to za 10 minut');
  const ok = (key) => { const g = key && k.length === key.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(key)); if (!g && k) { const b = badKeys.get(ip) || {n:0, t:Date.now()}; if (Date.now() - b.t > 600000) { b.n = 0; b.t = Date.now(); } b.n++; badKeys.set(ip, b); } return g; };
  // přes internet (tunel) jde jen připojení hosta – ovladač a čtečka zůstávají jen v místní síti
  if (online && !(p === '/guest' || p.startsWith('/g/') || p === '/js/guest-client.js' || p === '/crew' || p.startsWith('/c/') || p === '/js/crew-client.js' || p === '/css/remote.css')) return send(res, 404, 'nenalezeno');
  if (p === '/c/config' || p === '/g/config') { if (!ok(p === '/c/config' ? lan.ckey : lan.gkey)) return send(res, 403, 'Špatný odkaz'); return iceAll().then(l => send(res, 200, JSON.stringify({iceServers:l}), 'application/json')); }
  if (req.method === 'GET' && (p === '/' || p === '/remote')) return serveFile(res, '/remote.html');
  if (req.method === 'GET' && p === '/guest') return serveFile(res, '/guest.html');
  if (req.method === 'GET' && p === '/prompter') return serveFile(res, '/prompter.html');
  if (req.method === 'GET' && p === '/crew') return serveFile(res, '/crew.html');
  // interkom – kameramani
  if (p === '/c/poll') { if (!ok(lan.ckey)) return send(res, 403, 'Špatný odkaz'); return mbPoll(crews, req, res, u, 'Kameraman'); }
  if (p === '/c/leave' && req.method === 'POST') { if (!ok(lan.ckey)) return send(res, 403, 'Špatný odkaz'); return readJson(req).then(d => { if (crews.delete(d.id)) toApp({t:'crewLeave', id:d.id}); send(res, 200, 'ok'); }).catch(() => send(res, 400, 'chyba')); }
  if ((p === '/c/offer' || p === '/c/msg') && req.method === 'POST') {
    if (!ok(lan.ckey)) return send(res, 403, 'Špatný odkaz');
    return readJson(req).then(d => {
      if (!d.id || !crews.has(d.id)) return send(res, 400, 'chyba');
      if (!appClients.size) return send(res, 503, 'Režie teď neběží');
      if (p === '/c/offer') { if (typeof d.sdp !== 'string' || d.sdp.length > 100000) return send(res, 400, 'chyba'); toApp({t:'crewOffer', id:d.id, name:String(d.name || 'Kameraman').slice(0, 40), sdp:d.sdp}); }
      else toApp({t:'crewMsg', id:d.id, kind:String(d.kind || '').slice(0, 20), text:String(d.text || '').slice(0, 200), cam:String(d.cam || '').slice(0, 40)});
      send(res, 200, 'ok');
    }).catch(() => send(res, 400, 'chyba'));
  }
  // host odpovídá na pokyn režie (👍 / ⏳ / ❌)
  if (p === '/g/msg' && req.method === 'POST') {
    if (!ok(lan.gkey)) return send(res, 403, 'Špatný odkaz');
    return readJson(req).then(d => { if (!d.id || !guests.has(d.id)) return send(res, 400, 'chyba'); toApp({t:'guestMsg', id:d.id, text:String(d.text || '').slice(0, 200)}); send(res, 200, 'ok'); }).catch(() => send(res, 400, 'chyba'));
  }
  // čtečka (jen zobrazení textu)
  if (p === '/p/events') {
    if (!ok(lan.pkey)) return send(res, 403, 'Špatný klíč');
    if (req.method === 'HEAD') return send(res, 200, '');
    sse(req, res, prompters, () => toApp({t:'prompters', n:prompters.size}));
    res.write('data: ' + prState + '\n\n'); toApp({t:'prompters', n:prompters.size}); return;
  }
  if (req.method === 'GET' && LAN_FILES.includes(p)) return serveFile(res, p);
  // dálkové ovládání
  if (p === '/r/events') {
    if (!ok(lan.pin)) return send(res, 403, 'Špatný klíč');
    if (req.method === 'HEAD') return send(res, 200, '');
    sse(req, res, remotes, () => toApp({t:'remotes', n:remotes.size}));
    res.write('data: ' + lanState + '\n\n'); toApp({t:'remotes', n:remotes.size}); return;
  }
  if (p === '/r/act' && req.method === 'POST') {
    if (!ok(lan.pin)) return send(res, 403, 'Špatný klíč');
    return readJson(req).then(d => { if (typeof d.a === 'string' && d.a.length < 80) toApp({t:'act', a:d.a, v:d.v}); send(res, 200, appClients.size ? 'ok' : 'režie neběží'); }).catch(() => send(res, 400, 'chyba'));
  }
  // hosté
  if (p === '/g/poll') { if (!ok(lan.gkey)) return send(res, 403, 'Špatný odkaz'); return mbPoll(guests, req, res, u, 'Host'); }
  if (p === '/g/leave' && req.method === 'POST') { if (!ok(lan.gkey)) return send(res, 403, 'Špatný odkaz'); return readJson(req).then(d => { if (guests.delete(d.id)) toApp({t:'leave', id:d.id}); send(res, 200, 'ok'); }).catch(() => send(res, 400, 'chyba')); }
  if (p === '/g/offer' && req.method === 'POST') {
    if (!ok(lan.gkey)) return send(res, 403, 'Špatný odkaz');
    return readJson(req).then(d => {
      if (!d.id || !guests.has(d.id) || typeof d.sdp !== 'string' || d.sdp.length > 100000) return send(res, 400, 'chyba');
      if (!appClients.size) return send(res, 503, 'Režie teď neběží');
      toApp({t:'offer', id:d.id, name:String(d.name || 'Host').slice(0, 40), sdp:d.sdp}); send(res, 200, 'ok');
    }).catch(() => send(res, 400, 'chyba'));
  }
  send(res, 404, 'nenalezeno');
}
function serveFile(res, rel) {
  const file = path.join(__dirname, rel);
  fs.readFile(file, (e, buf) => e ? send(res, 404, 'nenalezeno') : send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream'));
}
/* Schránka zpráv pro hosty a kameramany: long-polling (dotaz čeká až 25 s na zprávu).
   Projde i tunelem Cloudflare – ten SSE (živý proud zpráv) nepodporuje. */
function flushMb(m) { const r = m.wait; if (!r) return; m.wait = null; clearTimeout(m.wt); m.last = Date.now(); send(r, 200, JSON.stringify(m.q.splice(0)), 'application/json'); }
function mbPush(m, obj) { m.q.push(obj); if (m.q.length > 300) m.q.shift(); flushMb(m); }
function mbPoll(map, req, res, u, defName) {
  if (req.method === 'HEAD') return send(res, 200, '');
  const id = (u.searchParams.get('id') || '').replace(/[^\w-]/g, '').slice(0, 40); if (!id) return send(res, 400, 'chybí id');
  const s = (u.searchParams.get('s') || '').slice(0, 20), name = (u.searchParams.get('name') || defName).slice(0, 40);
  let m = map.get(id), fresh = false;
  if (!m || m.s !== s) { if (m) flushMb(m); m = {name, s, q:[], wait:null, wt:null, last:Date.now()}; map.set(id, m); fresh = true; }   // nové připojení / znovu načtená stránka
  m.name = name; m.last = Date.now();
  if (m.wait) flushMb(m);
  if (fresh || m.q.length) return send(res, 200, JSON.stringify(m.q.splice(0)), 'application/json');
  m.wait = res; m.wt = setTimeout(() => { if (m.wait === res) flushMb(m); }, 25000);
  req.on('close', () => { if (m.wait === res) { clearTimeout(m.wt); m.wait = null; } });
}
setInterval(() => {   // kdo se 40 s neozval, odešel
  for (const [map, type] of [[guests, 'leave'], [crews, 'crewLeave']]) for (const [id, m] of map) if (!m.wait && Date.now() - m.last > 40000) { map.delete(id); toApp({t:type, id}); }
}, 5000).unref();

/* TURN od Cloudflare (zdarma s velkým limitem): režie zadá Key ID + API token, server si vyžádá dočasné přihlašovací údaje */
let cfIce = null, cfErr = '';
async function iceAll() {
  let l = Array.isArray(lan && lan.ice) ? lan.ice.slice() : [];
  const t = lan && lan.cft;
  if (t && t.id && t.token) {
    if (!cfIce || Date.now() > cfIce.exp || cfIce.key !== t.id + t.token) {
      try {
        const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(t.id)}/credentials/generate-ice-servers`, {method:'POST', headers:{Authorization:'Bearer ' + t.token, 'Content-Type':'application/json'}, body:JSON.stringify({ttl:86400}), signal:AbortSignal.timeout(8000)});
        if (!r.ok) throw new Error('Cloudflare TURN: ' + r.status + (r.status === 401 || r.status === 403 ? ' (špatné Key ID nebo token)' : ''));
        const j = await r.json();
        const servers = (j.iceServers || []).map(s => ({...s, urls:[].concat(s.urls).filter(x => !/:53(\?|$)/.test(x))})).filter(s => s.urls.length);
        cfIce = {ice:servers, exp:Date.now() + 20 * 3600e3, key:t.id + t.token}; cfErr = '';
      } catch (e) { cfErr = e.message; cfIce = null; }
    }
    if (cfIce) l = l.concat(cfIce.ice);
  }
  return l;
}

/* Test rychlosti internetu (servery Cloudflare): odezva, stahování, odesílání */
let speedBusy = false;
async function speedTest() {
  if (speedBusy) throw new Error('test už běží'); speedBusy = true;
  const B = 'https://speed.cloudflare.com', now = () => performance.now(), sig = () => AbortSignal.timeout(25000);
  try {
    const pings = [];
    for (let i = 0; i < 5; i++) { const a = now(); await (await fetch(B + '/__down?bytes=0', {cache:'no-store', signal:sig()})).arrayBuffer(); pings.push(now() - a); }
    pings.sort((x, y) => x - y);
    let a = now(); const dn = await (await fetch(B + '/__down?bytes=15000000', {cache:'no-store', signal:sig()})).arrayBuffer();
    const down = dn.byteLength * 8 / ((now() - a) / 1000) / 1e6;
    const up1 = () => fetch(B + '/__up', {method:'POST', body:Buffer.alloc(4e6), headers:{'Content-Type':'application/octet-stream'}, signal:sig()}).then(r => r.arrayBuffer());
    a = now(); await Promise.all([up1(), up1()]);
    const up = 8e6 * 8 / ((now() - a) / 1000) / 1e6;
    return {ping:Math.round(pings[2]), down:+down.toFixed(1), up:+up.toFixed(1), t:Date.now()};
  } finally { speedBusy = false; }
}

/* PTZ kamery: VISCA přes síť (Sony/BirdDog VISCA-over-IP UDP 52381, PTZOptics/většina čínských TCP 5678 nebo UDP 1259) */
const ptzS = {udp:null, seq:0, tcp:new Map()};
function ptzSend(c) {
  return new Promise(res => {
    try {
      const ip = String(c.ip || '').trim(), hex = String(c.hex || '').replace(/\s+/g, '');
      if (!/^[\w.-]{1,253}$/.test(ip) || !/^8[0-7]([0-9a-fA-F]{2}){1,14}[fF]{2}$/.test(hex)) return res({ok:false, error:'špatný příkaz nebo adresa'});
      const payload = Buffer.from(hex, 'hex'), proto = c.proto || 'visca-udp';
      if (proto === 'visca-udp' || proto === 'visca-raw-udp') {
        if (!ptzS.udp) { ptzS.udp = dgram.createSocket('udp4'); ptzS.udp.on('error', () => {}); ptzS.udp.unref(); }
        let pk = payload;
        if (proto === 'visca-udp') { const hd = Buffer.alloc(8); hd.writeUInt16BE(0x0100, 0); hd.writeUInt16BE(payload.length, 2); hd.writeUInt32BE(ptzS.seq = (ptzS.seq + 1) >>> 0, 4); pk = Buffer.concat([hd, payload]); }
        ptzS.udp.send(pk, +c.port || (proto === 'visca-udp' ? 52381 : 1259), ip, er => res(er ? {ok:false, error:er.message} : {ok:true}));
      } else {
        const key = ip + ':' + (+c.port || 5678); let s = ptzS.tcp.get(key);
        if (!s || s.destroyed) {
          s = net.connect({host:ip, port:+c.port || 5678}); s.setNoDelay(true); s.on('error', () => { ptzS.tcp.delete(key); }); s.on('data', () => {}); s.setTimeout(60000, () => s.destroy()); ptzS.tcp.set(key, s);
        }
        s.write(payload, er => res(er ? {ok:false, error:er.message} : {ok:true}));
        setTimeout(() => res({ok:false, error:'kamera neodpovídá'}), 3000);
      }
    } catch (e) { res({ok:false, error:e.message}); }
  });
}

function lanStart(cfg) {
  if (lan) { lan.pin = cfg.pin || lan.pin; lan.gkey = cfg.gkey || lan.gkey; lan.pkey = cfg.pkey || lan.pkey; lan.ckey = cfg.ckey || lan.ckey; if (Array.isArray(cfg.ice)) lan.ice = cfg.ice; if (cfg.cft) lan.cft = cfg.cft; return Promise.resolve(lanInfo()); }
  const c = certFiles();
  const srv = c ? https.createServer(c, lanHandler) : http.createServer(lanHandler);
  return new Promise((ok, fail) => {
    const tryPort = port => {
      srv.once('error', e => { if (e.code === 'EADDRINUSE' && port < PORT + 120) tryPort(port + 1); else fail(e); });
      srv.listen(port, '0.0.0.0', () => { lan = {srv, port, https:!!c, pin:cfg.pin, gkey:cfg.gkey, pkey:cfg.pkey, ckey:cfg.ckey, cft:cfg.cft || null, ice:Array.isArray(cfg.ice) ? cfg.ice : []}; console.log(`📱 Dálkové ovládání a hosté: ${c ? 'https' : 'http'}://${(lanIps()[0] || {}).ip || 'IP'}:${port}`); ok(lanInfo()); });
    };
    tryPort(+process.env.LAN_PORT || PORT + 363);
  });
}
/* ---------- hosté přes internet: tunel Cloudflare (zdarma, bez účtu) ----------
   cloudflared vytvoří veřejnou https adresu *.trycloudflare.com (platný certifikát → kamera v mobilu jde bez varování).
   Tunel vede na zvláštní místní port, který umí JEN stránku hosta a jeho připojení – nic jiného z internetu nejde. */
const tun = {want:false, proc:null, srv:null, port:0, url:'', status:'off', err:'', retry:0, timer:null};
const tunEmit = () => toApp({t:'tunnel', status:tun.status, url:tun.url, err:tun.err});
function cloudflaredPath() {
  if (process.env.CLOUDFLARED && fs.existsSync(process.env.CLOUDFLARED)) return process.env.CLOUDFLARED;
  for (const f of ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', '/usr/bin/cloudflared']) if (fs.existsSync(f)) return f;
  return 'cloudflared';
}
function tunnelStart() {
  if (!lan) return Promise.reject(new Error('Nejdřív zapni místní síť'));
  tun.want = true; tun.err = '';
  const go = () => {
    if (!tun.want || tun.proc) return;
    tun.status = 'starting'; tun.url = ''; tunEmit();
    const p = spawn(cloudflaredPath(), ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${tun.port}`], {stdio:['ignore', 'pipe', 'pipe']});
    tun.proc = p; let buf = '';
    const onData = d => {
      buf = (buf + d).slice(-4000);
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf);
      if (m && tun.url !== m[0]) { tun.url = m[0]; tun.status = 'on'; tun.retry = 0; tunEmit(); console.log('🌍 Hosté přes internet: ' + tun.url); }
      if (/failed to (request quick Tunnel|unmarshal)|429 Too Many Requests/i.test(buf) && tun.status !== 'on') tun.err = 'Cloudflare teď tunel nevytvořil – zkusím to znovu';
    };
    p.stdout.on('data', onData); p.stderr.on('data', onData);
    p.on('error', e => { tun.proc = null; tun.want = false; tun.status = 'off'; tun.err = e.code === 'ENOENT' ? 'Chybí program cloudflared (v aplikaci pro Mac je přibalený; jinak: brew install cloudflared)' : e.message; tunEmit(); });
    p.on('close', () => {
      if (tun.proc !== p) return; tun.proc = null; tun.url = '';
      if (!tun.want) { tun.status = 'off'; tunEmit(); return; }
      tun.status = 'starting'; tun.err = tun.err || 'Tunel spadl – připojuji znovu'; tunEmit();
      tun.timer = setTimeout(go, Math.min(30000, 2000 * 2 ** tun.retry++));
    });
  };
  if (tun.srv) { go(); return Promise.resolve(); }
  return new Promise((ok, fail) => {
    tun.srv = http.createServer((q, r) => { if (!lan) return send(r, 503, 'Režie neběží'); lanHandler(q, r, true); });
    tun.srv.once('error', fail);
    tun.srv.listen(0, '127.0.0.1', () => { tun.port = tun.srv.address().port; go(); ok(); });
  });
}
function tunnelStop() {
  tun.want = false; clearTimeout(tun.timer);
  const p = tun.proc; tun.proc = null; if (p) try { p.kill(); } catch (e) {}
  if (tun.srv) { try { tun.srv.close(); tun.srv.closeAllConnections && tun.srv.closeAllConnections(); } catch (e) {} tun.srv = null; }
  tun.url = ''; tun.status = 'off'; tunEmit();
}
process.on('exit', () => { try { tun.proc && tun.proc.kill(); } catch (e) {} });

function lanStop() {
  tunnelStop();
  if (!lan) return; const s = lan.srv; lan = null;
  remotes.forEach(r => { try { r.end(); } catch (e) {} }); remotes.clear();
  guests.forEach(g => flushMb(g)); guests.clear();
  prompters.forEach(r => { try { r.end(); } catch (e) {} }); prompters.clear();
  crews.forEach(c => flushMb(c)); crews.clear();
  try { s.close(); s.closeAllConnections && s.closeAllConnections(); } catch (e) {}
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
  // --- místní síť (jen z tohoto počítače) ---
  if (/^\/(lan|app-events|net|data|ptz)/.test(url)) {
    const o = req.headers.origin;   // cizí webová stránka v prohlížeči nesmí síť zapnout ani číst
    if (o && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return send(res, 403, 'zakázáno');
  }
  if (url === '/app-events') { sse(req, res, appClients); return; }
  if (url === '/lan' && req.method === 'POST') {
    try { const d = await readJson(req); if (d.on) return send(res, 200, JSON.stringify(await lanStart(d)), 'application/json'); lanStop(); return send(res, 200, JSON.stringify(lanInfo()), 'application/json'); }
    catch (e) { return send(res, 500, 'Síť se nespustila: ' + e.message); }
  }
  if (url === '/lan' && req.method === 'GET') return send(res, 200, JSON.stringify(lanInfo()), 'application/json');
  if (url === '/lan/state' && req.method === 'POST') {
    let d = ''; req.on('data', c => { d += c; if (d.length > 2e6) req.destroy(); });
    req.on('end', () => { lanState = d || '{}'; const m = 'data: ' + lanState + '\n\n'; remotes.forEach(r => r.write(m)); send(res, 200, String(remotes.size)); });
    return;
  }
  // data pro titulky (Google tabulky, CSV, JSON) – stáhne server, aby nevadila omezení prohlížeče
  if (url.startsWith('/data/fetch')) {
    try {
      const u = new URL(req.url, 'http://x').searchParams.get('url') || '';
      if (!/^https?:\/\//.test(u)) return send(res, 400, 'špatná adresa');
      const r = await fetch(u, {redirect:'follow', signal:AbortSignal.timeout(10000), headers:{'User-Agent':'RezieLive'}});
      const t = await r.text(); if (!r.ok) return send(res, 502, 'Zdroj odpověděl ' + r.status);
      return send(res, 200, t.slice(0, 2e6), 'text/plain; charset=utf-8');
    } catch (e) { return send(res, 502, 'Nedostupné: ' + (e.name === 'TimeoutError' ? 'neodpovídá' : e.message)); }
  }
  if (url === '/ptz' && req.method === 'POST') { try { return send(res, 200, JSON.stringify(await ptzSend(await readJson(req))), 'application/json'); } catch (e) { return send(res, 400, 'chyba'); } }
  if (url === '/net/speed' && req.method === 'POST') {
    try { return send(res, 200, JSON.stringify(await speedTest()), 'application/json'); }
    catch (e) { return send(res, 500, 'Test rychlosti selhal: ' + (e.name === 'TimeoutError' ? 'internet neodpovídá' : e.message)); }
  }
  if (url === '/lan/ice' && req.method === 'GET') { const l = await iceAll(); return send(res, 200, JSON.stringify({iceServers:l, turn:l.some(s => [].concat(s.urls).some(x => /^turns?:/.test(x))), err:cfErr}), 'application/json'); }
  if (url === '/lan/tunnel' && req.method === 'POST') {
    try { const d = await readJson(req); if (d.on) await tunnelStart(); else tunnelStop(); return send(res, 200, JSON.stringify(lanInfo()), 'application/json'); }
    catch (e) { return send(res, 400, e.message); }
  }
  if (url === '/lan/prompter' && req.method === 'POST') {
    let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { prState = d || '{}'; const m = 'data: ' + prState + '\n\n'; prompters.forEach(r => r.write(m)); send(res, 200, String(prompters.size)); });
    return;
  }
  const cm = /^\/lan\/crew\/([\w-]+)$/.exec(url);
  if (cm && req.method === 'POST') {
    try { const d = await readJson(req), c = crews.get(cm[1]); if (!c) return send(res, 404, 'není připojen'); mbPush(c, d); return send(res, 200, 'ok'); }
    catch (e) { return send(res, 400, 'chyba'); }
  }
  const gm = /^\/lan\/guest\/([\w-]+)$/.exec(url);
  if (gm && req.method === 'POST') {
    try { const d = await readJson(req), g = guests.get(gm[1]); if (!g) return send(res, 404, 'host není připojen'); mbPush(g, d); return send(res, 200, 'ok'); }
    catch (e) { return send(res, 400, 'chyba'); }
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
module.exports = {ptzSend};
