'use strict';
/* ================= OVLÁDÁNÍ: klávesy, MIDI, Stream Deck / Companion ================= */
const CTL = (() => {
  const ST = {learn:null, midi:null, last:'', es:null, esOk:false, cc:{}};
  function actions() {
    const A = [];
    const add = (id, label, run, cat, cont) => A.push({id, label, run, cat, cont:!!cont});
    add('take.cut', 'CUT – okamžité přepnutí', () => take('cut'), 'Přepínání');
    add('take.auto', 'AUTO – přechod', () => take('auto'), 'Přepínání');
    add('data.next', '📑 Data – další řádek', () => DAT.step(null, 1), 'Data');
    add('data.prev', '📑 Data – předchozí řádek', () => DAT.step(null, -1), 'Data');
    add('slides.next', '🗂 Prezentace – další snímek', () => EXT.slidesNext(), 'Prezentace');
    add('slides.prev', '🗂 Prezentace – předchozí snímek', () => EXT.slidesPrev(), 'Prezentace');
    for (let n = 1; n <= 9; n++) add('ptz.' + n, `🎥 PTZ předvolba ${n} (vybraná kamera)`, () => PTZ.preset(n), 'PTZ');
    add('replay.go', '⏪ Replay do vysílání', () => RPL.go(), 'Replay');
    add('replay.mark', '★ Replay – značka', () => RPL.mark(), 'Replay');
    add('out2', '🖥 Výstup 2 – otevřít / zavřít', () => OUT2.toggle(), 'Okna');
    add('tbar', 'T-bar (MIDI fader)', v => tbar(v), 'Přepínání', true);
    for (let i = 0; i < 9; i++) {
      const sc = S.scenes[i], n = sc ? sc.name : '(prázdné)';
      add('scene.pv.' + i, `Scéna ${i + 1} do náhledu – ${n}`, () => S.scenes[i] && setPreview(S.scenes[i].id), 'Scény');
      add('scene.pg.' + i, `Scéna ${i + 1} rovnou do vysílání – ${n}`, () => S.scenes[i] && takeScene(S.scenes[i].id, 'cut'), 'Scény');
    }
    (S.trs ? S.trs.list : []).slice(0, 8).forEach((t, i) => add('trans.' + i, `Vybrat přechod ${i + 1} – ${t.name}`, () => S.trs.list[i] && TR.select(S.trs.list[i].id), 'Přechody'));
    (S.gfx ? S.gfx.list : []).slice(0, 12).forEach((G, i) => add('gfx.' + i, `Grafika ${i + 1} IN/OUT – ${G.name}`, () => GFX.toggle(GFX.byIndex(i)), 'Grafika'));
    add('gfx.allout', 'Všechny grafiky OUT', () => S.gfx.list.forEach(G => GFX.setIn(G, false)), 'Grafika');
    add('rd.start', 'Scénář: start / stop', () => RUN.startStop(), 'Scénář'); add('rd.next', 'Scénář: další blok', () => RUN.next(), 'Scénář'); add('rd.prev', 'Scénář: předchozí blok', () => RUN.prev(), 'Scénář');
    add('prompter', 'Čtečka: start / pauza', () => togglePrompter(), 'Čtečka');
    add('prompter.faster', 'Čtečka: rychleji', () => setPrSpeed(R.prompter.speed + 10), 'Čtečka'); add('prompter.slower', 'Čtečka: pomaleji', () => setPrSpeed(R.prompter.speed - 10), 'Čtečka');
    add('prompter.reset', 'Čtečka: na začátek', () => { R.prompter.pos = 0; }, 'Čtečka');
    add('rec', 'Nahrávat program start/stop', () => toggleRec(), 'Nahrávání a vysílání'); add('iso', 'Nahrávat vše (ISO) start/stop', () => toggleIso(), 'Nahrávání a vysílání');
    add('stream', 'Vysílání start/stop', () => toggleStream(), 'Nahrávání a vysílání');
    S.sources.filter(s => s.audio && s.audio.gainN).forEach(s => {
      add('mute.' + s.id, `Ztlumit / zapnout – ${s.name}`, () => { s.audio.mute = !s.audio.mute; renderMixer(); if (POP.on('audio')) AUD.renderPage(); save(); }, 'Zvuk');
      add('fader.' + s.id, `Fader (MIDI) – ${s.name}`, v => { s.audio.vol = v <= 0 ? 0 : Math.pow(10, (-60 + v * 70) / 20); }, 'Zvuk', true);
    });
    add('fader.master', 'Fader MASTER (MIDI)', v => { masterFader.gain.value = v <= 0 ? 0 : Math.pow(10, (-60 + v * 70) / 20); }, 'Zvuk', true);
    add('page.rezie', 'Stránka Režie', () => showPage('rezie'), 'Stránky'); add('page.gfx', 'Stránka Grafika', () => showPage('gfx'), 'Stránky');
    add('page.audio', 'Stránka Zvuk', () => showPage('audio'), 'Stránky'); add('page.color', 'Stránka Barvy', () => showPage('color'), 'Stránky');
    return A;
  }
  function tbar(v) { TR.tbar(Math.round(v * 1000)); }
  function run(id, v) {
    const a = actions().find(x => x.id === id); if (!a) return false;
    try { a.cont ? a.run(v == null ? 1 : v) : a.run(); } catch (e) { console.error(e); }
    return true;
  }
  const defaults = () => {
    const m = [{a:'take.cut', k:{code:'Space'}}, {a:'take.auto', k:{code:'Enter'}}, {a:'take.auto', k:{code:'NumpadEnter'}}, {a:'prompter', k:{code:'KeyP'}}, {a:'rd.next', k:{code:'KeyN'}}, {a:'rd.prev', k:{code:'KeyB'}}];
    for (let i = 0; i < 9; i++) { m.push({a:'scene.pv.' + i, k:{code:'Digit' + (i + 1)}}); m.push({a:'scene.pg.' + i, k:{code:'Digit' + (i + 1), shift:true}}); }
    for (let i = 0; i < 8; i++) m.push({a:'gfx.' + i, k:{code:'F' + (i + 1)}});
    return m;
  };
  const kmatch = (k, e) => k.code === e.code && !!k.shift === e.shiftKey && !!k.ctrl === (e.ctrlKey || e.metaKey) && !!k.alt === e.altKey;
  const kname = k => (k.ctrl ? 'Ctrl+' : '') + (k.alt ? 'Alt+' : '') + (k.shift ? 'Shift+' : '') + k.code.replace(/^Key/, '').replace(/^Digit/, '').replace('Space', 'Mezerník').replace('Enter', 'Enter').replace('Arrow', '');
  const mname = m => `${m.type === 'cc' ? 'CC' : 'Nota'} ${m.n} · kan. ${m.ch + 1}`;

  function key(e) {
    if (ST.learn && ST.learn.kind === 'key') {
      if (e.key === 'Escape') { ST.learn = null; renderTab(); return true; }
      if (['Shift','Control','Alt','Meta'].includes(e.key)) return true;
      const k = {code:e.code, shift:e.shiftKey || undefined, ctrl:(e.ctrlKey || e.metaKey) || undefined, alt:e.altKey || undefined};
      S.ctl.map = S.ctl.map.filter(m => !(m.k && kmatch(m.k, {code:k.code, shiftKey:!!k.shift, ctrlKey:!!k.ctrl, metaKey:false, altKey:!!k.alt})));
      S.ctl.map.push({a:ST.learn.a, k}); ST.learn = null; renderTab(); save(); return true;
    }
    if (e.repeat) return false;
    const m = S.ctl.map.find(m => m.k && kmatch(m.k, e));
    if (m) return run(m.a);
    return false;
  }

  async function connectMidi() {
    if (!navigator.requestMIDIAccess) return alert('Tenhle prohlížeč neumí MIDI. Použij Chrome nebo Edge.');
    try { ST.midi = await navigator.requestMIDIAccess(); } catch (e) { return alert('Přístup k MIDI byl zamítnut.'); }
    const hook = () => { for (const i of ST.midi.inputs.values()) i.onmidimessage = onMidi; renderTab(); };
    ST.midi.onstatechange = hook; hook(); S.ctl.midiOn = true; save();
  }
  function onMidi(ev) {
    const [st, n, v = 0] = ev.data, type = st & 0xf0, ch = st & 0x0f;
    let m = null;
    if (type === 0x90 && v > 0) m = {type:'note', ch, n, v};
    else if (type === 0xb0) m = {type:'cc', ch, n, v};
    else return;
    ST.last = `${mname(m)} = ${v}`; const l = $('#ctlLast'); if (l) l.textContent = ST.last;
    if (ST.learn && ST.learn.kind === 'midi') {
      S.ctl.map = S.ctl.map.filter(x => !(x.m && x.m.type === m.type && x.m.ch === ch && x.m.n === n));
      S.ctl.map.push({a:ST.learn.a, m:{type:m.type, ch, n}}); ST.learn = null; renderTab(); save(); return;
    }
    for (const map of S.ctl.map) {
      if (!map.m || map.m.type !== m.type || map.m.ch !== ch || map.m.n !== n) continue;
      const a = actions().find(x => x.id === map.a); if (!a) continue;
      if (a.cont) a.run(v / 127);
      else if (m.type === 'note') a.run();
      else { const key = ch + ':' + n, prev = ST.cc[key] || 0; ST.cc[key] = v; if (v >= 64 && prev < 64) a.run(); }
    }
  }
  function httpConnect() {
    if (ST.es) { ST.es.close(); ST.es = null; } ST.esOk = false;
    if (!S.ctl.http) { renderTab(); return; }
    try {
      ST.es = new EventSource(relayUrl() + '/events');
      ST.es.onopen = () => { ST.esOk = true; renderTab(); };
      ST.es.onerror = () => { ST.esOk = false; const s = $('#ctlHttpSt'); if (s) s.textContent = '⚠ server neodpovídá – běží node server.js?'; };
      ST.es.onmessage = e => { try { const d = JSON.parse(e.data); if (d.a) run(d.a, d.v); } catch (er) {} };
    } catch (e) { console.warn(e); }
  }

  function renderTab() {
    const box = $('#tab-control'); if (!box || !S.ctl) return;
    const A = actions(), cats = [...new Set(A.map(a => a.cat))], relay = relayUrl();
    const inputs = ST.midi ? [...ST.midi.inputs.values()].map(i => esc(i.name)).join(', ') || 'žádné zařízení' : '';
    box.innerHTML = `<div class="propcols">
      <div class="sec"><h4>🎛 Stream Deck / Bitfocus Companion</h4>
        <label class="chk"><input type="checkbox" id="ctlHttp" ${S.ctl.http ? 'checked' : ''}> Povolit ovládání přes server.js <span id="ctlHttpSt" class="dim">${S.ctl.http ? (ST.esOk ? '✔ připojeno' : '… připojuji') : ''}</span></label>
        <p class="dim">Stream Deck: přidej tlačítko s akcí <b>Website</b> (zaškrtni „GET request in background“) nebo plugin <b>API Ninja / Web Requests</b> a vlož adresu akce ze sloupce „Adresa“ níže. Companion: modul <b>Generic HTTP</b>. Funguje, i když okno režie není aktivní.<br>
        Jednodušší varianta: tlačítko <b>Hotkey</b> na Stream Decku + klávesa z tabulky (okno režie musí být aktivní).</p></div>
      <div class="sec"><h4>🎹 MIDI ovladač</h4>
        <div class="btns"><button id="ctlMidi" class="${ST.midi ? 'on2' : ''}">${ST.midi ? '✔ MIDI připojeno' : 'Připojit MIDI'}</button><span class="dim">${inputs}</span></div>
        <p class="dim">Poslední zpráva: <span id="ctlLast" class="mono">${esc(ST.last) || '—'}</span></p>
        <p class="dim">Klikni „Naučit MIDI“ u akce a zmáčkni tlačítko nebo pohni faderem na ovladači. Fadery jdou na hlasitost a T-bar.</p></div></div>
      <div class="btns"><button id="ctlReset">↺ Výchozí klávesy</button>${ST.learn ? `<b class="learn">${ST.learn.kind === 'key' ? '⌨ Zmáčkni klávesu…' : '🎹 Pohni ovladačem…'} (Esc = zrušit)</b>` : ''}</div>
      <table class="ctlt"><thead><tr><th>Akce</th><th>Klávesa</th><th>MIDI</th><th>Adresa (Stream Deck)</th><th></th></tr></thead><tbody>
      ${cats.map(c => `<tr class="cat"><td colspan="5">${c}</td></tr>` + A.filter(a => a.cat === c).map(a => {
        const ks = S.ctl.map.filter(m => m.a === a.id && m.k), ms = S.ctl.map.filter(m => m.a === a.id && m.m);
        const learnK = ST.learn && ST.learn.a === a.id && ST.learn.kind === 'key', learnM = ST.learn && ST.learn.a === a.id && ST.learn.kind === 'midi';
        return `<tr data-a="${a.id}"><td>${esc(a.label)}</td><td>${ks.map(m => `<kbd>${esc(kname(m.k))}</kbd>`).join(' ')} ${a.cont ? '' : `<button data-cl="key" class="${learnK ? 'on2' : ''}">Naučit</button>`}</td>
          <td>${ms.map(m => `<kbd>${esc(mname(m.m))}</kbd>`).join(' ')} <button data-cl="midi" class="${learnM ? 'on2' : ''}">Naučit</button></td>
          <td>${a.cont ? '<span class="dim">jen MIDI</span>' : `<code class="url" title="Klikni pro zkopírování">${esc(relay)}/action/${a.id}</code>`}</td>
          <td>${ks.length || ms.length ? '<button data-cl="clear" title="Smazat přiřazení">✕</button>' : ''}</td></tr>`;
      }).join('')).join('')}</tbody></table>`;
    $('#ctlMidi').onclick = connectMidi;
    $('#ctlHttp').onchange = e => { S.ctl.http = e.target.checked; save(); httpConnect(); };
    $('#ctlReset').onclick = () => { if (confirm('Vrátit výchozí klávesy? (MIDI přiřazení zůstanou)')) { S.ctl.map = [...defaults(), ...S.ctl.map.filter(m => m.m)]; renderTab(); save(); } };
  }
  function init() {
    const box = $('#tab-control');
    box.addEventListener('click', e => {
      const t = e.target;
      if (t.classList.contains('url')) { navigator.clipboard && navigator.clipboard.writeText(t.textContent); t.classList.add('copied'); setTimeout(() => t.classList.remove('copied'), 800); return; }
      const c = t.dataset.cl; if (!c) return; const a = t.closest('tr').dataset.a;
      if (c === 'clear') { S.ctl.map = S.ctl.map.filter(m => m.a !== a); save(); ST.learn = null; }
      else { ST.learn = ST.learn && ST.learn.a === a && ST.learn.kind === c ? null : {a, kind:c}; if (c === 'midi' && !ST.midi) connectMidi(); t.blur(); }
      renderTab();
    });
    if (S.ctl.http) httpConnect();
    if (S.ctl.midiOn && navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(m => { ST.midi = m; const hook = () => { for (const i of m.inputs.values()) i.onmidimessage = onMidi; }; m.onstatechange = hook; hook(); }).catch(() => {});
  }
  const save_ = () => ({map:S.ctl.map, http:S.ctl.http, midiOn:S.ctl.midiOn});
  function load(d) { S.ctl = {map:d && d.map ? d.map : defaults(), http:!!(d && d.http), midiOn:!!(d && d.midiOn)}; }
  return {init, load, save:save_, key, run, renderTab, actions};
})();
