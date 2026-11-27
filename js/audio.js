'use strict';
/* ================= MIX PULT s modulárními efekty ================= */
const AUD = (() => {
  /* ---------- AudioWorklet procesory (gate, potlačení šumu, de-esser, limiter) ---------- */
  const WL = `
class Gate extends AudioWorkletProcessor{constructor(){super();this.p={thr:-50,range:-40,att:2,hold:80,rel:150};this.env=0;this.g=1;this.h=0;this.c=0;this.port.onmessage=e=>Object.assign(this.p,e.data)}
process(ins,outs){const i=ins[0],o=outs[0];if(!i||!i.length)return true;const p=this.p,sr=sampleRate,thr=Math.pow(10,p.thr/20),fl=Math.pow(10,p.range/20),ea=Math.exp(-1/(sr*0.002)),ga=Math.exp(-1/(sr*Math.max(p.att,0.05)/1000)),gr=Math.exp(-1/(sr*Math.max(p.rel,1)/1000)),hs=p.hold/1000*sr,n=i[0].length;
for(let k=0;k<n;k++){let m=0;for(let c=0;c<i.length;c++){const v=Math.abs(i[c][k]);if(v>m)m=v}this.env=Math.max(m,this.env*ea);let t;if(this.env>thr){t=1;this.h=hs}else if(this.h>0){this.h--;t=1}else t=fl;
this.g=t>this.g?t+(this.g-t)*ga:t+(this.g-t)*gr;for(let c=0;c<o.length;c++)o[c][k]=(i[c]||i[0])[k]*this.g}
if(++this.c%16===0)this.port.postMessage(20*Math.log10(Math.max(this.g,1e-5)));return true}}
registerProcessor('rz-gate',Gate);
class NR extends AudioWorkletProcessor{constructor(){super();const N=this.N=1024;this.H=256;this.p={amount:12,sens:1.5,adapt:true};this.learn=0;this.st=[];this.c=0;this.red=0;
this.win=new Float32Array(N);for(let i=0;i<N;i++)this.win[i]=0.5-0.5*Math.cos(2*Math.PI*i/N);
this.rev=new Uint32Array(N);const b=Math.log2(N);for(let i=0;i<N;i++){let r=0;for(let j=0;j<b;j++)r|=((i>>j)&1)<<(b-1-j);this.rev[i]=r}
this.co=new Float32Array(N/2);this.si=new Float32Array(N/2);for(let i=0;i<N/2;i++){this.co[i]=Math.cos(2*Math.PI*i/N);this.si[i]=Math.sin(2*Math.PI*i/N)}
this.port.onmessage=e=>{if(e.data&&e.data.learn){this.learn=Math.round(e.data.learn*sampleRate/this.H);this.acc=null;this.accN=0}else Object.assign(this.p,e.data)}}
fft(re,im,inv){const N=this.N,rv=this.rev;for(let i=0;i<N;i++){const j=rv[i];if(j>i){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
for(let s=2;s<=N;s<<=1){const h=s>>1,st=N/s;for(let i=0;i<N;i+=s)for(let j=0;j<h;j++){const k=j*st,wr=this.co[k],wi=inv?this.si[k]:-this.si[k],a=i+j,b=a+h,tr=re[b]*wr-im[b]*wi,ti=re[b]*wi+im[b]*wr;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti}}}
ch(c){let s=this.st[c];if(!s){const N=this.N,K=N/2+1;s=this.st[c]={inF:new Float32Array(N),outF:new Float32Array(N),acc:new Float32Array(N),re:new Float32Array(N),im:new Float32Array(N),nz:new Float32Array(K),g:new Float32Array(K).fill(1),rv:N-this.H,init:0}}return s}
frame(s,first){const N=this.N,H=this.H,K=N/2,re=s.re,im=s.im,w=this.win,p=this.p;for(let i=0;i<N;i++){re[i]=s.inF[i]*w[i];im[i]=0}this.fft(re,im,false);
const fl=Math.pow(10,-p.amount/20),lr=first&&this.learn>0;if(lr&&!this.acc)this.acc=new Float32Array(K+1);let gs=0;
for(let k=0;k<=K;k++){const m=Math.hypot(re[k],im[k]);if(lr)this.acc[k]+=m;else if(p.adapt){if(s.init===0)s.nz[k]=m;else if(m<s.nz[k])s.nz[k]=0.85*s.nz[k]+0.15*m;else s.nz[k]+=0.0012*(m-s.nz[k])}
let g=1-p.sens*s.nz[k]/(m+1e-9);if(g<fl)g=fl;if(g>1)g=1;g=g>s.g[k]?0.4*s.g[k]+0.6*g:0.75*s.g[k]+0.25*g;s.g[k]=g;gs+=g;re[k]*=g;im[k]*=g;if(k>0&&k<K){re[N-k]*=g;im[N-k]*=g}}
s.init++;if(first){this.red=20*Math.log10(Math.max(gs/(K+1),1e-4));if(lr){this.accN++;if(--this.learn<=0){for(const t of this.st)if(t)for(let k=0;k<=K;k++)t.nz[k]=this.acc[k]/this.accN*1.15;this.p.adapt=false;this.port.postMessage({learned:true})}}}
this.fft(re,im,true);for(let i=0;i<N;i++)s.acc[i]+=re[i]/N*w[i]/1.5;for(let i=0;i<H;i++)s.outF[i]=s.acc[i];s.acc.copyWithin(0,H);s.acc.fill(0,N-H);s.inF.copyWithin(0,H)}
process(ins,outs){const i=ins[0],o=outs[0];if(!i||!i.length)return true;const N=this.N,L=N-this.H,n=i[0].length;
for(let c=0;c<o.length;c++){const x=i[c]||i[0],y=o[c],s=this.ch(c);for(let k=0;k<n;k++){s.inF[s.rv]=x[k];y[k]=s.outF[s.rv-L];s.rv++;if(s.rv>=N){s.rv=L;this.frame(s,c===0)}}}
if(++this.c%16===0)this.port.postMessage(this.red);return true}}
registerProcessor('rz-nr',NR);
class DeEss extends AudioWorkletProcessor{constructor(){super();this.p={freq:6500,thr:-30,red:8};this.z=[0,0,0,0];this.env=0;this.g=1;this.c=0;this.port.onmessage=e=>{Object.assign(this.p,e.data);this.cf()};this.cf()}
cf(){const w=2*Math.PI*Math.min(this.p.freq,sampleRate*0.45)/sampleRate,al=Math.sin(w)/3,a0=1+al;this.b0=al/a0;this.b2=-al/a0;this.a1=-2*Math.cos(w)/a0;this.a2=(1-al)/a0}
process(ins,outs){const i=ins[0],o=outs[0];if(!i||!i.length)return true;const n=i[0].length,p=this.p,ea=Math.exp(-1/(sampleRate*0.001)),gr=Math.exp(-1/(sampleRate*0.05)),z=this.z;
for(let k=0;k<n;k++){let x=0;for(let c=0;c<i.length;c++)x+=i[c][k];x/=i.length;const y=this.b0*x+this.b2*z[1]-this.a1*z[2]-this.a2*z[3];z[1]=z[0];z[0]=x;z[3]=z[2];z[2]=y;
this.env=Math.max(Math.abs(y),this.env*ea);const ov=20*Math.log10(this.env+1e-9)-p.thr,t=ov>0?Math.pow(10,-Math.min(p.red,ov)/20):1;this.g=t<this.g?t:t+(this.g-t)*gr;for(let c=0;c<o.length;c++)o[c][k]=(i[c]||i[0])[k]*this.g}
if(++this.c%16===0)this.port.postMessage(20*Math.log10(Math.max(this.g,1e-5)));return true}}
registerProcessor('rz-deess',DeEss);
class Lim extends AudioWorkletProcessor{constructor(){super();this.p={ceil:-1,rel:80};this.L=Math.max(1,Math.round(sampleRate*0.005));this.b=[];this.pos=0;this.g=1;this.c=0;this.mn=1;this.port.onmessage=e=>Object.assign(this.p,e.data)}
process(ins,outs){const i=ins[0],o=outs[0];if(!i||!i.length)return true;const n=i[0].length,L=this.L,ce=Math.pow(10,this.p.ceil/20),a=Math.exp(-5/L),r=Math.exp(-1/(sampleRate*Math.max(this.p.rel,1)/1000));
for(let c=0;c<o.length;c++)if(!this.b[c])this.b[c]=new Float32Array(L);
for(let k=0;k<n;k++){let m=0;for(let c=0;c<i.length;c++){const v=Math.abs(i[c][k]);if(v>m)m=v}const t=m>ce?ce/m:1;this.g=t<this.g?t+(this.g-t)*a:t+(this.g-t)*r;if(this.g<this.mn)this.mn=this.g;
for(let c=0;c<o.length;c++){const bf=this.b[c],d=bf[this.pos];bf[this.pos]=(i[c]||i[0])[k];let y=d*this.g;if(y>ce)y=ce;else if(y<-ce)y=-ce;o[c][k]=y}this.pos=(this.pos+1)%L}
if(++this.c%16===0){this.port.postMessage(20*Math.log10(Math.max(this.mn,1e-5)));this.mn=1}return true}}
registerProcessor('rz-limiter',Lim);`;

  /* ---------- definice efektů ---------- */
  const EQB = () => [{type:'lowshelf', f:100, g:0, q:0.7}, {type:'peaking', f:300, g:0, q:1}, {type:'peaking', f:1500, g:0, q:1}, {type:'peaking', f:4000, g:0, q:1}, {type:'highshelf', f:10000, g:0, q:0.7}];
  const FX = {
    trim:{n:'Zesílení', d:() => ({gain:0}), par:[['gain','Zesílení','dB',-24,24,0.5]]},
    mono:{n:'Mono / kanál', d:() => ({mode:'mono'}), par:[]},
    hpf:{n:'Ořez basů', d:() => ({freq:80, q:0.7}), par:[['freq','Frekvence','Hz',20,400,1],['q','Strmost (Q)','',0.3,2,0.05]]},
    gate:{n:'Gate', d:() => ({thr:-50, range:-40, att:2, hold:80, rel:150}), par:[['thr','Práh','dB',-90,0,1],['range','Útlum','dB',-80,0,1],['att','Náběh','ms',0.1,50,0.1],['hold','Držení','ms',0,500,5],['rel','Doznění','ms',10,1000,5]], wl:true},
    nr:{n:'Potlačení šumu', d:() => ({amount:12, sens:1.5, adapt:true}), par:[['amount','Síla potlačení','dB',0,40,1],['sens','Citlivost','×',0.5,4,0.05]], wl:true},
    eq:{n:'EQ', d:() => ({bands:EQB()}), par:[]},
    comp:{n:'Kompresor', d:() => ({thr:-20, ratio:3, knee:6, att:5, rel:150, makeup:3}), par:[['thr','Práh','dB',-60,0,0.5],['ratio','Poměr',':1',1,20,0.1],['knee','Koleno','dB',0,40,1],['att','Náběh','ms',0,200,1],['rel','Doznění','ms',10,1000,5],['makeup','Dorovnání','dB',0,24,0.5]]},
    deess:{n:'De-esser', d:() => ({freq:6500, thr:-30, red:8}), par:[['freq','Frekvence sykavek','Hz',3000,12000,50],['thr','Práh','dB',-60,0,0.5],['red','Max. útlum','dB',0,20,0.5]], wl:true},
    limiter:{n:'Limiter', d:() => ({ceil:-1, rel:80}), par:[['ceil','Strop (nikdy nepřekročí)','dB',-12,0,0.1],['rel','Doznění','ms',10,500,5]], wl:true},
    delay:{n:'Zpoždění', d:() => ({ms:0}), par:[['ms','Zpoždění','ms',0,1000,1]]}
  };
  const HELP = {
    trim:'Zesílí nebo zeslabí signál na vstupu, než jde do dalších efektů.', mono:'Udělá z mikrofonu mono, nebo vezme jen levý / pravý kanál (např. mikrofon zapojený jen do jednoho vstupu zvukové karty).',
    hpf:'Odstraní hučení, dunění a nárazy do stojanu. Pro hlas 80–120 Hz.', gate:'Úplně ztlumí mikrofon, když se nemluví (odstraní šum v pauzách).',
    nr:'Spektrální potlačení šumu (větrák, klimatizace, šum předzesilovače). Nejlepší: buď 2 s potichu a klikni „Naučit šum“.',
    eq:'Ekvalizér – tahej body v grafu (kolečko myši mění šířku). Hlas: ubrat 200–400 Hz (bahno), přidat 3–5 kHz (srozumitelnost).',
    comp:'Vyrovná hlasitost – tiché zesílí a hlasité ztiší. Hlas: práh −20 dB, poměr 3:1.', deess:'Ztlumí ostré sykavky „s“, „š“, „c“.',
    limiter:'Pojistka – zvuk nikdy nepřekročí strop, takže nebude zkreslený. Dej ho na konec řetězce a na master.', delay:'Zpozdí zvuk, když předbíhá obraz (synchronizace s kamerou).'
  };
  const mkFx = (type, p) => ({id:uid(), type, on:true, p:Object.assign(FX[type].d(), p || {})});
  const PRESETS = {
    voice:['🎙 Hlas – mluvené slovo', () => [mkFx('hpf', {freq:90}), mkFx('gate', {thr:-55, range:-25}), mkFx('eq', {bands:[{type:'lowshelf', f:120, g:-2, q:0.7}, {type:'peaking', f:320, g:-2.5, q:1.2}, {type:'peaking', f:1500, g:0, q:1}, {type:'peaking', f:3500, g:2.5, q:1}, {type:'highshelf', f:10000, g:2, q:0.7}]}), mkFx('comp', {thr:-22, ratio:3, makeup:4}), mkFx('deess'), mkFx('limiter', {ceil:-2})]],
    noisy:['🌬 Hlas v hlučném prostředí', () => [mkFx('hpf', {freq:110}), mkFx('nr', {amount:16, sens:1.8}), mkFx('gate', {thr:-48, range:-30}), mkFx('eq', {bands:[{type:'lowshelf', f:120, g:-3, q:0.7}, {type:'peaking', f:350, g:-3, q:1.2}, {type:'peaking', f:1500, g:0, q:1}, {type:'peaking', f:3500, g:3, q:1}, {type:'highshelf', f:10000, g:1, q:0.7}]}), mkFx('comp', {thr:-24, ratio:4, makeup:5}), mkFx('deess'), mkFx('limiter', {ceil:-2})]],
    music:['🎵 Hudba / video', () => [mkFx('comp', {thr:-14, ratio:2, knee:10, makeup:1}), mkFx('limiter', {ceil:-1})]],
    clean:['∅ Bez efektů', () => []]
  };

  let wlReady = false, monProg, monPfl, pflBus, lufsAn;
  const SEL = {ch:null, fx:null};
  const LU = {hist:[], m:-70, s:-70, last:0};

  function buildFx(fx) {
    const P = fx.p; let n;
    switch (fx.type) {
      case 'trim': { const g = actx.createGain(); n = {in:g, out:g, up:() => g.gain.value = Math.pow(10, P.gain / 20)}; break; }
      case 'hpf': { const f = actx.createBiquadFilter(); f.type = 'highpass'; n = {in:f, out:f, f:[f], up:() => { f.frequency.value = P.freq; f.Q.value = P.q; }}; break; }
      case 'eq': { const fs = P.bands.map(() => actx.createBiquadFilter()); for (let i = 0; i < fs.length - 1; i++) fs[i].connect(fs[i + 1]);
        n = {in:fs[0], out:fs[fs.length - 1], f:fs, up:() => P.bands.forEach((b, i) => { fs[i].type = b.type; fs[i].frequency.value = b.f; fs[i].gain.value = b.g; fs[i].Q.value = b.q; })}; break; }
      case 'comp': { const c = actx.createDynamicsCompressor(), m = actx.createGain(); c.connect(m);
        n = {in:c, out:m, gr:() => c.reduction, up:() => { c.threshold.value = P.thr; c.ratio.value = P.ratio; c.knee.value = P.knee; c.attack.value = P.att / 1000; c.release.value = P.rel / 1000; m.gain.value = Math.pow(10, P.makeup / 20); }}; break; }
      case 'delay': { const d = actx.createDelay(2); n = {in:d, out:d, up:() => d.delayTime.value = P.ms / 1000}; break; }
      case 'mono': {
        const i = actx.createGain(), sp = actx.createChannelSplitter(2), o = actx.createGain(); o.channelCount = 1; o.channelCountMode = 'explicit'; o.channelInterpretation = 'speakers';
        i.connect(sp);
        n = {in:i, out:o, up:() => { try { i.disconnect(o); } catch (e) {} try { sp.disconnect(); } catch (e) {} if (P.mode === 'left') sp.connect(o, 0); else if (P.mode === 'right') sp.connect(o, 1); else i.connect(o); }}; break;
      }
      default: {
        if (!wlReady) { const g = actx.createGain(); n = {in:g, out:g, up() {}, pending:true}; break; }
        const w = new AudioWorkletNode(actx, 'rz-' + fx.type, {numberOfInputs:1, numberOfOutputs:1});
        w.port.onmessage = e => { if (e.data && e.data.learned) { fx.p.adapt = false; fx._learned = true; if (SEL.fx === fx.id) renderEditor(); } else fx._gr = e.data; };
        n = {in:w, out:w, w, gr:() => fx._gr || 0, up:() => w.port.postMessage({...P})};
      }
    }
    n.up(); fx._n = n; return n;
  }
  function rebuild(chain, head, tail, taps) {
    try { head.disconnect(); } catch (e) {}
    chain.forEach(f => { if (f._n) try { f._n.out.disconnect(); } catch (e) {} });
    let cur = head;
    for (const f of chain) { if (!f.on) continue; if (!f._n || (f._n.pending && wlReady)) buildFx(f); cur.connect(f._n.in); cur = f._n.out; }
    cur.connect(tail); (taps || []).forEach(t => head.connect(t));
  }
  const M = () => S.audM;
  function rebuildCh(a) { if (a.delayN) rebuild(a.fx, a.delayN, a.panN, [a.inAn]); }
  function rebuildMaster() { if (master) rebuild(M().fx, master, masterFader); }
  function rebuildAll() { S.sources.forEach(s => s.audio && s.audio.gainN && rebuildCh(s.audio)); rebuildMaster(); }

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    try { actx = new AC({latencyHint:'interactive', sampleRate:CFG.audio.rate}); } catch (e) { actx = new AC({latencyHint:'interactive'}); }
    CFG.setMonitorDevice();
    master = actx.createGain(); masterFader = actx.createGain(); masterAn = actx.createAnalyser(); masterAn.fftSize = 1024;
    dest = actx.createMediaStreamDestination(); monOut = actx.createGain(); monOut.gain.value = 0;
    monProg = actx.createGain(); monPfl = actx.createGain(); monPfl.gain.value = 0; pflBus = actx.createGain();
    masterFader.connect(masterAn); masterFader.connect(dest); masterFader.connect(monProg); monProg.connect(monOut); pflBus.connect(monPfl); monPfl.connect(monOut); monOut.connect(actx.destination);
    master.connect(masterFader);
    const ks = actx.createBiquadFilter(); ks.type = 'highshelf'; ks.frequency.value = 1500; ks.gain.value = 4;
    const kh = actx.createBiquadFilter(); kh.type = 'highpass'; kh.frequency.value = 38; kh.Q.value = 0.5;
    lufsAn = actx.createAnalyser(); lufsAn.fftSize = 16384; masterFader.connect(ks); ks.connect(kh); kh.connect(lufsAn);
    if (!S.audM) S.audM = {vol:1, fx:[mkFx('limiter', {ceil:-1})], presets:{}, monVol:1};
    if (actx.audioWorklet) actx.audioWorklet.addModule(URL.createObjectURL(new Blob([WL], {type:'application/javascript'})))
      .then(() => { wlReady = true; rebuildAll(); if (POP.on('audio')) renderPage(); }).catch(e => console.warn('AudioWorklet', e));
  }
  function attach(s, node) {
    const a = s.audio || (s.audio = loadCh(null));
    if (!a.fx) a.fx = [];
    if (a.node) { try { a.node.disconnect(); } catch (e) {} }
    if (!a.gainN) {
      a.delayN = actx.createDelay(1); a.inAn = actx.createAnalyser(); a.inAn.fftSize = 1024; a.panN = actx.createStereoPanner(); a.gainN = actx.createGain();
      a.an = actx.createAnalyser(); a.an.fftSize = 1024; a.pflN = actx.createGain(); a.pflN.gain.value = 0;
      a.panN.connect(a.gainN); a.gainN.connect(a.an); a.gainN.connect(master); a.panN.connect(a.pflN); a.pflN.connect(pflBus);
    }
    a.delayN.delayTime.value = (a.delay || 0) / 1000; a.panN.pan.value = a.pan || 0;
    rebuildCh(a); a.node = node; node.connect(a.delayN); a._t = undefined; updateSolo();
  }
  function updateSolo() {
    const any = S.sources.some(s => s.audio && s.audio.solo);
    S.sources.forEach(s => { if (s.audio && s.audio.pflN) s.audio.pflN.gain.value = s.audio.solo ? 1 : 0; });
    if (!monProg) return;
    monProg.gain.value = any ? 0 : 1; monPfl.gain.value = any ? 1 : 0;
    monOut.gain.setTargetAtTime((R.monitor || any) ? (M().monVol ?? 1) : 0, actx.currentTime, 0.02);
  }
  function setMonitor(on) { R.monitor = on; updateSolo(); if (POP.on('audio')) renderPage(); }

  /* ---------- hlasitost (LUFS, přibližně podle EBU R128) ---------- */
  function lufsTick(now) {
    if (!lufsAn || now - LU.last < 100) return; LU.last = now;
    const b = lufsAn._b || (lufsAn._b = new Float32Array(lufsAn.fftSize)); lufsAn.getFloatTimeDomainData(b);
    let ms = 0; for (let i = 0; i < b.length; i++) ms += b[i] * b[i]; ms /= b.length;
    LU.hist.push(ms); if (LU.hist.length > 30) LU.hist.shift();
    const toL = x => x > 1e-10 ? -0.691 + 10 * Math.log10(x) + 3.01 : -70;
    LU.m = Math.max(-70, toL(ms)); LU.s = Math.max(-70, toL(LU.hist.reduce((a, c) => a + c, 0) / LU.hist.length));
  }
  const lufsText = () => `Hlasitost programu: ${LU.s > -69 ? LU.s.toFixed(1) : '—'} LUFS (cíl pro YouTube kolem −14)`;

  /* ---------- uložení ---------- */
  const saveFx = arr => (arr || []).map(f => ({id:f.id, type:f.type, on:f.on, p:JSON.parse(JSON.stringify(f.p))}));
  const saveCh = a => ({vol:a.vol, mute:a.mute, delay:a.delay, pan:a.pan || 0, solo:false, fx:saveFx(a.fx)});
  function loadCh(d) { d = d || {}; return {vol:d.vol ?? 1, mute:!!d.mute, delay:d.delay || 0, pan:d.pan || 0, solo:false, fx:(d.fx || []).filter(f => FX[f.type]).map(f => ({id:f.id || uid(), type:f.type, on:f.on !== false, p:Object.assign(FX[f.type].d(), f.p)}))}; }
  const save_ = () => ({vol:masterFader ? masterFader.gain.value : 1, fx:saveFx(M().fx), presets:M().presets, monVol:M().monVol});
  function load(d) {
    if (d && S.audM) S.audM.fx.forEach(f => { if (f._n) try { f._n.out.disconnect(); } catch (e) {} });
    S.audM = {vol:d && d.fader != null ? d.fader : d && d.vol != null ? d.vol : 1, fx:d && d.fx ? loadCh({fx:d.fx}).fx : [mkFx('limiter', {ceil:-1})], presets:d && d.presets || {}, monVol:d && d.monVol != null ? d.monVol : 1};
    if (masterFader) { masterFader.gain.value = S.audM.vol; rebuildMaster(); }
  }

  /* ---------- UI: mix pult ---------- */
  const pos2db = v => v <= 0 ? -Infinity : -60 + v / 1000 * 70;
  const db2pos = d => d === -Infinity || d < -60 ? 0 : clamp((d + 60) / 70 * 1000, 0, 1000);
  const lin2db = g => g <= 0.00001 ? -Infinity : 20 * Math.log10(g);
  const dbs = d => d === -Infinity ? '−∞' : (d > 0 ? '+' : '') + d.toFixed(1);
  const chans = () => S.sources.filter(s => s.audio && s.audio.gainN);
  const chObj = id => id === 'master' ? {fx:M().fx, master:true} : (srcById(id) || {}).audio;
  let built = false;
  function build() {
    $('#page-audio').innerHTML = `<div class="ax">
      <div class="ax-top"><b>🎚 Mix pult</b><button id="axMon">🎧 Odposlech</button><label class="rng" style="grid-template-columns:auto 120px;margin:0">Hlasitost odposlechu<input type="range" id="axMonVol" min="0" max="1.5" step="0.01"></label>
        <span class="sp"></span><span id="axLufs" class="mono"></span></div>
      <div class="ax-strips" id="axStrips"></div>
      <div class="ax-edit panel" id="axEdit"></div></div>`;
    const pg = $('#page-audio');
    pg.addEventListener('click', onClick); pg.addEventListener('input', onInput); pg.addEventListener('change', onChange);
    $('#axMon').onclick = () => setMonitor(!R.monitor);
    $('#axMonVol').oninput = e => { M().monVol = +e.target.value; updateSolo(); save(); };
    built = true;
  }
  function strip(id, name, a, isM) {
    const fx = isM ? M().fx : a.fx, vol = isM ? masterFader.gain.value : a.vol;
    return `<div class="strip ${isM ? 'mstrip' : ''} ${SEL.ch === id ? 'sel' : ''}" data-ch="${id}">
      <div class="sname" title="${esc(name)}">${esc(name)}</div>
      <div class="fxs">${fx.map(f => `<button class="fxb ${f.on ? '' : 'off'} ${SEL.fx === f.id ? 'sel' : ''}" data-fx="${f.id}" title="${FX[f.type].n}">${f.on ? '●' : '○'} ${FX[f.type].n}</button>`).join('')}</div>
      <select data-sa="add"><option value="">+ přidat efekt</option>${Object.entries(FX).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('')}</select>
      <select data-sa="preset"><option value="">Předvolba…</option>${Object.entries(PRESETS).map(([k, v]) => `<option value="b:${k}">${v[0]}</option>`).join('')}${Object.keys(M().presets).map(k => `<option value="u:${esc(k)}">⭐ ${esc(k)}</option>`).join('')}<option value="save">💾 Uložit tento řetězec jako předvolbu…</option></select>
      ${isM ? `<button data-sa="mon" class="${R.monitor ? 'on2' : ''}">🎧 Odposlech</button>` : `<label class="panr" title="Panorama (dvojklik = střed)">L<input type="range" data-sa="pan" min="-1" max="1" step="0.01" value="${a.pan || 0}">R</label>
      <div class="msb"><button data-sa="mute" class="${a.mute ? 'on' : ''}" title="Ztlumit">M</button><button data-sa="solo" class="${a.solo ? 'solo' : ''}" title="Solo – poslech jen tohoto kanálu ve sluchátkách (do vysílání nejde)">S</button></div>`}
      <div class="fadw"><div class="vm" title="vstup"><i data-m="in"></i></div><input class="vfader" type="range" min="0" max="1000" data-sa="vol" value="${db2pos(lin2db(vol))}"><div class="vm" title="výstup"><i data-m="out"></i></div></div>
      <div class="db mono">${dbs(lin2db(vol))} dB</div><div class="gr mono" data-gr></div></div>`;
  }
  function renderPage() {
    if (!actx) return; if (!built) build();
    const box = $('#axStrips');
    box.innerHTML = chans().map(s => strip(s.id, icon(s) + ' ' + s.name, s.audio, false)).join('') +
      (chans().length ? '' : '<div class="dim" style="padding:20px;align-self:center">Zatím žádný zvuk. Přidej mikrofon nebo video v Režii → Zdroje.</div>') + strip('master', '🔴 MASTER', null, true);
    $('#axMon').classList.toggle('on2', R.monitor); $('#axMonVol').value = M().monVol ?? 1;
    R.axM = [...box.querySelectorAll('.strip')].map(el => {
      const id = el.dataset.ch, a = id === 'master' ? null : srcById(id).audio;
      return {id, inEl:el.querySelector('[data-m="in"]'), outEl:el.querySelector('[data-m="out"]'), grEl:el.querySelector('[data-gr]'),
        inAn:a ? a.inAn : masterAn, outAn:a ? a.an : masterAn, fx:() => id === 'master' ? M().fx : (srcById(id) || {audio:{fx:[]}}).audio.fx, si:{}, so:{}};
    });
    renderEditor();
  }
  function renderEditor() {
    const box = $('#axEdit'); if (!box) return;
    const ch = SEL.ch && chObj(SEL.ch), fx = ch && ch.fx.find(f => f.id === SEL.fx);
    if (!fx) { box.innerHTML = `<div class="gxp"><p class="dim">Klikni na efekt v kanálu a tady ho nastavíš. Efekty se zpracovávají shora dolů. Přidej je přes „+ přidat efekt“, nebo vyber hotovou předvolbu (např. 🎙 Hlas).</p>
      <p class="dim">Tip pro mluvené slovo: Ořez basů → Potlačení šumu → Gate → EQ → Kompresor → De-esser → Limiter. Na masteru nech Limiter na −1 dB, aby vysílání nikdy nepřebudilo.</p></div>`; return; }
    const d = FX[fx.type], P = fx.p, i = ch.fx.indexOf(fx);
    const sl = ([k, l, u, mn, mx, st]) => `<label class="rng"><span>${l}</span><input type="range" data-fp="${k}" min="${mn}" max="${mx}" step="${st}" value="${P[k]}"><output>${P[k]} ${u}</output></label>`;
    let body = d.par.map(sl).join('');
    if (fx.type === 'mono') body = `<label>Režim<select data-fp="mode">${[['mono','Mono (smíchat L+P)'],['left','Jen levý kanál'],['right','Jen pravý kanál']].map(m => `<option value="${m[0]}" ${P.mode === m[0] ? 'selected' : ''}>${m[1]}</option>`).join('')}</select></label>`;
    if (fx.type === 'nr') body += `<label class="chk"><input type="checkbox" data-fp="adapt" ${P.adapt ? 'checked' : ''}> Automaticky sledovat šum</label>
      <div class="btns"><button data-ea="learn" class="primary">🎯 Naučit šum (2 s ticha)</button><span class="dim">${fx._learned ? '✔ Šum naučen.' : 'Buď 2 sekundy potichu, ať se naučí, jak zní šum v místnosti.'}</span></div>`;
    if (fx.type === 'eq') body = `<canvas id="axEq" width="900" height="200"></canvas><div class="eqb">${P.bands.map((b, j) => `<div class="eqc" data-b="${j}">
      <select data-fb="type">${[['lowshelf','Basy (shelf)'],['peaking','Pásmo'],['highshelf','Výšky (shelf)'],['highpass','Horní propust'],['lowpass','Dolní propust'],['notch','Zářez']].map(t => `<option value="${t[0]}" ${b.type === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select>
      <label>Frekv.<input type="number" data-fb="f" min="20" max="20000" step="1" value="${Math.round(b.f)}"></label><label>Zisk dB<input type="range" data-fb="g" min="-18" max="18" step="0.1" value="${b.g}"></label><label>Q<input type="range" data-fb="q" min="0.2" max="8" step="0.05" value="${b.q}"></label></div>`).join('')}</div>`;
    box.innerHTML = `<div class="ph"><span>${SEL.ch === 'master' ? 'MASTER' : esc((srcById(SEL.ch) || {}).name)} → ${d.n} <span class="gr mono" id="axGr"></span></span>
      <span><button data-ea="toggle" class="${fx.on ? 'on2' : ''}">${fx.on ? '● Zapnuto' : '○ Vypnuto'}</button><button data-ea="left" ${i === 0 ? 'disabled' : ''}>▲ dřív</button><button data-ea="right" ${i === ch.fx.length - 1 ? 'disabled' : ''}>▼ později</button><button data-ea="del">✕ Odebrat</button></span></div>
      <div class="gxp"><p class="dim">${HELP[fx.type]}</p>${body}</div>`;
    if (fx.type === 'eq') { if (!fx._n) buildFx(fx); drawEq(fx); eqEvents(fx); }
  }
  const EQF = (() => { const a = new Float32Array(300); for (let i = 0; i < 300; i++) a[i] = 20 * Math.pow(1000, i / 299); return a; })();
  const fx2x = (f, w) => Math.log(f / 20) / Math.log(1000) * w, x2f = (x, w) => 20 * Math.pow(1000, clamp(x / w, 0, 1));
  const g2y = (g, h) => h / 2 - g / 18 * (h / 2 - 10), y2g = (y, h) => clamp((h / 2 - y) / (h / 2 - 10) * 18, -18, 18);
  function drawEq(fx) {
    const cv = $('#axEq'); if (!cv) return; const c = cv.getContext('2d'), w = cv.width, h = cv.height;
    c.fillStyle = '#0a0b0e'; c.fillRect(0, 0, w, h); c.strokeStyle = '#23262c'; c.fillStyle = '#5b616b'; c.font = '11px system-ui';
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(f => { const x = fx2x(f, w); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); c.fillText(f >= 1000 ? f / 1000 + 'k' : f, x + 2, h - 4); });
    [-12, -6, 0, 6, 12].forEach(g => { const y = g2y(g, h); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); c.fillText((g > 0 ? '+' : '') + g, 4, y - 2); });
    const tot = new Float32Array(EQF.length).fill(1), mag = new Float32Array(EQF.length), ph = new Float32Array(EQF.length);
    fx._n.f.forEach(f => { f.getFrequencyResponse(EQF, mag, ph); for (let i = 0; i < tot.length; i++) tot[i] *= mag[i]; });
    c.strokeStyle = fx.on ? '#60a5fa' : '#555'; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i < EQF.length; i++) { const x = i / (EQF.length - 1) * w, y = g2y(20 * Math.log10(tot[i]), h); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.lineWidth = 1;
    fx.p.bands.forEach((b, j) => { const x = fx2x(b.f, w), y = g2y(['highpass','lowpass','notch'].includes(b.type) ? 0 : b.g, h); c.fillStyle = ['#f87171','#fbbf24','#34d399','#60a5fa','#c084fc'][j % 5]; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill(); c.fillStyle = '#000'; c.fillText(j + 1, x - 3, y + 4); });
  }
  function eqEvents(fx) {
    const cv = $('#axEq'); let dj = -1;
    const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height]; };
    cv.onpointerdown = e => { const [x, y] = pt(e); dj = fx.p.bands.findIndex(b => Math.hypot(fx2x(b.f, cv.width) - x, g2y(b.g, cv.height) - y) < 14); if (dj >= 0) cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = e => { if (dj < 0) return; const [x, y] = pt(e), b = fx.p.bands[dj]; b.f = Math.round(x2f(x, cv.width)); b.g = +y2g(y, cv.height).toFixed(1); fx._n.up(); drawEq(fx); syncEqInputs(fx); };
    cv.onpointerup = () => { if (dj >= 0) { dj = -1; save(); } };
    cv.onwheel = e => { const [x, y] = pt(e); const j = fx.p.bands.findIndex(b => Math.hypot(fx2x(b.f, cv.width) - x, g2y(b.g, cv.height) - y) < 30); if (j < 0) return; e.preventDefault();
      const b = fx.p.bands[j]; b.q = clamp(+(b.q * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2), 0.2, 8); fx._n.up(); drawEq(fx); syncEqInputs(fx); save(); };
  }
  function syncEqInputs(fx) { $$('#axEdit .eqc').forEach(c => { const b = fx.p.bands[+c.dataset.b]; c.querySelector('[data-fb="f"]').value = Math.round(b.f); c.querySelector('[data-fb="g"]').value = b.g; c.querySelector('[data-fb="q"]').value = b.q; }); }

  function onClick(e) {
    const t = e.target, st = t.closest('.strip');
    if (t.dataset.fx && st) { SEL.ch = st.dataset.ch; SEL.fx = t.dataset.fx; renderPage(); return; }
    if (t.dataset.ea) {
      const ch = chObj(SEL.ch), fx = ch && ch.fx.find(f => f.id === SEL.fx); if (!fx) return; const i = ch.fx.indexOf(fx);
      if (t.dataset.ea === 'toggle') fx.on = !fx.on;
      if (t.dataset.ea === 'left' && i > 0) [ch.fx[i - 1], ch.fx[i]] = [ch.fx[i], ch.fx[i - 1]];
      if (t.dataset.ea === 'right' && i < ch.fx.length - 1) [ch.fx[i + 1], ch.fx[i]] = [ch.fx[i], ch.fx[i + 1]];
      if (t.dataset.ea === 'del') { if (fx._n) try { fx._n.out.disconnect(); } catch (er) {} ch.fx.splice(i, 1); SEL.fx = null; }
      if (t.dataset.ea === 'learn') { if (!fx.on) fx.on = true; if (!fx._n || fx._n.pending) { relink(SEL.ch); } fx._n.w && fx._n.w.port.postMessage({learn:2}); t.textContent = '… poslouchám ticho'; return; }
      relink(SEL.ch); renderPage(); save(); return;
    }
    if (!st) return; const id = st.dataset.ch, a = chObj(id);
    if (t.dataset.sa === 'mute') { a.mute = !a.mute; t.classList.toggle('on', a.mute); renderMixer(); save(); }
    if (t.dataset.sa === 'solo') { a.solo = !a.solo; t.classList.toggle('solo', a.solo); updateSolo(); }
    if (t.dataset.sa === 'mon') setMonitor(!R.monitor);
    if (t.classList.contains('sname')) { SEL.ch = id; SEL.fx = null; renderPage(); }
  }
  function relink(id) { if (id === 'master') rebuildMaster(); else { const s = srcById(id); if (s && s.audio) rebuildCh(s.audio); } }
  function onInput(e) {
    const t = e.target, st = t.closest('.strip');
    if (st && t.dataset.sa === 'vol') { const g = Math.pow(10, pos2db(+t.value) / 20) || 0; if (st.dataset.ch === 'master') masterFader.gain.value = g; else srcById(st.dataset.ch).audio.vol = g;
      st.querySelector('.db').textContent = dbs(lin2db(g)) + ' dB'; save(); return; }
    if (st && t.dataset.sa === 'pan') { const a = srcById(st.dataset.ch).audio; a.pan = +t.value; a.panN.pan.value = a.pan; save(); return; }
    const ch = chObj(SEL.ch), fx = ch && ch.fx.find(f => f.id === SEL.fx); if (!fx) return;
    if (t.dataset.fp) { const v = t.type === 'checkbox' ? t.checked : t.tagName === 'SELECT' ? t.value : +t.value; fx.p[t.dataset.fp] = v;
      const o = t.parentElement.querySelector('output'); if (o) { const def = FX[fx.type].par.find(p => p[0] === t.dataset.fp); o.textContent = v + ' ' + (def ? def[2] : ''); }
      if (fx._n) fx._n.up(); save(); }
    if (t.dataset.fb) { const b = fx.p.bands[+t.closest('.eqc').dataset.b], v = t.tagName === 'SELECT' ? t.value : +t.value; b[t.dataset.fb] = v; if (fx._n) fx._n.up(); drawEq(fx); save(); }
  }
  async function onChange(e) {
    const t = e.target, st = t.closest('.strip'); if (!st) return; const id = st.dataset.ch, a = chObj(id);
    if (t.dataset.sa === 'add' && t.value) { const f = mkFx(t.value); a.fx.push(f); SEL.ch = id; SEL.fx = f.id; relink(id); renderPage(); save(); }
    if (t.dataset.sa === 'preset' && t.value) {
      const v = t.value;
      if (v === 'save') { const f = await dialog('Uložit předvolbu', '<label>Název předvolby<input name="n"></label>'); if (f && f.n.trim()) { M().presets[f.n.trim()] = saveFx(a.fx); save(); } }
      else if (confirm('Nahradit efekty v tomto kanálu předvolbou?')) {
        a.fx.forEach(f => { if (f._n) try { f._n.out.disconnect(); } catch (er) {} });
        const nf = v.startsWith('b:') ? PRESETS[v.slice(2)][1]() : loadCh({fx:M().presets[v.slice(2)]}).fx.map(f => ({...f, id:uid()}));
        a.fx.splice(0, a.fx.length, ...nf); SEL.ch = id; SEL.fx = null; relink(id); save();
      }
      renderPage();
    }
  }
  function tick() {
    if (!actx) return; lufsTick(performance.now());
    if (!POP.on('audio') || !R.axM) return;
    for (const m of R.axM) {
      if (m.inEl && m.inAn) m.inEl.style.height = (100 - meterPct(m.inAn, m.si) * 100) + '%';
      if (m.outEl && m.outAn) m.outEl.style.height = (100 - meterPct(m.outAn, m.so) * 100) + '%';
      let gr = 0; for (const f of m.fx()) if (f.on && f._n && f._n.gr) gr = Math.min(gr, f._n.gr());
      if (m.grEl) m.grEl.textContent = gr < -0.3 ? `GR ${gr.toFixed(1)} dB` : '';
    }
    const ch = SEL.ch && chObj(SEL.ch), fx = ch && ch.fx.find(f => f.id === SEL.fx), g = $('#axGr');
    if (g) g.textContent = fx && fx._n && fx._n.gr ? `útlum ${fx._n.gr().toFixed(1)} dB` : '';
    const l = $('#axLufs'); if (l) l.textContent = `Okamžitá ${LU.m > -69 ? LU.m.toFixed(1) : '—'} LUFS · krátkodobá ${LU.s > -69 ? LU.s.toFixed(1) : '—'} LUFS (YouTube ≈ −14)`;
  }
  return {start:init, init() {}, attach, setMonitor, saveCh, loadCh, save:save_, load, renderPage, tick, lufsText, FX};
})();
