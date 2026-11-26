'use strict';
/* ================= NATIVNÍ VYSÍLÁNÍ (jen v desktopové aplikaci) =================
   Program se kóduje JEN JEDNOU přímo v aplikaci: H.264 přes WebCodecs (na Macu hardwarově – VideoToolbox).
   Snímky se odebírají podle zvukových hodin → pevných 30 fps a dokonalá synchronizace obrazu a zvuku.
   Zakódovaná data jdou do vestavěného FFmpeg, který je bez překódování pošle na všechna místa najednou. */
const NAT = (() => {
  const TAP = `class Tap extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(4096);this.n=0}
process(ins){const i=ins[0],L=i&&i[0],R=i&&(i[1]||i[0]);for(let k=0;k<128;k++){this.b[this.n++]=L?L[k]:0;this.b[this.n++]=R?R[k]:0;if(this.n>=this.b.length){this.port.postMessage(this.b.slice(0));this.n=0}}return true}}
registerProcessor('rz-tap',Tap);`;
  const ST = {on:false, enc:null, tap:null, sink:null, sent:0, samples:0, forceKey:false, cfg:null, vb:0, vbTarget:0, okSince:0, lastStat:null, fpsT:0, fpsN:0, fps:0, queueMax:0, late:0, codec:''};
  let tapReady = null;
  const available = () => !!window.rzNative;

  async function pickCodec(w, h, vb) {
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42e01f']) {
      for (const hw of ['prefer-hardware', 'no-preference']) {
        for (const bm of ['constant', undefined]) {
          const c = {codec, width:w, height:h, bitrate:vb, framerate:30, latencyMode:'realtime', hardwareAcceleration:hw, avc:{format:'annexb'}};
          if (bm) c.bitrateMode = bm;
          try { const r = await VideoEncoder.isConfigSupported(c); if (r.supported) return r.config || c; } catch (e) {}
        }
      }
    }
    throw new Error('Tenhle počítač neumí H.264 kódování (WebCodecs).');
  }

  async function start(opts) {
    if (ST.on) return;
    if (!window.VideoEncoder) throw new Error('Chybí WebCodecs – aktualizuj aplikaci.');
    const fps = 30, h = opts.res === '720' ? 720 : 1080, w = Math.round(h * 16 / 9), vb = opts.vb * 1000;
    const cfg = await pickCodec(w, h, vb);
    const sr = actx.sampleRate;
    await window.rzNative.start({fps, rate:sr, targets:opts.targets, record:opts.record});
    ST.cfg = cfg; ST.vb = ST.vbTarget = vb; ST.sent = 0; ST.samples = 0; ST.forceKey = true; ST.late = 0; ST.queueMax = 0; ST.okSince = performance.now(); ST.codec = cfg.codec;
    // kodér
    ST.enc = new VideoEncoder({
      output:chunk => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); window.rzNative.video(b, chunk.type === 'key'); },
      error:e => { stLog('Kodér: ' + e.message); }
    });
    ST.enc.configure(cfg);
    ST.scale = h !== H ? Object.assign(document.createElement('canvas'), {width:w, height:h}) : null;
    ST.sx = ST.scale && ST.scale.getContext('2d');
    // zvukové hodiny: AudioWorklet odebírá master a zároveň určuje, kdy přijde další snímek
    if (!tapReady) tapReady = actx.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP], {type:'application/javascript'})));
    await tapReady;
    ST.tap = new AudioWorkletNode(actx, 'rz-tap', {numberOfInputs:1, numberOfOutputs:1, channelCount:2, channelCountMode:'explicit', channelInterpretation:'speakers'});
    ST.sink = actx.createGain(); ST.sink.gain.value = 0;
    masterFader.connect(ST.tap); ST.tap.connect(ST.sink); ST.sink.connect(actx.destination);
    ST.tap.port.onmessage = e => onAudio(e.data, sr, fps);
    window.rzNative.onNeedKey && (ST.needKeyHooked || (window.rzNative.onNeedKey(() => { ST.forceKey = true; }), ST.needKeyHooked = true));
    ST.on = true; ST.fpsT = performance.now(); ST.fpsN = 0;
  }
  function onAudio(f32, sr, fps) {
    if (!ST.on) return;
    const n = f32.length, i16 = new Int16Array(n);
    for (let k = 0; k < n; k++) { const v = f32[k]; i16[k] = v >= 1 ? 32767 : v <= -1 ? -32768 : v * 32767; }
    window.rzNative.audio(new Uint8Array(i16.buffer));
    ST.samples += n / 2;
    const due = Math.floor(ST.samples / sr * fps);
    while (ST.sent < due) encodeFrame(fps);
  }
  function encodeFrame(fps) {
    const enc = ST.enc; if (!enc || enc.state !== 'configured') { ST.sent++; return; }
    if (enc.encodeQueueSize > ST.queueMax) ST.queueMax = enc.encodeQueueSize;
    if (enc.encodeQueueSize > 6) ST.late++;
    let src = pg; if (ST.scale) { ST.sx.drawImage(pg, 0, 0, ST.scale.width, ST.scale.height); src = ST.scale; }
    const fr = new VideoFrame(src, {timestamp:Math.round(ST.sent * 1e6 / fps), duration:Math.round(1e6 / fps)});
    const key = ST.forceKey || ST.sent % (fps * 2) === 0; ST.forceKey = false;   // klíčový snímek každé 2 s (požadavek YouTube)
    try { enc.encode(fr, {keyFrame:key}); } catch (e) { stLog('Kodér: ' + e.message); }
    fr.close(); ST.sent++; ST.fpsN++;
  }
  // adaptivní datový tok: když internet nestíhá, kodér ubere; když je zase dobře, pomalu přidá
  function onStatus(s) {
    ST.lastStat = s; if (!ST.on || !ST.enc) return;
    const now = performance.now(), cong = s.outs.some(o => o.kind === 'net' && o.congested);
    if (cong && ST.vb > ST.vbTarget * 0.45) { setVb(Math.round(ST.vb * 0.8)); ST.okSince = now; stLog(`Pomalý internet – snižuji datový tok na ${Math.round(ST.vb / 1000)} kbps`); }
    else if (!cong && ST.vb < ST.vbTarget && now - ST.okSince > 15000) { setVb(Math.min(ST.vbTarget, Math.round(ST.vb * 1.12))); ST.okSince = now; }
    if (now - ST.fpsT >= 2000) { ST.fps = ST.fpsN * 1000 / (now - ST.fpsT); ST.fpsN = 0; ST.fpsT = now; }
  }
  function setVb(vb) { ST.vb = vb; try { ST.enc.configure({...ST.cfg, bitrate:vb}); ST.forceKey = true; } catch (e) {} }
  async function stop() {
    if (!ST.on) return; ST.on = false;
    try { masterFader.disconnect(ST.tap); ST.tap.disconnect(); ST.sink.disconnect(); } catch (e) {}
    try { await ST.enc.flush(); ST.enc.close(); } catch (e) {}
    ST.enc = null;
    try { await window.rzNative.stop(); } catch (e) {}
  }
  const stats = () => ({on:ST.on, codec:ST.codec, w:ST.cfg ? ST.cfg.width : 0, h:ST.cfg ? ST.cfg.height : 0, fps:ST.fps, vb:ST.vb, vbTarget:ST.vbTarget, late:ST.late, queue:ST.enc ? ST.enc.encodeQueueSize : 0, hw:ST.cfg && ST.cfg.hardwareAcceleration});
  return {available, start, stop, onStatus, stats};
})();
