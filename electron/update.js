// Režie Live – kontrola a stažení nové verze z GitHub Releases.
// Windows: stáhne instalátor a spustí ho (aplikace se zavře). Mac: stáhne .dmg a otevře ho – stačí přetáhnout do Aplikací.
const { app, net, shell } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const REPO = 'feldek-apps/rezie-live';

const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; } return false; };
function assetName() {
  if (process.platform === 'win32') return 'Rezie-Live-windows-x64-setup.exe';
  if (process.platform === 'darwin') return `Rezie-Live-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}.dmg`;
  return null;
}

module.exports = function setupUpdate({ ipcMain, send }) {
  let latest = null;
  ipcMain.handle('rz:upd:check', async () => {
    try {
      const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Rezie-Live' } });
      if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
      const j = await r.json(), ver = String(j.tag_name || '').replace(/^v/, ''), want = assetName();
      const a = (j.assets || []).find(x => x.name === want);
      latest = { ver, url: a ? a.browser_download_url : null, size: a ? a.size : 0, page: j.html_url, notes: String(j.body || '').slice(0, 1500) };
      return { ok: true, current: app.getVersion(), latest: ver, newer: newer(ver, app.getVersion()), canInstall: !!latest.url, page: latest.page };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('rz:upd:install', async () => {
    if (!latest || !latest.url || !/^https:\/\/github\.com\//.test(latest.url)) return { ok: false, error: 'žádná aktualizace' };
    const file = path.join(os.tmpdir(), path.basename(new URL(latest.url).pathname));
    try {
      const r = await net.fetch(latest.url); if (!r.ok || !r.body) return { ok: false, error: 'HTTP ' + r.status };
      const total = +r.headers.get('content-length') || latest.size || 0; let got = 0, lastPct = -1;
      const out = fs.createWriteStream(file), rd = r.body.getReader();
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        got += value.length; if (!out.write(Buffer.from(value))) await new Promise(res => out.once('drain', res));
        const pct = total ? Math.floor(got / total * 100) : 0; if (pct !== lastPct) { lastPct = pct; send('rz:upd:progress', pct); }
      }
      await new Promise(res => out.end(res));
      if (total && got < total * 0.98) return { ok: false, error: 'stažení se nedokončilo' };
      if (process.platform === 'win32') {
        spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
        setTimeout(() => app.quit(), 800);
        return { ok: true, how: 'installer' };
      }
      await shell.openPath(file);
      return { ok: true, how: 'dmg' };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('rz:upd:page', () => { if (latest && latest.page) shell.openExternal(latest.page); else shell.openExternal(`https://github.com/${REPO}/releases/latest`); });
};
