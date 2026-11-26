// Režie Live – nativní vysílací jádro
// Obraz přichází už zakódovaný (H.264, z grafické karty přes WebCodecs), zvuk jako PCM.
// Každé místo (YouTube, Facebook, SRT, záznam na disk…) má vlastní FFmpeg proces:
//   – video se jen kopíruje (žádné druhé kódování → minimální zátěž)
//   – když jedno místo vypadne, ostatní jedou dál a to vypadlé se samo připojí znovu
//   – pojistná nahrávka na disk je úplně nezávislá na internetu
const { spawn, spawnSync } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const MAX_BACKLOG = 24 * 1024 * 1024;     // když se ve frontě nahromadí víc, místo se restartuje
const CONGESTED = 3 * 1024 * 1024;         // od kolika bajtů ve frontě hlásit „pomalý internet“

function protocolsOf(ffmpeg) {
  try { const out = spawnSync(ffmpeg, ['-hide_banner', '-protocols']).stdout.toString(); return ['rtmp', 'rtmps', 'srt', 'tls'].filter(p => new RegExp('^\\s+' + p + '$', 'm').test(out)); }
  catch (e) { return []; }
}
function formatFor(url) {
  if (/^srt:/i.test(url)) return 'mpegts';
  if (/^rtmps?:/i.test(url)) return 'flv';
  if (/\.mkv$/i.test(url)) return 'matroska';
  if (/\.ts$/i.test(url)) return 'mpegts';
  return 'flv';
}

