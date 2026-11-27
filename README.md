# 🎬 Režie Live 2.0 / Live Director 2.0

**Živá režie pro vysílání – v prohlížeči i jako aplikace pro Mac a Windows.** Kamery, scény, přechody, klíč, animovaná grafika, mix pult, color grading, replay, makra, vedlejší programy, hosté přes odkaz, mobil jako kamera, NDI / SRT, nahrávání a stream na víc míst najednou.

**Live production switcher – in the browser and as a Mac / Windows app.** Cameras, scenes, transitions, chroma key, animated graphics, audio mixer, color grading, instant replay, macros, side programs, guests via link, phone as a camera, NDI / SRT, recording and multistreaming.

🌐 Aplikace je česky i anglicky (přepínač 🌐 v liště). · The app is in Czech and English (🌐 switch in the top bar).

| | |
|---|---|
| ⬇ **Stažení / Download** | [Releases](https://github.com/antoninfeldek-bot/rezie-live/releases/latest) – Mac (Apple Silicon / Intel) `.dmg`, Windows 10/11 `.exe` |
| 🌍 **Online verze / Online version** | https://antoninfeldek-bot.github.io/rezie-live/ |
| 📖 **Návod / Guide** | [NAVOD.md](NAVOD.md) (CZ) · [GUIDE.md](GUIDE.md) (EN) |
| 🧪 **Testovací arch / Test sheet** | [TESTING.md](TESTING.md) (CZ) · [TESTING.en.md](TESTING.en.md) (EN) · CSV: [testing/](testing/) |
| 🐞 **Chyby / Bugs** | [Issues](https://github.com/antoninfeldek-bot/rezie-live/issues) |

> Vibecoding projekt – postavený s AI (Claude). Jde hlavně o funkčnost; zpětná vazba z testování je vítaná. / A vibecoding project built with AI (Claude). Function first – feedback from testing is welcome.

---

## 🇨🇿 Co umí

### Přepínání a scény
- **Náhled a program** (zelený / červený), **CUT** (mezerník), **AUTO** (Enter), **T-bar** jako v televizní režii, klávesy 1–9.
- **Přechody:** prolínačka, přes barvu, stíračky, najetí, vytlačení, zoom, kruh, rozmazání, **stinger** (vlastní video s průhledností a bodem střihu).
- **Vrstvy** ve scéně: posun a zvětšení myší, ořez, průhlednost, **klíčování** zeleného / modrého pozadí s výběrem barvy kliknutím.
- **▦ SuperSource / rozložení:** 10 šablon (2, 3, 4, 6 zdrojů, obraz v obraze, velký + pruh…), zaoblení, rámeček, stín, výplň bez deformace, **plynulá animace změny rozložení i ve vysílání**.
- **🎛 Vedlejší programy:** výstupy 2–4 mají vlastní náhled a program a přepínají se stejně jako hlavní (přepínač PGM · 2 · 3 · 4 nad CUT) – pro sál, pódium, projektor. Okno jde jedním klikem na další monitor.
- Znělka, která se po skončení sama přepne na kameru.

### Zdroje
- Kamery (vč. **HDMI karet** Elgato / Blackmagic / Magewell s výběrem formátu), mikrofony, obrazovka / okno, video, **playlist**, obrázky, texty, barvy, **prezentace** (snímky, klikr), **web a chat** z YouTube / Twitche.
- **360° kamery** (Insta360, Theta): plné 2:1 rozlišení a **virtuální kamery** z jednoho 360° obrazu (záběr / malá planeta / panoráma, předvolby s plynulým přejezdem).
- **Síťové vstupy (aplikace):** **NDI**, **SRT** (mobil přes Larix, OBS), **RTMP**, IP kamery **RTSP**, HLS. Zvuk se **sám dolaďuje na hodiny režie** – nerozjede se ani po hodinách.
- **📱 Mobil jako kamera:** QR kód → mobil posílá až 4K / 60 fps v H.264 s nízkým zpožděním, zadní kamera, zoom, světlo.
- **👤 Hosté přes odkaz** (WebRTC): v místní síti i přes internet (vestavěný tunel, volitelně TURN), **mix-minus**, **tally** „JSI VE VYSÍLÁNÍ“, pokyny na obrazovku.

### Grafika
- **Editor animované grafiky** s časovou osou a **klíčovými snímky** (pozice, měřítko, rotace, krytí, ořez, rozostření, průběhy), rychlé animace příjezdu / odjezdu, šablony (jmenovka, logo, ŽIVĚ, lišta, odpočet, hodiny, skóre, anketa, zpráva z chatu).
- **Pole** měněná za běhu (`{jmeno}`, čas, datum, odpočet), **titulky z Google tabulky / CSV**.
- **Fonty z počítače** – všechna nainstalovaná písma v grafice; Inter a JetBrains Mono přibalené.

### Zvuk
- **Mix pult** s modulárním řetězcem efektů na každém kanálu: ořez basů, **potlačení šumu** (naučení šumu), gate, **parametrický EQ** v grafu, kompresor, de-esser, limiter, zpoždění, mono, zesílení; předvolby.
- **MASTER** s limiterem a měřením **LUFS**, solo do sluchátek, zpoždění zvuku proti obrazu.
- **Sběrnice** (aux mixy) na libovolná výstupní zařízení, **🔌 zvuk programu do Zoomu / Teams** (BlackHole / VB-Cable).

### Barvy
- **Color grading** na grafické kartě: lift / gamma / gain / offset kola, křivky, expozice, teplota, tint, kontrast s pivotem, saturace, posun odstínů, **3D LUT (.cube)**.
- **Scopy:** waveform, RGB parade, vektorskop, histogram; před / po, kopírování gradu, galerie.

### Replay
- **⏪ Replay 2.0:** kruhový buffer kamer, vstupů i **celého programu** (kódováno na grafice do paměti), rychlost 100 / 75 / 50 / 25 %, **víc úhlů** (přepnutí ve stejném okamžiku, „všechny úhly po sobě“), **IN / OUT s posuvníkem** (i MIDI fader), **plynulé zpomalení** prolínáním snímků, 25–60 fps, automatický **stinger** do replaye a zpět, značky.

### Ovládání a automatizace
- **Klávesy**, **MIDI** (tlačítka i fadery – hlasitost, T-bar), **Stream Deck / Companion** přes HTTP.
- **🎬 Makra:** sekvence akcí s časováním (čekej N s, na konec přechodu, na konec videa, na další stisk), smyčka, šablony; spouštění klávesou, MIDI, Stream Deckem, z mobilu i automatizací.
- **Automatizace** „když se stane X, udělej Y“ (scéna, konec videa, blok scénáře, čas, interval, start vysílání / nahrávání).
- **📋 Scénář** s bloky, časy a automatickým přepnutím scény, grafiky a textu; **📜 čtečka** (zrcadlení, okno, iPad ve čtecím zařízení).
- **📱 Ovladač z mobilu / iPadu** s rolemi (vše / jen grafika / jen zvuk), **🎙 interkom** pro kameramany (tally, pokyny, push-to-talk).
- **🏆 Živě:** skóre a časomíra, chat diváků (Twitch / YouTube) do vysílání, ankety.
- **PTZ kamery** (VISCA přes IP), předvolby.

### Výstupy, vysílání a nahrávání
- **Vysílání** přes RTMP / RTMPS / **SRT** na **víc míst najednou** (YouTube, Twitch, Facebook, vlastní), kódování na grafice, automatické znovupřipojení, adaptivní datový tok, pojistná nahrávka, zpoždění vysílání; **WHIP** přímo z prohlížeče.
- **Nahrávání** programu i **ISO** (každá kamera, host a vstup zvlášť) průběžně na disk; **EDL** pro Premiere / DaVinci, **kapitoly pro YouTube**, značky.
- **NDI výstup** (a přes NDI Virtual Input jako kamera pro Zoom / Teams / Meet), **výstupy 2–4** na další monitory, okno Program, **Multiview**.
- Formáty plátna 720p – 4K, **9:16** (TikTok / Reels / Shorts), čtverec, 360° 2:1; 24–60 fps.

### Spolehlivost a pohodlí
- Automatické ukládání a zálohy, znovupřipojení odpojené kamery / mikrofonu, **📊 stránka Stavu** (stream, internet, hosté, počítač), test rychlosti internetu.
- V aplikaci pro Mac: **když okno spadne, vysílání nepřestane** (záložní obraz, okno se samo obnoví).
- **Modulární rozložení** panelů, panely v samostatných oknech, automatické aktualizace, čistý tmavý vzhled (červená jen pro vysílání a nahrávání).

## 🇬🇧 Features (short)
Program / preview switching with CUT, AUTO, T-bar and stinger · layers, crop and chroma key · **SuperSource layouts** with animated changes · **side programs** on outputs 2–4 · cameras, HDMI cards, 360° cameras with virtual shots, video, playlists, slides, web & chat · **NDI / SRT / RTMP / RTSP inputs** with audio clock-drift correction · **phone as a camera** (up to 4K60) · **guests via link** with mix-minus and tally · keyframed **graphics editor**, live fields, Google Sheets / CSV data, system fonts · **audio mixer** with modular effects, LUFS, buses, audio to Zoom / Teams · GPU **color grading** with LUTs and scopes · **Replay 2.0** (program + multiple angles, IN/OUT, smooth slow motion, stinger) · **macros**, automation, rundown, teleprompter, keys / MIDI / Stream Deck, phone remote with roles, crew intercom, scores / chat / polls, PTZ · **multistreaming** (RTMP / SRT / WHIP) with GPU encoding and auto-reconnect · program + **ISO recording**, EDL and chapters · **NDI output**, extra outputs, Multiview · 9:16 and 4K canvases · autosave, status page, crash-proof streaming on Mac. Full list: [GUIDE.md](GUIDE.md).

## Spuštění bez instalace / Run without installing
- Online: https://antoninfeldek-bot.github.io/rezie-live/ (Chrome / Edge). Pro RTMP vysílání z online verze spusť `node server.js`. / For RTMP streaming from the online version run `node server.js`.
- Ze zdrojáků / From source: `node server.js` → http://localhost:8080 (Windows: `start-windows.bat`, Mac: `start-mac.command`). Vysílání potřebuje FFmpeg. / Streaming needs FFmpeg.

Technologie / Tech: HTML, CSS, JavaScript (WebGL2, Web Audio, WebCodecs, WebRTC), Node.js, Electron, FFmpeg. NDI® is a registered trademark of Vizrt NDI AB.
