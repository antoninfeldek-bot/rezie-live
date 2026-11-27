'use strict';
/* ================= 🆕 Aktualizace (jen v desktopové aplikaci) =================
   Při spuštění se jednou za 12 hodin podívá na GitHub, jestli je nová verze. Během vysílání nic neinstaluje. */
const UPD = (() => {
  const can = () => !!(window.rzNative && window.rzNative.updCheck);
  const ST = {cur:'', latest:'', newer:false, err:'', busy:false, pct:0, checked:false};
  async function check(manual) {
    if (!can()) return;
    ST.busy = true; draw();
    const r = await window.rzNative.updCheck().catch(e => ({ok:false, error:e.message}));
    ST.busy = false; ST.checked = true;
    if (!r.ok) { ST.err = r.error || ''; if (manual) toast(L('Aktualizace se nepodařilo zjistit:') + ' ' + ST.err); draw(); return; }
    Object.assign(ST, {cur:r.current, latest:r.latest, newer:r.newer, can:r.canInstall, err:''});
    try { localStorage.setItem('rz_upd_t', String(Date.now())); } catch (e) {}
    if (r.newer) banner(); else if (manual) toast('✅ ' + L('Máš nejnovější verzi') + ' ' + r.current);
    draw();
  }
  async function install() {
    if (R.stream || R.rec || R.iso.length) { alert(L('Nejdřív ukonči vysílání a nahrávání – aktualizace aplikaci zavře.')); return; }
    if (!ST.can) { window.rzNative.updPage(); return; }
    ST.busy = true; ST.pct = 0; draw(); save();
    const r = await window.rzNative.updInstall().catch(e => ({ok:false, error:e.message}));
    ST.busy = false; draw();
    if (!r.ok) { alert(L('Aktualizace selhala:') + ' ' + r.error); return; }
    if (r.how === 'dmg') alert(L('Nová verze je stažená a otevřená. Zavři Režii Live, přetáhni novou ikonu do složky Aplikace a vyber „Nahradit“.'));
  }
  function banner() {
    if (document.getElementById('updBar')) return;
    const b = document.createElement('div'); b.id = 'updBar'; b.className = 'updbar';
    b.innerHTML = `🆕 ${L('Je nová verze')} <b>${esc(ST.latest)}</b> (${L('máš')} ${esc(ST.cur)}) <button data-upd="go">${L('Aktualizovat')}</button> <button data-upd="what">${L('Co je nového')}</button> <button data-upd="x">✕</button>`;
    document.body.appendChild(b);
  }
  function draw() {
    const el = document.getElementById('updBox'); if (el) el.outerHTML = box();
    const bar = document.getElementById('updBar'), go = bar && bar.querySelector('[data-upd=go]');
    if (go) go.textContent = ST.busy ? L('Stahuji…') + ' ' + ST.pct + ' %' : L('Aktualizovat');
  }
  function box() {
    if (!can()) return '';
    return `<div class="sec" id="updBox"><b>🆕 ${L('Verze aplikace')}</b> ${esc(ST.cur || '…')}
      ${ST.newer ? ` · <b>${L('nová verze')} ${esc(ST.latest)}</b> <button data-upd="go">${ST.busy ? L('Stahuji…') + ' ' + ST.pct + ' %' : L('Aktualizovat')}</button>` : `<button data-upd="check">${ST.busy ? L('Zjišťuji…') : L('Zkontrolovat aktualizace')}</button>`}
      ${ST.err ? `<span class="dim">${esc(ST.err)}</span>` : ''}</div>`;
  }
  function init() {
    if (!can()) return;
    window.rzNative.info().then(i => { ST.cur = i.version || ''; draw(); }).catch(() => {});
    window.rzNative.onUpdProgress(p => { ST.pct = p; draw(); });
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-upd]'); if (!b) return;
      const a = b.dataset.upd;
      if (a === 'check') check(true); if (a === 'go') install(); if (a === 'what') window.rzNative.updPage();
      if (a === 'x') { const bar = document.getElementById('updBar'); if (bar) bar.remove(); }
    });
    let last = 0; try { last = +localStorage.getItem('rz_upd_t') || 0; } catch (e) {}
    if (Date.now() - last > 12 * 3600e3) setTimeout(() => check(false), 6000);
  }
  return {init, check, box};
})();
