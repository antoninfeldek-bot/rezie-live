'use strict';
/* ================= NAHRÁVÁNÍ ROVNOU NA DISK (File System Access API) ================= */
const DISK = (() => {
  const ST = {dir:null, perm:'none'};
  const supported = () => 'showDirectoryPicker' in window;
  function idb(mode, fn) {
    return new Promise((res, rej) => {
      const r = indexedDB.open('rezie-live', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { const tx = r.result.transaction('kv', mode), st = tx.objectStore('kv'), q = fn(st); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); };
      r.onerror = () => rej(r.error);
    });
  }
  async function pick() {
    try {
      const d = await window.showDirectoryPicker({id:'rezie-rec', mode:'readwrite', startIn:'videos'});
      ST.dir = d; ST.perm = 'granted'; await idb('readwrite', s => s.put(d, 'dir')); renderBox();
    } catch (e) { if (e.name !== 'AbortError') alert('Složku se nepodařilo vybrat: ' + e.message); }
  }
  async function regrant() {
    if (!ST.dir) return;
    try { ST.perm = await ST.dir.requestPermission({mode:'readwrite'}); } catch (e) { ST.perm = 'denied'; }
    renderBox();
  }
  async function forget() { ST.dir = null; ST.perm = 'none'; try { await idb('readwrite', s => s.delete('dir')); } catch (e) {} renderBox(); }
  function open(fname) {
    if (!ST.dir || ST.perm !== 'granted') return null;
    const w = {size:0, ok:true, ws:null};
    w.q = ST.dir.getFileHandle(fname, {create:true}).then(h => h.createWritable()).then(ws => { w.ws = ws; }).catch(e => { w.ok = false; console.error(e); stLog && stLog('⚠ Nepodařilo se zapisovat na disk: ' + e.message); });
    w.write = blob => { w.size += blob.size; w.q = w.q.then(() => w.ws && w.ws.write(blob)).catch(e => { w.ok = false; console.error(e); }); };
    w.close = async () => { await w.q; try { if (w.ws) await w.ws.close(); } catch (e) { w.ok = false; } return w.ok; };
    return w;
  }
  function renderBox() {
    const b = $('#diskBox'); if (!b) return;
    if (!supported()) { b.innerHTML = '<p class="dim">Tenhle prohlížeč neumí ukládat rovnou do složky – nahrávky se po zastavení stáhnou. Pro ukládání na disk použij Chrome nebo Edge.</p>'; return; }
    if (ST.dir && ST.perm === 'granted') b.innerHTML = `<p>✅ Nahrávky se ukládají <b>průběžně rovnou do složky „${esc(ST.dir.name)}“</b>. Nic se nedrží v paměti, takže můžeš nahrávat hodiny a při pádu prohlížeče zůstane soubor uložený.</p>
      <div class="btns"><button id="dkPick">Změnit složku</button><button id="dkForget">Přestat ukládat do složky</button></div>`;
    else if (ST.dir) b.innerHTML = `<p>📁 Složka „${esc(ST.dir.name)}“ je vybraná, ale prohlížeč potřebuje znovu potvrdit přístup.</p><div class="btns"><button id="dkRegrant" class="primary">Povolit přístup ke složce</button><button id="dkPick">Vybrat jinou</button></div>`;
    else b.innerHTML = `<p class="dim">Teď se nahrávky drží v paměti a stáhnou se po zastavení (na dlouhé nahrávání to není ideální).</p><div class="btns"><button id="dkPick" class="primary">📁 Vybrat složku pro nahrávky</button></div>`;
    b.insertAdjacentHTML('beforeend', `<p class="dim" style="margin-top:8px">Formát nahrávek v tomhle prohlížeči: ${recFormatInfo()}</p>`);
    const p = $('#dkPick'), f = $('#dkForget'), g = $('#dkRegrant'); if (p) p.onclick = pick; if (f) f.onclick = forget; if (g) g.onclick = regrant;
  }
  async function init() {
    renderBox(); if (!supported()) return;
    try { const d = await idb('readonly', s => s.get('dir')); if (d) { ST.dir = d; ST.perm = await d.queryPermission({mode:'readwrite'}); } } catch (e) {}
    renderBox();
  }
  return {init, open, renderBox, dirName:() => ST.dir ? ST.dir.name : '', ready:() => !!ST.dir && ST.perm === 'granted', load() {}, save() {}};
})();
