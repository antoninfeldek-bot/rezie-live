"""Režie Live – automatický test (Playwright + Chrome).
Spuštění: ve složce projektu `python3 -m http.server 8090`, pak `python3 tests/smoke.py cs` (nebo `en`).
Potřebuje: pip install playwright pillow; Chrome v /usr/bin/google-chrome (nebo uprav executable_path);
testovací video tests/assets/t.mp4 (např. `ffmpeg -f lavfi -i testsrc=size=1280x720:rate=30 -t 10 -pix_fmt yuv420p tests/assets/t.mp4`).
Kontroluje i to, co je OPRAVDU vidět na obrazovce (screenshot monitorů), ne jen obsah canvasu.
Známé: krok „PROGRAM visible after restore“ padá, protože testovací falešné kamery nejdou obnovit – to není chyba."""
BASE = "http://localhost:8090"
from playwright.sync_api import sync_playwright
import json, sys, traceback
LANG = sys.argv[1] if len(sys.argv)>1 else 'cs'
R=[]
def ok(name, cond, extra=''):
    R.append((name, bool(cond), extra)); 
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'])
    ctx=b.new_context(viewport={'width':1440,'height':900}); ctx.add_init_script(f"localStorage.setItem('rezie-lang','{LANG}')")
    pg=ctx.new_page(); errs=[]; cons=[]
    pg.on('pageerror',lambda e: errs.append(str(e)[:200])); pg.on('console',lambda m: cons.append(m.text[:200]) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.goto(BASE + '/index.html'); pg.wait_for_timeout(700); pg.click('#start button'); pg.wait_for_timeout(1500)
    def scr(sel):  # visible pixel stats of element on screen
        bb=pg.locator(sel).first.bounding_box(); 
        img=pg.screenshot(clip={'x':bb['x']+bb['width']*0.25,'y':bb['y']+bb['height']*0.25,'width':bb['width']*0.5,'height':bb['height']*0.5})
        from PIL import Image; import io; im=Image.open(io.BytesIO(img)).convert('RGB').resize((8,8)); px=list(im.getdata()); return max(max(c) for c in px)
    def step(name, fn):
        n=len(errs)
        try: r=fn(); ok(name, len(errs)==n and r is not False, (errs[n:] or [''])[0] if len(errs)>n else ('' if r is not False else 'check failed'))
        except Exception as e: ok(name, False, str(e)[:160])
    ev=pg.evaluate
    # sources
    step('add fake cameras', lambda: ev("""(()=>{const cols=['#e11d48','#16a34a','#2563eb'];window.__c=[];cols.forEach((c,i)=>{const cv=document.createElement('canvas');cv.width=1280;cv.height=720;const s=newSource('camera','Cam '+(i+1));s.el=cv;s.hasVideo=true;s.aspect=16/9;S.sources.push(s);S.scenes[i].layers.push(newLayer(s));__c.push([s,c]);});
      let n=0;setInterval(()=>{n++;for(const [s,c] of __c){const x=s.el.getContext('2d');x.fillStyle=c;x.fillRect(0,0,1280,720);x.fillStyle='#fff';x.font='bold 120px sans-serif';x.fillText(n,80,300);s.dirty=true;}},40);
      setPreview(S.scenes[1].id);take('cut');setPreview(S.scenes[0].id);renderSources();return true;})()"""))
    pg.wait_for_timeout(500)
    step('PREVIEW visible on screen', lambda: scr('#pv')>40)
    step('PROGRAM visible on screen', lambda: scr('#pg')>40)
    # add real source types via UI-less API
    step('text source', lambda: ev("(()=>{const s=newSource('text','T');S.sources.push(s);renderText(s);S.scenes[0].layers.push(newLayer(s));renderLayers();return true})()"))
    step('color source', lambda: ev("(()=>{const s=newSource('color','B');S.sources.push(s);renderColor(s);S.scenes[3].layers.push(newLayer(s));return true})()"))
    step('video source', lambda: ev("""(async()=>{const s=newSource('video','Video');s.props.path='/tests/assets/t.mp4';S.sources.push(s);
        const v=document.createElement('video');v.src='/tests/assets/t.mp4';v.muted=true;v.loop=true;poolAdd(v);s.el=v;s.hasVideo=true;await v.play().catch(()=>{});S.scenes[2].layers.push(newLayer(s));renderSources();return true})()"""))
    pg.wait_for_timeout(500)
    # switching
    step('CUT', lambda: (pg.click('#bCut'), pg.wait_for_timeout(200), ev("S.programId===S.scenes[0].id"))[2])
    step('AUTO', lambda: (pg.keyboard.press('Digit2'), pg.click('#bFade'), pg.wait_for_timeout(900), ev("S.programId===S.scenes[1].id"))[3])
    step('PROGRAM visible after AUTO', lambda: scr('#pg')>40)
    for t in ev("Object.keys(TR.TYPES)"):
        step(f'transition {t}', lambda t=t: ev(f"""(async()=>{{const tr=S.trs.list.find(x=>x.type==='{t}');if(!tr)return true;TR.select(tr.id);setPreview(S.scenes[S.programId===S.scenes[0].id?1:0].id);take('auto');await new Promise(r=>setTimeout(r,(tr.dur||600)+500));return !S.active}})()"""))
    step('T-bar', lambda: ev("""(async()=>{const fade=S.trs.list.find(x=>x.type==='fade');TR.select(fade.id);const before=S.programId;setPreview(S.scenes[before===S.scenes[0].id?1:0].id);TR.tbar(500);await new Promise(r=>setTimeout(r,100));const mid=!!S.active;TR.tbar(1000);await new Promise(r=>setTimeout(r,100));return mid&&S.programId!==before})()"""))
    # layer props
    step('layer props/crop/key/box', lambda: ev("""(()=>{const sc=prevScene();const l=sc.layers[0];S.selLayer=l.id;renderProps();layerAction('pip');layerAction('full');l.crop.l=0.1;l.key.on=true;l.box={on:true,r:20,bw:4,bc:'#fff',sh:20,sho:.5,fit:'cover'};renderProps();return document.querySelectorAll('#tab-props [data-l]').length>5})()"""))
    pg.wait_for_timeout(300); step('preview still visible with key/box', lambda: scr('#pv')>20)
    step('reset layer', lambda: ev("(()=>{const l=prevScene().layers[0];l.crop.l=0;l.key.on=false;l.box.on=false;return true})()"))
    # SuperSource all templates
    step('SuperSource templates', lambda: ev("""(async()=>{const sc=S.scenes[0];[S.sources[1],S.sources[2]].forEach(s=>sc.layers.push(newLayer(s)));for(const k of Object.keys(SS.TPL)){SS.apply(sc,k,{dur:0});}SS.apply(sc,'grid4');return sc.layers.filter(l=>l.box&&l.box.on).length>=3})()"""))
    pg.wait_for_timeout(300); step('PREVIEW visible with SuperSource', lambda: scr('#pv')>40)
    # every bottom tab
    for t in ['props','sources','gfxctl','trans','audio','rundown','prompter','stream','rec','control','replay','live','ptz','remote']:
        step(f'tab {t}', lambda t=t: (pg.click(f'.tabs button[data-tab={t}]'), pg.wait_for_timeout(250), ev(f"document.querySelector('#tab-{t}').innerText.trim().length>10"))[2])
    # pages
    for pgn in ['gfx','audio','color','status','rezie']:
        step(f'page {pgn}', lambda pgn=pgn: (pg.click(f'#pages button[data-page={pgn}]'), pg.wait_for_timeout(500), ev(f"document.querySelector('#page-{pgn}') && document.querySelector('#page-{pgn}').innerText.trim().length>10"))[2])
        pg.screenshot(path=f'/tmp/sm_{pgn}_{LANG}.png')
    # graphics: add templates, toggle on air
    step('gfx templates on air', lambda: ev("""(async()=>{showPage('gfx');await new Promise(r=>setTimeout(r,300));const btns=[...document.querySelectorAll('#page-gfx [data-tpl],#page-gfx [data-gt]')];for(const b of btns.slice(0,12)){b.click();await new Promise(r=>setTimeout(r,60));}showPage('rezie');const G=S.gfx.list[0];if(!G)return 'no gfx';GFX.toggle(G);await new Promise(r=>setTimeout(r,800));const on=GFX.isOn(G);GFX.toggle(G);return on})()"""))
    # audio
    step('audio presets/fx', lambda: ev("""(()=>{showPage('audio');const b=[...document.querySelectorAll('#page-audio button')].slice(0,15);b.forEach(x=>{if(!/✕|Odebrat|Smazat|Remove|Delete/.test(x.textContent))try{x.click()}catch(e){}});showPage('rezie');return true})()"""))
    # color
    step('color page grade', lambda: ev("""(()=>{showPage('color');GR.open(S.sources[0].id);const s=S.sources[0];s.color=s.color||{};showPage('rezie');return true})()"""))
    # macros
    step('macro run', lambda: ev("""(async()=>{S.macros={list:[{id:'m1',name:'T',again:'restart',loop:false,steps:[{t:'act',a:'scene.pv.2'},{t:'wait',s:0.3},{t:'act',a:'take.cut'}]}]};MAC.run('m1');await new Promise(r=>setTimeout(r,700));return S.programId===S.scenes[2].id})()"""))
    # replay
    step('replay go', lambda: ev("""(async()=>{S.replay.cams=[S.sources[0].id];S.replay.prog=true;await new Promise(r=>setTimeout(r,2500));RPL.go(null,1,0.5);await new Promise(r=>setTimeout(r,500));const ok=RPL.status().playing;RPL.stopPlay();return ok})()"""))
    # side bus
    step('side bus', lambda: ev("""(()=>{SIDE.select(2);ui(()=>{setPreview(S.scenes[1].id);take('cut')});const r=OUT2.pg()===S.scenes[1].id;SIDE.select(0);return r&&document.querySelectorAll('.busov').length===0})()"""))
    pg.wait_for_timeout(300); step('PROGRAM visible after bus back', lambda: scr('#pg')>40)
    # windows
    for bid in ['bWinPg','bWinMv','bWinPr']:
        step(f'window {bid}', lambda bid=bid: (pg.click('#'+bid), pg.wait_for_timeout(600), True)[2])
    step('outputs 2-4 open', lambda: ev("(()=>{OUT2.open();OUT3.open();OUT2.close();OUT3.close();return true})()"))
    # settings dialog
    step('settings dialog', lambda: (pg.click('#bSet'), pg.wait_for_timeout(400), pg.keyboard.press('Escape'), True)[3])
    step('layout menu', lambda: (pg.click('#bLayout'), pg.wait_for_timeout(300), pg.keyboard.press('Escape'), pg.mouse.click(5,890), True)[4])
    step('help', lambda: (pg.click('#bHelp'), pg.wait_for_timeout(300), pg.keyboard.press('Escape'), True)[3])
    # rundown / automation / live
    step('rundown next', lambda: ev("(()=>{RUN.next&&RUN.next();RUN.prev&&RUN.prev();return true})()"))
    step('ctl actions run', lambda: ev("""(()=>{const skip=/^(rec|iso|stream|out[234]|bus\\.|page\\.|replay\\.go|replay\\.all|macro|prompter$|slides|ptz|v360|data\\.)/;let n=0;for(const a of CTL.actions()){if(skip.test(a.id))continue;try{a.cont?a.run(0.5):a.run();n++}catch(e){console.error('ACT '+a.id+' '+e.message)}}return n})()"""))
    pg.wait_for_timeout(500)
    # save/restore
    step('serialize+restore', lambda: ev("""(async()=>{const d=JSON.parse(JSON.stringify(serialize()));await restore(d);return S.scenes.length>=4})()"""))
    pg.wait_for_timeout(800)
    step('PROGRAM visible after restore', lambda: scr('#pg')>10)
    pg.screenshot(path=f'/tmp/sm_end_{LANG}.png')
    for n,o,e in R: print(('OK  ' if o else 'FAIL'), n, e)
    print('PAGEERR', errs[:10]); print('CONSOLE', [c for c in cons if 'favicon' not in c][:15])
    b.close()
