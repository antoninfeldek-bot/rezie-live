# 🎬 Režie Live / Live Director

🌐 Aplikace je česky i anglicky – přepínač 🌐 v horní liště. · The app is in Czech and English – switch with 🌐 in the top bar. English guide: [GUIDE.md](GUIDE.md)

**Online:** https://antoninfeldek-bot.github.io/rezie-live/

Webová režie pro živé vysílání se 4 pracovními stránkami: **Režie** (scény, klíč, přechody vč. stingeru a T-baru, scénář), **Grafika** (editor animovaných titulků s klíčovými snímky), **Zvuk** (mix pult s modulárními efekty: noise reduction, gate, EQ, kompresor, de-esser, limiter, LUFS) a **Barvy** (lift/gamma/gain, křivky, LUT, waveform, parade, vektorskop, histogram). Dále ovládání klávesami, MIDI a Stream Deckem, nahrávání rovnou na disk, titulky, znělky, mix zvuku, čtečka (teleprompter), více monitorů, nahrávání (program + ISO) a stream na YouTube / Twitch / Facebook.

## 🍎 Mac aplikace / Mac app
Stáhni DMG z [Releases](https://github.com/antoninfeldek-bot/rezie-live/releases/latest) (arm64 = M1–M4, x64 = Intel), přetáhni do Aplikací, při prvním spuštění **Nastavení systému → Soukromí a zabezpečení → Přesto otevřít**. V aplikaci je **🚀 Nativní vysílání**: kódování na grafice, víc míst najednou, SRT, automatické znovupřipojení, pojistná nahrávka. Návod: [NAVOD.md](NAVOD.md) · [GUIDE.md](GUIDE.md).

**Nově:** 📱 ovládání z iPadu/mobilu, 👤 hosté přes odkaz (s mix-minus a tally), 🛡 vysílání nepřestane ani při pádu okna. / **New:** iPad/phone remote, guests via link, stream survives window crashes.

## Rychlý start
Windows: dvojklik na `start-windows.bat` · Mac: `start-mac.command` · nebo `node server.js` a v Chrome http://localhost:8080.

Vysílání: přes server.js (RTMP, i víc míst najednou, kódování na grafice, automatické znovupřipojení) nebo přímo z prohlížeče přes WHIP (Twitch, Restream, vlastní server).

Pro vysílání je potřeba FFmpeg. Celý návod je v [NAVOD.md](NAVOD.md).
