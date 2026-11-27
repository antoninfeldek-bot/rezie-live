// Režie Live – desktopová aplikace (Electron)
// Spustí vestavěný server (vysílání přes FFmpeg) a otevře režii v okně aplikace.
const { app, BrowserWindow, systemPreferences, session, shell, dialog, ipcMain, powerSaveBlocker } = require('electron');
const { Streamer } = require('./streamer.js');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

app.setName('Režie Live');
// macOS a Chromium nesmí aplikaci brzdit, když je zakrytá nebo minimalizovaná
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// plný výkon grafiky: výkonná grafická karta (u MacBooků se dvěma), kreslení a video bez zbytečných kopií
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

function freePort(p) {
  return new Promise(res => {
    const s = net.createServer();
    s.once('error', () => res(freePort(p + 1)));
    s.once('listening', () => s.close(() => res(p)));
    s.listen(p, '127.0.0.1');
  });
}

function ffmpegPath() {
  try {
    let p = require('ffmpeg-static');
    if (p) return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
  } catch (e) {}
  return null;
}

let mainWin = null;
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    try { await systemPreferences.askForMediaAccess('camera'); } catch (e) {}
    try { await systemPreferences.askForMediaAccess('microphone'); } catch (e) {}
  }
  const ff = ffmpegPath();
  if (ff) process.env.FFMPEG = ff;
  const port = await freePort(8080);
  process.env.PORT = String(port);
  { const cf = path.join(process.resourcesPath || '', 'bin', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'); if (fs.existsSync(cf)) process.env.CLOUDFLARED = cf; }   // tunel pro hosty přes internet
  process.env.CERT_DIR = path.join(app.getPath('userData'), 'cert');   // certifikát pro dálkové ovládání v místní síti
  try { require(path.join(__dirname, '..', 'server.js')); }
  catch (e) { dialog.showErrorBox('Režie Live', 'Vnitřní server se nespustil: ' + e.message); }

  // kamera, mikrofon, obrazovka, MIDI… – aplikace je jen pro tebe, takže vše povolit
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(true));
  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    const { desktopCapturer } = require('electron');
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then(src => cb({ video: src[0], audio: process.platform === 'darwin' ? undefined : 'loopback' })).catch(() => cb({}));
  }, { useSystemPicker: true });

  mainWin = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 1100, minHeight: 680, backgroundColor: '#0d0e11', title: 'Režie Live', show: false,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required', preload: path.join(__dirname, 'preload.js') }
  });
  mainWin.once('ready-to-show', () => { mainWin.maximize(); mainWin.show(); });
  // okna Program / Multiview / Čtečka (window.open) povolit, odkazy ven otevřít v prohlížeči
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank') return { action: 'allow', overrideBrowserWindowOptions: { backgroundColor: '#000000', autoHideMenuBar: true, webPreferences: { backgroundThrottling: false } } };
    shell.openExternal(url); return { action: 'deny' };
  });
  mainWin.loadURL(`http://127.0.0.1:${port}/`);

  // ---- nativní vysílání ----
  const streamer = new Streamer({ ffmpeg: ff || 'ffmpeg' });
  const send = (ch, d) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(ch, d); };
  let blocker = null;   // Mac během vysílání neusne (ani když zaklapneš displej s připojeným monitorem)
  streamer.on('status', s => {
    send('rz:status', s);
    if (s.running && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!s.running && blocker !== null) { try { powerSaveBlocker.stop(blocker); } catch (e) {} blocker = null; }
  });
  streamer.on('needKey', () => send('rz:needKey'));
  streamer.on('log', l => send('rz:log', l));
  // ---- ochrana proti pádu: když okno režie spadne nebo zamrzne, vysílání jede dál se záložním obrazem a režie se sama obnoví ----
  let reloading = false, hangT = null;
  const recover = why => {
    if (reloading || !mainWin || mainWin.isDestroyed()) return; reloading = true;
    streamer.log('Režie ' + why + ' – obnovuji…'); streamer.hold();
    setTimeout(() => { reloading = false; if (mainWin && !mainWin.isDestroyed()) mainWin.loadURL(`http://127.0.0.1:${port}/?recover=1`); }, 800);
  };
  mainWin.webContents.on('render-process-gone', (e, d) => { if (d.reason !== 'clean-exit') recover('spadla (' + d.reason + ')'); });
  mainWin.on('unresponsive', () => { clearTimeout(hangT); hangT = setTimeout(() => { try { mainWin.webContents.forcefullyCrashRenderer(); } catch (er) {} recover('zamrzla'); }, 8000); });
  mainWin.on('responsive', () => clearTimeout(hangT));
  mainWin.webContents.on('did-start-navigation', (e, url, inPlace, isMain) => { if (isMain && !inPlace) streamer.hold(); });   // ruční znovunačtení (Cmd+R) taky nesmí shodit vysílání
  ipcMain.handle('rz:state', () => streamer.state());
  // ---- Web / chat jako zdroj: neviditelné okno kreslí stránku, snímky jdou do režie ----
  const webs = new Map();
  ipcMain.on('rz:web:open', (e, c) => {
    const old = webs.get(c.id); if (old && !old.isDestroyed()) old.destroy();
    if (!/^https?:\/\//.test(c.url || '')) return;
    const w = new BrowserWindow({show:false, width:c.w | 0 || 1280, height:c.h | 0 || 720, transparent:!!c.transparent, frame:false, useContentSize:true,
      webPreferences:{offscreen:true, sandbox:true, contextIsolation:true, backgroundThrottling:false, autoplayPolicy:'no-user-gesture-required'}});
    webs.set(c.id, w);
    w.webContents.setFrameRate(Math.min(60, Math.max(1, c.fps | 0 || 30)));
    w.webContents.setAudioMuted(true);
    w.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    if (c.transparent) w.setBackgroundColor('#00000000');
    w.webContents.on('did-finish-load', () => { if (c.css) w.webContents.insertCSS(c.css).catch(() => {}); });
    w.webContents.on('paint', (ev, dirty, image) => {
      if (!mainWin || mainWin.isDestroyed()) return;
      const sz = image.getSize(); mainWin.webContents.send('rz:web:frame', {id:c.id, w:sz.width, h:sz.height, buf:image.toBitmap()});
    });
    w.loadURL(c.url).catch(() => {});
  });
  ipcMain.on('rz:web:close', (e, id) => { const w = webs.get(id); if (w && !w.isDestroyed()) w.destroy(); webs.delete(id); });
  // ---- PTZ kamery (VISCA přes síť) ----
  ipcMain.handle('rz:ptz', (e, c) => require('../server.js').ptzSend ? require('../server.js').ptzSend(c) : {ok:false});
  // ---- NDI výstup: pomocný program ndi-send (knihovnu NDI si najde v počítači) ----
  let ndi = null;
  const ndiSend = st => send('rz:ndi:status', st);
  const ndiBin = () => [...['ndi-send', 'ndi-send.exe'].flatMap(n => [path.join(process.resourcesPath || '', 'bin', n), path.join(__dirname, 'ndi', n)])].find(f => { try { return fs.existsSync(f); } catch (e) { return false; } });
  const pkt = (t, buf) => { const h = Buffer.alloc(5); h[0] = t.charCodeAt(0); h.writeUInt32LE(buf.length, 1); return [h, buf]; };
  ipcMain.handle('rz:ndi:start', (e, c) => new Promise(res => {
    if (ndi) { try { ndi.kill(); } catch (er) {} ndi = null; }
    const bin = ndiBin(); if (!bin) return res({ok:false, error:'chybí ndi-send'});
    const p = spawn(bin, [String(c.name || 'Režie Live – Program'), String(c.w | 0), String(c.h | 0), String(c.fpsN | 0 || 30), String(c.fpsD | 0 || 1), String(c.rate | 0 || 48000)], {stdio:['pipe', 'pipe', 'ignore']});
    ndi = p; let done = false, buf = '';
    p.stdin.on('error', () => {});
    p.stdout.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (l.startsWith('OK')) { if (!done) { done = true; res({ok:true}); } ndiSend({state:'on', conns:0}); }
        else if (l.startsWith('CONN')) ndiSend({state:'on', conns:+l.split(' ')[1] || 0});
        else if (l.startsWith('ERR')) { const m = l.slice(4); if (!done) { done = true; res({ok:false, error:m}); } ndiSend({state:'error', msg:m}); }
      }
    });
    p.on('error', er => { if (!done) { done = true; res({ok:false, error:er.message}); } });
    p.on('close', () => { if (ndi === p) { ndi = null; ndiSend({state:'off'}); } if (!done) { done = true; res({ok:false, error:'nolib'}); } });
    setTimeout(() => { if (!done) { done = true; res({ok:false, error:'neodpovídá'}); } }, 8000);
  }));
  // snímky: když pomocný program nestíhá (víc než ~3 snímky ve frontě), snímek se zahodí – nikdy se nehromadí
  ipcMain.on('rz:ndi:v', (e, u8) => { if (!ndi || ndi.stdin.writableLength > u8.length * 3) return; const [h, b] = pkt('V', Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)); ndi.stdin.write(h); ndi.stdin.write(b); });
  ipcMain.on('rz:ndi:a', (e, u8) => { if (!ndi || ndi.stdin.writableLength > 8e6) return; const [h, b] = pkt('A', Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)); ndi.stdin.write(h); ndi.stdin.write(b); });
  ipcMain.on('rz:ndi:stop', () => { const p = ndi; ndi = null; if (p) { try { p.stdin.write(Buffer.from([81, 0, 0, 0, 0])); p.stdin.end(); } catch (er) {} setTimeout(() => { try { p.kill(); } catch (er) {} }, 1500); } ndiSend({state:'off'}); });
  app.on('before-quit', () => { if (ndi) try { ndi.kill(); } catch (er) {} });
  ipcMain.handle('rz:resume', (e, cfg) => streamer.resume(cfg));
  ipcMain.handle('rz:info', () => ({ ffmpeg: streamer.available(), protocols: streamer.protocols(), videos: path.join(app.getPath('videos'), 'Rezie Live'), platform: process.platform, version: app.getVersion() }));
  ipcMain.handle('rz:start', (e, cfg) => {
    if (cfg.record && cfg.record.dir) cfg.record.path = path.join(cfg.record.dir, cfg.record.name || ('Rezie_' + Date.now() + '.mkv'));
    return streamer.start(cfg);
  });
  ipcMain.handle('rz:stop', () => streamer.stop());
  ipcMain.on('rz:v', (e, u8, key) => streamer.video(u8, key));
  ipcMain.on('rz:a', (e, u8) => streamer.audio(u8));
  ipcMain.handle('rz:open', (e, p) => { if (p) shell.openPath(p); });
  ipcMain.handle('rz:pick', async () => { const r = await dialog.showOpenDialog(mainWin, { properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
  app.on('before-quit', () => streamer.stop());
});

app.on('window-all-closed', () => app.quit());
