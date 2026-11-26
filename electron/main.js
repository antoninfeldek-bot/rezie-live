// Režie Live – desktopová aplikace (Electron)
// Spustí vestavěný server (vysílání přes FFmpeg) a otevře režii v okně aplikace.
const { app, BrowserWindow, systemPreferences, session, shell, dialog, ipcMain, powerSaveBlocker } = require('electron');
const { Streamer } = require('./streamer.js');
const net = require('net');
const path = require('path');

app.setName('Režie Live');
// macOS a Chromium nesmí aplikaci brzdit, když je zakrytá nebo minimalizovaná
app.commandLine.appendSwitch('disable-renderer-backgrounding');
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
