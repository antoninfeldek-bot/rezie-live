'use strict';
/* ================= 🔤 PÍSMA: přibalená + všechna nainstalovaná v počítači =================
   Fonty z počítače se načtou přes Local Font Access (Chrome/Edge/desktop aplikace) – jedno kliknutí,
   seznam názvů se pak pamatuje. Jinde jde název fontu napsat ručně. */
const FNT = (() => {
  const KEY = 'rezie-local-fonts';
  const BUILTIN = [
    ['Inter, system-ui, sans-serif', 'Inter (v aplikaci)'], ['"JetBrains Mono", monospace', 'JetBrains Mono (v aplikaci)'],
    ['system-ui, sans-serif', 'Systémové'], ['Arial, sans-serif', 'Arial'], ['"Arial Black", sans-serif', 'Arial Black'], ['Impact, sans-serif', 'Impact'],
    ['"Segoe UI", Roboto, sans-serif', 'Segoe / Roboto'], ['Helvetica, Arial, sans-serif', 'Helvetica'], ['Georgia, serif', 'Georgia'],
    ['"Times New Roman", serif', 'Times'], ['"Courier New", monospace', 'Courier']];
  let local = []; try { local = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) {}
  const can = () => typeof window.queryLocalFonts === 'function';
  const css = fam => `"${String(fam).replace(/["\\]/g, '')}", sans-serif`;
  const fam = v => { const m = String(v || '').match(/^\s*"([^"]+)"|^\s*([^,]+)/); return m ? (m[1] || m[2]).trim() : ''; };
  const escA = t => String(t).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');

  /* <option> seznam pro <select>; aktuální hodnota je v něm vždy (i když font na tomhle počítači není) */
  function options(cur) {
    const opt = (v, n) => `<option value='${escA(v)}' ${v === cur ? 'selected' : ''} style='font-family:${escA(v)}'>${escA(n)}</option>`;
    const known = BUILTIN.some(b => b[0] === cur) || local.some(f => css(f) === cur);
    let h = `<optgroup label="${L('V aplikaci a běžné')}">${BUILTIN.map(b => opt(b[0], b[1])).join('')}</optgroup>`;
    if (local.length) h += `<optgroup label="${L('Z počítače')} (${local.length})">${local.map(f => opt(css(f), f)).join('')}</optgroup>`;
    if (cur && !known) h = opt(cur, fam(cur) + ' ✱') + h;
    h += `<option value="__load">🖥 ${local.length ? L('Znovu načíst fonty z počítače…') : L('Načíst fonty z počítače…')}</option><option value="__custom">✎ ${L('Napsat název fontu…')}</option>`;
    return h;
  }

  async function loadLocal() {
    if (!can()) { alert(L('Tenhle prohlížeč neumí načíst seznam fontů. Použij desktopovou aplikaci, Chrome nebo Edge – nebo napiš název fontu ručně.')); return false; }
    try {
      const list = await window.queryLocalFonts();
      const set = new Set(); for (const f of list) if (f.family) set.add(f.family);
      local = [...set].sort((a, b) => a.localeCompare(b, 'cs'));
      try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) {}
      toast('🔤 ' + L('Načteno fontů z počítače') + ': ' + local.length);
      return true;
    } catch (e) { alert(L('Přístup k fontům byl zamítnut.') + ' ' + (e.message || '')); return false; }
  }

  /* počká, až prohlížeč font opravdu načte (aby první snímek nebyl náhradním písmem) */
  function ensure(font, weight) {
    if (!font || !document.fonts) return Promise.resolve();
    return Promise.all([400, weight || 700].map(w => document.fonts.load(`${w} 48px ${font}`).catch(() => null)));
  }

  /* obsluha <select>: vrátí novou hodnotu fontu, nebo null (zrušeno). Speciální volby vyřeší samo. */
  async function pick(sel, prev) {
    const v = sel.value;
    if (v === '__load') { const ok = await loadLocal(); sel.innerHTML = options(prev); return ok ? '__reload' : null; }
    if (v === '__custom') {
      const n = prompt(L('Název fontu přesně tak, jak je nainstalovaný (např. Bebas Neue):'), fam(prev));
      if (!n || !n.trim()) { sel.innerHTML = options(prev); return null; }
      const f = css(n.trim()); sel.innerHTML = options(f); await ensure(f); return f;
    }
    await ensure(v); return v;
  }
  return {options, loadLocal, ensure, pick, can, list:() => local.slice(), BUILTIN};
})();
