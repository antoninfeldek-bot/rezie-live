'use strict';
/* ================= ✂ Střihový list: každé přepnutí programu s časem =================
   Běží, když se nahrává nebo vysílá. Export:
   – EDL (CMX 3600) pro Premiere, DaVinci Resolve, Final Cut (přes převod) – přestřih z ISO nahrávek kamer
   – kapitoly pro YouTube (00:00 Úvod …)
   – CSV se značkami (čas, scéna, kamera) */
const CUT = (() => {
  let sess = null;          // {start, list:[{t, scene, cam}]}
  let last = null;          // poslední hotový list
  const active = () => !!(R.rec || R.iso.length || R.stream);
  const VIDEO_T = ['camera', 'netin', 'ndiin', 'guest', 'screen', 'video', 'playlist', 'slides', 'replay', 'web', 'image'];
  function mainCam(sc) {
    if (!sc) return '';
    let best = null, area = -1;
    for (const l of sc.layers) {
      if (!l.visible) continue; const s = srcById(l.sourceId); if (!s || !VIDEO_T.includes(s.type)) continue;
      const a = Math.max(0, Math.min(l.w, W) * Math.min(l.h, H)); if (a > area) { area = a; best = s; }
    }
    return best ? best.name : '';
  }
  function take(id) {
    if (!sess) return;
    const sc = sceneById(id); if (!sc) return;
    const t = (performance.now() - sess.start) / 1000, prev = sess.list[sess.list.length - 1];
    if (prev && prev.scene === sc.name && prev.cam === mainCam(sc)) return;
    if (prev && t - prev.t < 0.04) sess.list.pop();
    sess.list.push({t, scene:sc.name, cam:mainCam(sc)});
  }
  function mark(name) { if (sess) { sess.marks.push({t:(performance.now() - sess.start) / 1000, name:name || L('Značka') + ' ' + (sess.marks.length + 1)}); toast('📍 ' + L('Značka uložena')); render(); } }
  function tick() {
    if (active() && !sess) {
      const st = R.rec ? R.rec.start : R.iso.length ? R.isoStart : R.stream ? R.stream.start : performance.now();
      sess = {start:st, wall:new Date(Date.now() - (performance.now() - st)), list:[], marks:[]}; const sc = sceneById(S.programId); if (sc) sess.list.push({t:0, scene:sc.name, cam:mainCam(sc)}); render();
    } else if (!active() && sess) { sess.end = (performance.now() - sess.start) / 1000; if (sess.list.length) last = sess; sess = null; render(); }
  }
  /* ---------- exporty ---------- */
  const fpsN = () => Math.round(CFG.video.fps) || 30;
  const tc = (sec, base) => { const f = fpsN(), n = Math.round((sec + (base || 0)) * f), p = x => String(x).padStart(2, '0'); return `${p(Math.floor(n / f / 3600))}:${p(Math.floor(n / f / 60) % 60)}:${p(Math.floor(n / f) % 60)}:${p(n % f)}`; };
  const reel = n => (n || 'AX').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32) || 'AX';
  function edl(x) {
    const end = x.end || (performance.now() - x.start) / 1000, base = 3600;
    let out = `TITLE: Rezie Live ${x.wall.toLocaleString('cs-CZ')}\nFCM: NON-DROP FRAME\n\n`;
    x.list.forEach((c, i) => {
      const a = c.t, b = i + 1 < x.list.length ? x.list[i + 1].t : end; if (b - a <= 0) return;
      const n = String(i + 1).padStart(3, '0');
      out += `${n}  ${reel(c.cam || c.scene).padEnd(8)} V     C        ${tc(a)} ${tc(b)} ${tc(a, base)} ${tc(b, base)}\n* FROM CLIP NAME: ${c.cam || c.scene}\n* COMMENT: ${c.scene}\n\n`;
    });
    for (const m of x.marks) out += `* LOC: ${tc(m.t, base)} RED ${m.name}\n`;
    return out;
  }
  function chapters(x) {
    const p2 = n => String(n).padStart(2, '0'), hh = (x.end || 0) >= 3600;
    const f = s => (hh ? Math.floor(s / 3600) + ':' + p2(Math.floor(s / 60) % 60) : Math.floor(s / 60)) + ':' + p2(Math.floor(s % 60));
    const items = [...x.list.map(c => ({t:c.t, n:c.scene})), ...x.marks.map(m => ({t:m.t, n:m.name}))].sort((a, b) => a.t - b.t);
    const out = [];
    for (const it of items) {   // YouTube: kapitola aspoň 10 s, první 0:00, stejné názvy za sebou sloučit
      if (out.length && out[out.length - 1].n === it.n) continue;
      if (out.length && it.t - out[out.length - 1].t < 10) { out[out.length - 1].n = it.n; continue; }
      out.push({t:out.length ? it.t : 0, n:it.n});
    }
    return out.map(c => `${f(c.t)} ${c.n}`).join('\n');
  }
  function csv(x) {
    const rows = [['cas_s', 'timecode', 'typ', 'scena', 'kamera']];
    x.list.forEach(c => rows.push([c.t.toFixed(2), tc(c.t), 'strih', c.scene, c.cam]));
    x.marks.forEach(m => rows.push([m.t.toFixed(2), tc(m.t), 'znacka', m.name, '']));
    return rows.map(r => r.map(v => /[",;\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join('\n');
  }
  function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const stampOf = x => x.wall.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  function render() {
    const el = $('#cutBox'); if (!el) return;
    const x = sess || last;
    el.innerHTML = `<div class="sec"><h4>✂ ${L('Střihový list a kapitoly')}</h4>
      <p class="dim">${L('Když nahráváš nebo vysíláš, zapisuje se každé přepnutí programu. Pak si stáhneš EDL pro střih z ISO nahrávek (Premiere, DaVinci) nebo kapitoly do popisu na YouTube.')}</p>
      ${sess ? `<p>🔴 ${L('Zapisuje se')} – ${L('střihů')}: <b>${sess.list.length}</b>, ${L('značek')}: <b>${sess.marks.length}</b> <button data-cut="mark">📍 ${L('Značka')} (M)</button></p>` : ''}
      ${x ? `<div class="btns"><button data-cut="edl">⬇ EDL</button><button data-cut="yt">⬇ ${L('Kapitoly YouTube')}</button><button data-cut="csv">⬇ CSV</button><button data-cut="copy">📋 ${L('Zkopírovat kapitoly')}</button></div>
        <details><summary>${L('Náhled kapitol')}</summary><pre class="cutpre">${esc(chapters(Object.assign({}, x, {end:x.end || (performance.now() - x.start) / 1000})))}</pre></details>` : `<p class="dim">${L('Zatím nic – spusť nahrávání nebo vysílání.')}</p>`}</div>`;
  }
  function init() {
    setInterval(tick, 300);
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-cut]'); if (!b) return;
      const x = sess ? Object.assign({}, sess, {end:(performance.now() - sess.start) / 1000}) : last; const a = b.dataset.cut;
      if (a === 'mark') return mark();
      if (!x) return;
      if (a === 'edl') dl(`rezie-${stampOf(x)}.edl`, edl(x), 'text/plain');
      if (a === 'yt') dl(`kapitoly-${stampOf(x)}.txt`, chapters(x), 'text/plain');
      if (a === 'csv') dl(`strihy-${stampOf(x)}.csv`, '﻿' + csv(x), 'text/csv');
      if (a === 'copy') navigator.clipboard.writeText(chapters(x)).then(() => toast(L('Kapitoly zkopírovány – vlož je do popisu videa'))).catch(() => {});
    });
    addEventListener('keydown', e => {
      if (e.code !== 'KeyM' || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '') || e.target.isContentEditable) return;
      if (sess) { mark(); e.preventDefault(); }
    });
  }
  return {init, take, mark, render, _edl:edl, _chapters:chapters};
})();
