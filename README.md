# 🎬 Režie Live / Live Director

🌐 Aplikace je česky i anglicky – přepínač 🌐 v horní liště. · The app is in Czech and English – switch with 🌐 in the top bar. English guide: [GUIDE.md](GUIDE.md)

**Online:** https://antoninfeldek-bot.github.io/rezie-live/

Webová režie pro živé vysílání se 4 pracovními stránkami: **Režie** (scény, klíč, přechody vč. stingeru a T-baru, scénář), **Grafika** (editor animovaných titulků s klíčovými snímky), **Zvuk** (mix pult s modulárními efekty: noise reduction, gate, EQ, kompresor, de-esser, limiter, LUFS) a **Barvy** (lift/gamma/gain, křivky, LUT, waveform, parade, vektorskop, histogram). Dále ovládání klávesami, MIDI a Stream Deckem, nahrávání rovnou na disk, titulky, znělky, mix zvuku, čtečka (teleprompter), více monitorů, nahrávání (program + ISO) a stream na YouTube / Twitch / Facebook.

## Rychlý start
Windows: dvojklik na `start-windows.bat` · Mac: `start-mac.command` · nebo `node server.js` a v Chrome http://localhost:8080.

Vysílání: přes server.js (RTMP, i víc míst najednou, kódování na grafice, automatické znovupřipojení) nebo přímo z prohlížeče přes WHIP (Twitch, Restream, vlastní server).

Pro vysílání je potřeba FFmpeg. Celý návod je v [NAVOD.md](NAVOD.md).
