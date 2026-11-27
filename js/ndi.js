'use strict';
/* ================= NDI® výstup programu (jen v desktopové aplikaci) =================
   Program se na grafice převede do formátu NV12 (to, co NDI chce) a přečte bez čekání (asynchronně),
   takže to počítač skoro nepocítí. Pomocný program ndi-send ho pak pošle do sítě přes NDI.
   Využití: jiný počítač/OBS/vMix v síti, monitor, a s bezplatným NDI Virtual Input i jako kamera pro Zoom, Teams…
   NDI® is a registered trademark of Vizrt NDI AB. */
const NDI = (() => {
  const ST = {on:false, cfg:null, st:{state:'off'}, conv:null, sent:0, drop:0, tap:null, sink:null};
  const C = () => ST.cfg || (ST.cfg = (() => { try { return Object.assign({on:false, name:'Režie Live – Program'}, JSON.parse(localStorage.getItem('rezie-ndi')) || {}); } catch (e) { return {on:false, name:'Režie Live – Program'}; } })());
  const saveCfg = () => { try { localStorage.setItem('rezie-ndi', JSON.stringify(C())); } catch (e) {} };
  const available = () => !!(window.rzNative && window.rzNative.ndiStart);

  /* ---------- převod RGB → NV12 na grafice (WebGL2) ---------- */
  class NV12 {
    constructor(w, h) {
      this.w = w; this.h = h; this.tw = w / 4; this.th = h * 3 / 2;
      const c = this.cv = document.createElement('canvas'); c.width = this.tw; c.height = this.th;
      const gl = this.gl = c.getContext('webgl2', {antialias:false, depth:false, alpha:true, premultipliedAlpha:false, preserveDrawingBuffer:false});
      if (!gl) throw new Error('WebGL2 není k dispozici');
      const vs = `#version 300 es
        in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
      const fs = `#version 300 es
        precision highp float; uniform sampler2D src; uniform vec2 size; out vec4 o;
        vec3 at(float x, float y){ return texture(src, vec2(x, y) / size).rgb; }
        float Y(vec3 c){ return (16.0 + 219.0 * dot(c, vec3(0.2126, 0.7152, 0.0722))) / 255.0; }
        vec2 UV(vec3 c){ return vec2(128.0 + 224.0 * dot(c, vec3(-0.1146, -0.3854, 0.5)), 128.0 + 224.0 * dot(c, vec3(0.5, -0.4542, -0.0458))) / 255.0; }
        void main(){
          float col = floor(gl_FragCoord.x), row = floor(gl_FragCoord.y);
          if (row < size.y) {                       // jas (Y): 4 body vedle sebe v jednom texelu
            float x = col * 4.0, y = row + 0.5;
            o = vec4(Y(at(x + 0.5, y)), Y(at(x + 1.5, y)), Y(at(x + 2.5, y)), Y(at(x + 3.5, y)));
          } else {                                  // barva (U,V): průměr 2×2 bodů, U a V se střídají
            float q = row - size.y, k = col * 2.0, y = q * 2.0 + 1.0;
            vec2 a = UV(at(k * 2.0 + 1.0, y)), b = UV(at(k * 2.0 + 3.0, y));
            o = vec4(a.x, a.y, b.x, b.y);
          }
        }`;
      const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
      const pr = this.pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR));
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
      gl.uniform1i(gl.getUniformLocation(pr, 'src'), 0); gl.uniform2f(gl.getUniformLocation(pr, 'size'), w, h);
      this.size = this.tw * this.th * 4;
      this.pbo = [0, 1, 2].map(() => { const p = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, p); gl.bufferData(gl.PIXEL_PACK_BUFFER, this.size, gl.STREAM_READ); return {p, fence:null}; });
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.i = 0;
    }
    draw(src) {
      const gl = this.gl; gl.viewport(0, 0, this.tw, this.th);
      gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // synchronně (test) – přečte hned
    readSync(src) { this.draw(src); const out = new Uint8Array(this.size); this.gl.readPixels(0, 0, this.tw, this.th, this.gl.RGBA, this.gl.UNSIGNED_BYTE, out); return out; }
    // asynchronně: tenhle snímek se jen zadá, vrátí se starší hotový (nebo null) – grafika nikdy nečeká
    push(src) {
      const gl = this.gl, slot = this.pbo[this.i % 3];
      if (slot.fence) { gl.deleteSync(slot.fence); slot.fence = null; }
      this.draw(src);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.p); gl.readPixels(0, 0, this.tw, this.th, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      slot.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
      this.i++;
      const old = this.pbo[this.i % 3];   // nejstarší
      let out = null;
      if (old.fence && gl.clientWaitSync(old.fence, 0, 0) !== gl.TIMEOUT_EXPIRED) {
        out = new Uint8Array(this.size); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, old.p); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
        gl.deleteSync(old.fence); old.fence = null;
      }
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      return out;
    }
  }

  /* ---------- zvuk: odbočka z masteru ---------- */
  const TAP = `class T extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(2048);this.n=0}
    process(i){const x=i[0];if(!x||!x.length)return true;const L=x[0],R=x[1]||x[0];for(let k=0;k<L.length;k++){this.b[this.n++]=L[k];this.b[this.n++]=R[k];if(this.n>=this.b.length){this.port.postMessage(this.b.slice(0));this.n=0}}return true}}
    registerProcessor('rz-ndi-tap',T);`;
  async function startAudio() {
    if (ST.tap) return;
    await actx.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP], {type:'text/javascript'})));
    ST.tap = new AudioWorkletNode(actx, 'rz-ndi-tap', {numberOfInputs:1, numberOfOutputs:1, channelCount:2, channelCountMode:'explicit'});
    ST.sink = actx.createGain(); ST.sink.gain.value = 0;
    masterFader.connect(ST.tap); ST.tap.connect(ST.sink); ST.sink.connect(actx.destination);
    ST.tap.port.onmessage = e => { if (ST.on) window.rzNative.ndiAudio(new Uint8Array(e.data.buffer)); };
  }
  function stopAudio() { if (!ST.tap) return; try { masterFader.disconnect(ST.tap); ST.tap.disconnect(); ST.sink.disconnect(); } catch (e) {} ST.tap = null; }

  async function start() {
    if (!available() || ST.on) return;
    const [w, h] = CFG.out(), W4 = Math.floor(w / 4) * 4, H2 = Math.floor(h / 2) * 2;
    try { ST.conv = new NV12(W4, H2); } catch (e) { ST.st = {state:'error', msg:e.message}; render(); return; }
    ST.size = [W4, H2]; ST.sent = 0; ST.drop = 0;
    ST.st = {state:'starting'}; render();
    const r = await window.rzNative.ndiStart({name:C().name || 'Režie Live – Program', w:W4, h:H2, fpsN:CFG.video.fps, fpsD:1, rate:actx.sampleRate});
    if (!r || !r.ok) { ST.st = {state:'error', msg:r && r.error}; ST.conv = null; render(); return; }
    ST.on = true; C().on = true; saveCfg();
    try { await startAudio(); } catch (e) { HLT.note('NDI zvuk: ' + e.message); }
    render();
  }
  function stop(keepCfg) {
    if (ST.on) window.rzNative.ndiStop();
    ST.on = false; ST.conv = null; stopAudio();
    if (!keepCfg) { C().on = false; saveCfg(); }
    ST.st = {state:'off'}; render();
  }
  // volá se z hlavní smyčky po vykreslení programu (už v tempu FPS vysílání)
  function frame() {
    if (!ST.on || !ST.conv) return;
    try { const out = ST.conv.push(pg); if (out) { if (window.rzNative.ndiVideo(out) === false) ST.drop++; else ST.sent++; } }
    catch (e) { HLT.note('NDI: ' + e.message); stop(true); ST.st = {state:'error', msg:e.message}; render(); }
  }
  function onStatus(s) { ST.st = s; if (s.state === 'off' || s.state === 'error') { ST.on = false; stopAudio(); } render(); }

  /* ---------- UI (záložka Vysílání) ---------- */
  function html() {
    if (!available()) return `<div class="sec"><h4>📡 ${L('NDI výstup')}</h4><p class="dim">${L('NDI výstup je jen v desktopové aplikaci.')}</p></div>`;
    const s = ST.st, on = ST.on;
    const stat = s.state === 'on' ? `🟢 ${L('NDI vysílá jako')} „${esc(C().name)}“ · ${ST.size ? ST.size.join('×') : ''} · ${CFG.video.fps} fps · ${L('připojení')}: <b>${s.conns || 0}</b>`
      : s.state === 'starting' ? '🟡 ' + L('Spouštím…')
      : s.state === 'error' ? (s.msg === 'nolib' ? `🔴 ${L('V počítači chybí NDI. Nainstaluj zdarma NDI Runtime nebo NDI Tools a zkus to znovu.')} <a href="https://ndi.link/NDIRedistV6Apple" target="_blank">NDI Runtime</a> · <a href="https://ndi.video/tools/" target="_blank">NDI Tools</a>` : '🔴 ' + esc(s.msg || L('chyba')))
      : '⚪ ' + L('Vypnuto');
    return `<div class="sec"><h4>📡 ${L('NDI výstup (program do sítě, virtuální kamera)')}</h4>
      <label class="chk"><input type="checkbox" id="ndiOn" ${on || s.state === 'starting' ? 'checked' : ''}> ${L('Posílat program přes NDI')}</label>
      <label>${L('Název v síti')}<input id="ndiName" value="${esc(C().name)}" maxlength="60" ${on ? 'disabled' : ''}></label>
      <p class="ststatus">${stat}</p>
      <p class="dim">${L('Program uvidí každý program s NDI ve stejné síti (OBS, vMix, NDI Studio Monitor…). Jako kameru pro Zoom, Teams nebo FaceTime ho použiješ přes bezplatnou aplikaci NDI Virtual Input z NDI Tools – vyber v ní')} „${esc(C().name)}“.</p>
      <p class="dim" style="font-size:11px">NDI® is a registered trademark of Vizrt NDI AB.</p></div>`;
  }
  function render() { const b = $('#ndiBox'); if (b) b.innerHTML = html(); }
  function init() {
    if (available()) {
      window.rzNative.onNdi(onStatus);
      if (C().on) setTimeout(start, 1500);   // zapnuto minule → zapnout znovu
    }
    document.addEventListener('change', e => {
      if (e.target.id === 'ndiOn') e.target.checked ? start() : stop();
      if (e.target.id === 'ndiName') { C().name = e.target.value.trim().slice(0, 60) || 'Režie Live – Program'; saveCfg(); }
    });
  }
  const status = () => ({on:ST.on, state:ST.st.state, conns:ST.st.conns || 0, msg:ST.st.msg, name:C().name, sent:ST.sent, drop:ST.drop});
  return {init, start, stop, frame, render, html, status, NV12};
})();
