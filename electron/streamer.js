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
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', this.kind === 'file' ? '256k' : '160k', '-ar', arOut,
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
      const wait = Math.min(10000, this.backoff); this.backoff *= 2;
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

class Streamer extends EventEmitter {
  constructor(opts = {}) { super(); this.ffmpeg = opts.ffmpeg || process.env.FFMPEG || 'ffmpeg'; this.outs = []; this.running = false; this.logs = []; this.timer = null; }
  available() { try { return spawnSync(this.ffmpeg, ['-version']).status === 0; } catch (e) { return false; } }
  protocols() { return this._protos || (this._protos = protocolsOf(this.ffmpeg)); }
  log(s) { const line = new Date().toLocaleTimeString() + '  ' + s; this.logs.push(line); if (this.logs.length > 200) this.logs.shift(); this.emit('log', line); }
  start(cfg) {
    if (this.running) this.stop();
    if (!this.available()) throw new Error('FFmpeg nenalezen');
    this.cfg = { fps: cfg.fps || 30, rate: cfg.rate || 48000 };
    const targets = (cfg.targets || []).filter(t => t.url);
    if (cfg.record && cfg.record.path) targets.push({ id: 'record', name: 'Pojistná nahrávka', url: cfg.record.path, kind: 'file' });
    if (!targets.length) throw new Error('Není nastavené žádné místo');
    const protos = this.protocols();
    for (const t of targets) { const m = /^(\w+):/.exec(t.url); if (m && !['file'].includes(m[1]) && protos.length && !protos.includes(m[1].toLowerCase())) throw new Error(`Tahle verze FFmpeg neumí protokol ${m[1]}`); }
    this.running = true; this.outs = targets.map(t => new Output(this, t));
    this.log(`Vysílání spuštěno: ${targets.map(t => t.name).join(', ')}`);
    this.timer = setInterval(() => this.emit('status', this.status()), 1000);
    return this.status();
  }
  video(buf, key) { if (!this.running) return; const b = Buffer.from(buf); for (const o of this.outs) o.feed(true, b, key); }
  audio(buf) { if (!this.running) return; const b = Buffer.from(buf); for (const o of this.outs) o.feed(false, b, false); }
  needsKey() { return this.outs.some(o => o.proc && o.needKey); }
  status() { return { running: this.running, outs: this.outs.map(o => o.info()), log: this.logs.slice(-6) }; }
  stop() {
    if (!this.running) return; this.running = false; clearInterval(this.timer);
    this.outs.forEach(o => o.stop()); this.log('Vysílání ukončeno'); this.emit('status', this.status());
  }
}
module.exports = { Streamer };