class Output {
  constructor(parent, t) {
    this.p = parent; this.id = t.id; this.name = t.name || t.id; this.url = t.url; this.kind = t.kind || (/^\w+:\/\//.test(t.url) ? 'net' : 'file');
    this.state = 'starting'; this.restarts = 0; this.stats = {}; this.last = ''; this.proc = null; this.needKey = true; this.stopping = false; this.backoff = 1000; this.startedAt = 0; this.part = 0;
    this.spawn();
  }
  args() {
    const { fps, rate } = this.p.cfg;
    const fmt = formatFor(this.url), arOut = fmt === 'flv' ? '44100' : String(rate);
    let url = this.url;
    if (this.kind === 'file' && this.part > 0) url = url.replace(/(\.\w+)$/, `_cast${this.part + 1}$1`);
    return ['-hide_banner', '-loglevel', 'info', '-nostdin',
      '-thread_queue_size', '4096', '-probesize', '200000', '-analyzeduration', '0', '-f', 'h264', '-framerate', String(fps), '-i', 'pipe:3',
      '-thread_queue_size', '4096', '-f', 's16le', '-ar', String(rate), '-ac', '2', '-i', 'pipe:4',
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', this.kind === 'file' ? Math.max(256, this.p.cfg.ab || 160) + 'k' : (this.p.cfg.ab || 160) + 'k', '-ar', arOut,
      ...(fmt === 'flv' ? ['-flvflags', 'no_duration_filesize'] : []),
      ...(fmt === 'mpegts' && this.kind === 'net' ? ['-mpegts_flags', 'resend_headers', '-pes_payload_size', '0'] : []),
      '-f', fmt, url];
  }
  spawn() {
    if (this.stopping) return;
    if (this.kind === 'file') { try { fs.mkdirSync(path.dirname(this.url), { recursive: true }); } catch (e) {} }
    const p = spawn(this.p.ffmpeg, this.args(), { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
    this.proc = p; this.needKey = true; this.state = 'starting'; this.stats = {}; this.startedAt = Date.now();
    p.stdio[3].on('error', () => {}); p.stdio[4].on('error', () => {});
    p.stderr.on('data', d => {
      for (const s of d.toString().split(/\r|\n/).filter(Boolean)) {
        if (/time=\s*\d/.test(s) && /speed=\s*[\d.]+x/.test(s)) {
          const g = re => { const m = re.exec(s); return m ? +m[1] : undefined; };
          this.stats = { fps: g(/fps=\s*([\d.]+)/), kbps: g(/bitrate=\s*([\d.]+)kbits/), speed: g(/speed=\s*([\d.]+)x/), time: (/time=\s*([\d:.]+)/.exec(s) || [])[1] };
          if (this.state === 'starting' || this.state === 'reconnecting') { this.state = 'live'; this.backoff = 1000; }
        } else { this.last = s.trim(); if (/error|failed|refused|denied|unauthor|invalid|forbidden|timed out|broken pipe|reset by peer/i.test(s)) this.p.log(`${this.name}: ${this.last}`); }
      }
    });
    p.on('error', e => { this.last = e.message; this.p.log(`${this.name}: ${e.message}`); });
    p.on('close', code => {
      if (this.proc !== p) return; this.proc = null;
      if (this.stopping) { this.state = 'stopped'; return; }
      this.restarts++; this.state = 'reconnecting'; if (this.kind === 'file') this.part++;
      const wait = Math.min((this.p.cfg.retryMax || 10) * 1000, this.backoff); this.backoff *= 2;
      this.p.log(`${this.name}: spojení přerušeno (kód ${code}) – znovu za ${Math.round(wait / 1000)} s`);
      setTimeout(() => this.spawn(), wait);
    });
    this.p.emit('needKey');
  }
  feed(video, buf, key) {
    const p = this.proc; if (!p) return;
    if (video) { if (this.needKey) { if (!key) return; this.needKey = false; } }
    else if (this.needKey) return;                     // zvuk začne posílat až s prvním klíčovým snímkem (synchronní start)
    const s = p.stdio[video ? 3 : 4];
    if (!s || s.destroyed) return;
    s.write(buf);
    if (s.writableLength > MAX_BACKLOG) { this.p.log(`${this.name}: internet nestíhá – restartuji spojení`); this.kill(); }
  }
  backlog() { const p = this.proc; return p ? (p.stdio[3].writableLength || 0) + (p.stdio[4].writableLength || 0) : 0; }
  kill() { const p = this.proc; if (!p) return; try { p.stdio[3].destroy(); p.stdio[4].destroy(); } catch (e) {} try { p.kill('SIGKILL'); } catch (e) {} }
  stop() {
    this.stopping = true; const p = this.proc; if (!p) { this.state = 'stopped'; return; }
    try { p.stdio[3].end(); p.stdio[4].end(); } catch (e) {}
    setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 5000);
  }
  info() {
    const b = this.backlog();
    return { id: this.id, name: this.name, kind: this.kind, state: this.state, restarts: this.restarts, last: this.last, backlogKB: Math.round(b / 1024),
      congested: this.kind === 'net' && b > CONGESTED, ...this.stats, uptime: this.state === 'live' ? Math.round((Date.now() - this.startedAt) / 1000) : 0, file: this.kind === 'file' ? this.url : undefined };
  }
}

/* Záložní obraz („Technické potíže“), když okno režie spadne nebo se načítá znovu.
   Vysílání tak nikdy nevypadne – FFmpeg dostává pořád obraz i zvuk (ticho) a časová osa pokračuje bez mezery. */
class Slate {
  constructor(st) { this.st = st; this.proc = null; this.timer = null; }
  start() {
    if (this.proc) return;
    const { fps, rate, w = 1920, h = 1080 } = this.st.cfg, st = this.st;
    const fonts = ['/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf'];
    const font = fonts.find(f => { try { return fs.existsSync(f); } catch (e) { return false; } });
    const vf = font && st.drawtext !== false ? ['-vf', `drawtext=fontfile='${font.replace(/:/g, '\\:')}':text='${(st.slateText || 'Technické potíže – hned jsme zpět').replace(/['\\:]/g, ' ')}':fontcolor=white:fontsize=${Math.round(h / 16)}:x=(w-text_w)/2:y=(h-text_h)/2`] : [];
    const args = ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi', '-i', `color=c=0x101826:s=${w}x${h}:r=${fps}`, ...vf,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-x264-params', `keyint=${fps * 2}:min-keyint=${fps * 2}:scenecut=0:sliced-threads=0:bframes=0`,
      '-b:v', '800k', '-f', 'h264', 'pipe:1'];
    const p = spawn(st.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = p; let buf = Buffer.alloc(0), err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => {
      if (this.proc !== p) return; this.proc = null;
      if (code && vf.length && st.drawtext !== false && /drawtext|Font|filter/i.test(err)) { st.drawtext = false; this.stopAudio(); return this.start(); }  // FFmpeg bez písma → jen barva
    });
    // rozdělení H.264 proudu na jednotlivé snímky (podle NAL jednotek)
    let au = [], hasKey = false;
    const flush = () => { if (!au.length) return; st.feedVideo(Buffer.concat(au), hasKey); au = []; hasKey = false; };
    p.stdout.on('data', d => {
      buf = Buffer.concat([buf, d]); let i = 0, last = -1;
      const starts = [];
      for (i = 0; i + 3 < buf.length; i++) if (buf[i] === 0 && buf[i + 1] === 0 && (buf[i + 2] === 1 || (buf[i + 2] === 0 && buf[i + 3] === 1))) { starts.push(i); i += 2; }
      for (let k = 0; k < starts.length - 1; k++) {
        const s = starts[k], e = starts[k + 1], nal = buf.subarray(s, e), off = buf[s + 2] === 1 ? 3 : 4, t = buf[s + off] & 31;
        if ((t === 9 || t === 7 || t === 6) && au.some(x => { const o = x[2] === 1 ? 3 : 4; const tt = x[o] & 31; return tt === 1 || tt === 5; })) flush();
        au.push(Buffer.from(nal)); if (t === 5) hasKey = true;
        if (t === 1 || t === 5) flush();
        last = e;
      }
      if (last > 0) buf = buf.subarray(last);
    });
    // ticho ve stejném tempu jako obraz
    const t0 = Date.now(); let sent = 0;
    this.timer = setInterval(() => {
      const due = Math.floor((Date.now() - t0) / 1000 * rate), n = due - sent; if (n <= 0) return;
      sent = due; st.feedAudio(Buffer.alloc(n * 4));
    }, 20);
    st.log('Záložní obraz „Technické potíže“ – vysílání běží dál');
  }
  stopAudio() { clearInterval(this.timer); this.timer = null; }
  stop() { this.stopAudio(); const p = this.proc; this.proc = null; if (p) try { p.kill('SIGKILL'); } catch (e) {} }
  get on() { return !!(this.proc || this.timer); }
}

class Streamer extends EventEmitter {
  constructor(opts = {}) { super(); this.ffmpeg = opts.ffmpeg || process.env.FFMPEG || 'ffmpeg'; this.outs = []; this.running = false; this.logs = []; this.timer = null; this.slate = new Slate(this); this.slateText = opts.slateText; }
  available() { try { return spawnSync(this.ffmpeg, ['-version']).status === 0; } catch (e) { return false; } }
  protocols() { return this._protos || (this._protos = protocolsOf(this.ffmpeg)); }
  log(s) { const line = new Date().toLocaleTimeString() + '  ' + s; this.logs.push(line); if (this.logs.length > 200) this.logs.shift(); this.emit('log', line); }
  start(cfg) {
    if (this.running) this.stop();
    if (!this.available()) throw new Error('FFmpeg nenalezen');
    this.cfg = { fps: cfg.fps || 30, rate: cfg.rate || 48000, w: cfg.w || 1920, h: cfg.h || 1080, ab: Math.min(320, Math.max(64, +cfg.ab || 160)), retryMax: Math.min(60, Math.max(2, +cfg.retryMax || 10)), delay: Math.min(120, Math.max(0, +cfg.delay || 0)) };
    this.dq = []; clearInterval(this.dqT); this.dqT = null;
    this.startCfg = cfg; this.slate.stop(); if (cfg.slateText) this.slateText = cfg.slateText;
    const targets = (cfg.targets || []).filter(t => t.url);
    if (cfg.record && cfg.record.path) targets.push({ id: 'record', name: 'Pojistná nahrávka', url: cfg.record.path, kind: 'file' });
    if (!targets.length) throw new Error('Není nastavené žádné místo');
    const protos = this.protocols();
    for (const t of targets) { const m = /^(\w+):/.exec(t.url); if (m && !['file'].includes(m[1]) && protos.length && !protos.includes(m[1].toLowerCase())) throw new Error(`Tahle verze FFmpeg neumí protokol ${m[1]}`); }
    this.running = true; this.outs = targets.map(t => new Output(this, t));
    this.log(`Vysílání spuštěno: ${targets.map(t => t.name).join(', ')}${this.cfg.delay ? ` (zpoždění ${this.cfg.delay} s)` : ''}`);
    this.timer = setInterval(() => this.emit('status', this.status()), 1000);
    return this.status();
  }
  // zpoždění vysílání: síťová místa dostanou data o N sekund později, pojistná nahrávka hned
  route(video, b, key) {
    const d = this.cfg.delay;
    for (const o of this.outs) if (!d || o.kind !== 'net') o.feed(video, b, key);
    if (!d) return;
    this.dq.push({ t: Date.now() + d * 1000, video, b, key });
    if (!this.dqT) this.dqT = setInterval(() => {
      const now = Date.now();
      while (this.dq.length && this.dq[0].t <= now) { const x = this.dq.shift(); for (const o of this.outs) if (o.kind === 'net') o.feed(x.video, x.b, x.key); }
    }, 10);
  }
  feedVideo(b, key) { this.route(true, b, key); }
  feedAudio(b) { this.route(false, b, false); }
  video(buf, key) { if (!this.running || this.slate.on) return; this.feedVideo(Buffer.from(buf), key); }
  audio(buf) { if (!this.running || this.slate.on) return; this.feedAudio(Buffer.from(buf)); }
  // okno režie spadlo / načítá se → záložní obraz, vysílání jede dál
  hold() { if (this.running && !this.slate.on) { this.slate.start(); this.emit('status', this.status()); } }
  // okno je zpět → přepnout ze záložního obrazu zpátky na program (bez nového připojení)
  resume(cfg = {}) {
    if (!this.running) return { running: false };
    const fps = cfg.fps || this.cfg.fps, rate = cfg.rate || this.cfg.rate, w = cfg.w || this.cfg.w, h = cfg.h || this.cfg.h;
    if (fps !== this.cfg.fps || rate !== this.cfg.rate || w !== this.cfg.w || h !== this.cfg.h) {
      this.log('Jiné nastavení zvuku/obrazu – připojuji místa znovu');
      const sc = this.startCfg; this.stop(); this.start({ ...sc, fps, rate, w, h }); return { running: true, restarted: true };
    }
    this.slate.stop(); this.outs.forEach(o => { o.needKey = !!o.proc; });   // každé místo počká na klíčový snímek z režie
    this.emit('needKey'); this.log('Režie je zpět – vysílá se znovu program');
    return { running: true, resumed: true };
  }
  state() { return { running: this.running, slate: this.slate.on, cfg: this.cfg, targets: this.running ? this.outs.filter(o => o.kind === 'net').map(o => o.name) : [] }; }
  needsKey() { return this.outs.some(o => o.proc && o.needKey); }
  status() { return { running: this.running, slate: this.slate.on, outs: this.outs.map(o => o.info()), log: this.logs.slice(-6) }; }
  stop() {
    this.slate.stop(); clearInterval(this.dqT); this.dqT = null; this.dq = [];
    if (!this.running) return; this.running = false; clearInterval(this.timer);
    this.outs.forEach(o => o.stop()); this.log('Vysílání ukončeno'); this.emit('status', this.status());
  }
}
module.exports = { Streamer };
