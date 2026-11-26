# 🎬 Režie Live – návod

## Co je ve složce
- **index.html** + složky **css/** a **js/** – samotná režie (běží v prohlížeči Chrome / Edge)
- **server.js** – malý pomocný program, který posílá vysílání na YouTube / Twitch / Facebook
- **NAVOD.md** – tenhle návod

Všechno nech pohromadě v **jedné složce** (tak, jak je to na GitHubu).

## 1. Jednorázová instalace
1. **Node.js** – stáhni z nodejs.org (verze LTS) a nainstaluj.
2. **FFmpeg** – potřeba jen pro vysílání:
   - Windows: v terminálu `winget install ffmpeg` (pak terminál zavři a otevři znovu)
   - Mac: `brew install ffmpeg`
   - Kontrola: `ffmpeg -version` musí něco vypsat.

## 2. Spuštění
1. Otevři terminál ve složce s aplikací.
2. Napiš `node server.js`
3. V Chrome otevři **http://localhost:8080**
4. Klikni **Spustit studio** a povol kameru a mikrofon.

Režie je taky online: **https://antoninfeldek-bot.github.io/rezie-live/** – kamery, scény, nahrávání i čtečka fungují rovnou tam. Jen pro **vysílání** musí v počítači běžet `node server.js` (online stránka mu pak posílá obraz).

## 3. Jak se s tím pracuje
- **Zdroje** (záložka dole): přidej kamery, mikrofony, videa (znělky), obrázky (logo), texty (titulky), obrazovku.
- **Scény** (vlevo dole): každá scéna = jedna „sestava“ (např. „Kamera“, „Host“, „Znělka“).
- **NÁHLED** (zelený) = tady si scénu připravíš a upravuješ. **PROGRAM** (červený) = to jde ven.
- **CUT** (mezerník) = okamžité přepnutí. **PŘECHOD** (Enter) = plynulé prolnutí.
- V náhledu jde vrstvy tahat myší a za rohy zvětšovat.

### Klíč na zeleném pozadí
1. Vyber vrstvu s kamerou → záložka **Vlastnosti** → **Zapnout klíč**.
2. Klikni na **🎯** a potom do zeleného pozadí v náhledu.
3. Posuň **Podobnost**, až zelená zmizí. Pod kameru dej vrstvu s pozadím (obrázek, video nebo barvu).

### Čtyři pracovní stránky (nahoře v liště)
- **🎬 Režie** – přepínání scén, náhled a program, všechny záložky dole.
- **✨ Grafika** – editor titulků a animací (jako After Effects).
- **🎚 Zvuk** – mix pult s efekty.
- **🎨 Barvy** – grading, LUTy a scopy.

### Grafika a animace (stránka ✨ Grafika)
- Grafika = vrstvy (text, obdélník, obrázek, běžící lišta). Vlevo hotové šablony: jmenovka, logo, ŽIVĚ, lišta se zprávami, velký titulek, odpočet, hodiny.
- **Časová osa dole:** zelená část = příjezd (IN), pak grafika čeká, červená = odjezd (OUT). Značky IN a OUT posuneš na pravítku.
- **◆ = klíčový snímek.** Posuň přehrávací hlavu, změň hodnotu (X, Y, krytí, měřítko, rotace, ořez, rozostření…) a klikni na ◆. Snímky jdou tahat myší, u každého jde nastavit průběh (plynule, s překmitem…).
- **Rychlá animace:** vyber vrstvu → „Příjezd“ a „Odjezd“ (vjezd zleva, odkrytí, zvětšení…) → Použít.
- **Pole:** napiš do textu třeba `{jmeno}` a v Režii → záložka **Grafika** to přepíšeš za běhu bez otevírání editoru. Speciální: `{time}`, `{hm}`, `{date}`, `{cd}` (odpočet), `{elapsed}`.
- Do vysílání: Režie → záložka **Grafika** → ON AIR, nebo klávesy **F1–F8**. Grafika jde přes všechny scény.
- Ctrl+Z = zpět, mezerník = přehrát animaci.

### Přechody (záložka Přechody)
Prolínačka, přes barvu, stíračka, najetí, vytlačení, zoom, kruh, rozmazání a **stinger** (vlastní animace – video s průhledností, např. WebM z After Effects, + bod střihu). Každý jde upravit a uložit. Vybraný přechod jede na **AUTO (Enter)** a **T-bar** (svislý jezdec uprostřed – táhni ručně).

### Mix pult (stránka 🎚 Zvuk)
- Každý kanál má **řetězec efektů**, který si poskládáš sám: Ořez basů, Potlačení šumu, Gate, EQ, Kompresor, De-esser, Limiter, Zpoždění, Mono, Zesílení. Pořadí měníš šipkami, každý jde vypnout.
- **Předvolby:** 🎙 Hlas, 🌬 Hlas v hlučném prostředí, 🎵 Hudba – a můžeš si uložit vlastní.
- **Potlačení šumu:** buď 2 s potichu a klikni „Naučit šum“.
- **EQ:** tahej body v grafu, kolečko myši mění šířku.
- **S (solo)** = poslech jen jednoho kanálu ve sluchátkách (do vysílání nejde). **GR** = kolik kompresor/limiter ubírá.
- Na **MASTERU** je limiter na −1 dB, aby vysílání nikdy nepřebudilo. Nahoře je měřák hlasitosti v **LUFS** (YouTube ≈ −14).

### Barvy (stránka 🎨 Barvy)
- Vlevo vyber kameru. Kola **Lift / Gamma / Gain / Offset** (Shift = jemně, dvojklik = vynulovat), **křivky** Y/R/G/B, expozice, teplota, tint, kontrast s pivotem, saturace, posun odstínů a **LUT (.cube)** se silou.
- **Scopy:** waveform, RGB parade, vektorskop (žlutá čára = tón pleti), histogram.
- **Před / po**, kopírovat a vložit grade, „Na všechny kamery“, galerie uložených gradů.
- LUT z DaVinci: pravý klik na snímek → Generate LUT → 33 Point Cube.

### Scénář (záložka Scénář)
Bloky pořadu s délkou, scénou, grafikou, textem do čtečky a poznámkami. **N** = další blok, **B** = předchozí. Ukazuje, kolik zbývá (červeně přesah) a kdy pořad skončí. Při přechodu na blok se sama přepne scéna, zapne grafika a nahraje text do čtečky.

### Ovládání (záložka Ovládání)
- **Klávesy:** u každé akce „Naučit“ → zmáčkni klávesu.
- **MIDI ovladač:** „Připojit MIDI“ → „Naučit MIDI“ → zmáčkni tlačítko / pohni faderem. Fadery jdou na hlasitost a T-bar.
- **Stream Deck / Companion:** spusť `node server.js`, zaškrtni „Povolit ovládání přes server.js“ a na Stream Decku dej tlačítku akci **Website** (GET na pozadí) s adresou z tabulky, např. `http://localhost:8080/action/take.cut`. Funguje i když okno není aktivní.

### Znělka, která se sama přepne
1. Udělej scénu „Znělka“ a dej do ní video.
2. Ve **Vlastnostech scény** nastav „Když skončí video, přepnout na: Kamera“.

### Více monitorů
- **🖥 Okno Program** = čistý obraz (bez ovládání). Přetáhni ho na projektor nebo druhý monitor a dej dvojklik → celá obrazovka.
- **▦ Multiview** = všechny kamery najednou + náhled + program.
- **📜 Okno čtečky** = text pro moderátora. Pro skleněnou čtečku zapni **Zrcadlit**.
- Hlavní okno režie **neminimalizuj** – jinak prohlížeč zpomalí obraz i vysílání.

### Zvuk
Záložka **Zvuk**: hlasitost každého mikrofonu, ztlumení (M), zpoždění (když zvuk předbíhá obraz), MASTER a odposlech do sluchátek.

## 4. Vysílání na sociální síť
1. Na platformě si vezmi **klíč streamu** (stream key):
   - YouTube: YouTube Studio → Vytvořit → Spustit živé vysílání → Stream → „Klíč streamu“
   - Twitch: Ovládací panel tvůrce → Nastavení → Stream → „Primární klíč streamu“
   - Facebook: Live Producer → „Použít klíč streamu“
   - Jiná síť: vyber **Vlastní** a zkopíruj adresu serveru i klíč (jestli to síť u tvého účtu dovoluje).
2. V aplikaci záložka **Vysílání** → vyber platformu, vlož klíč.
3. Klikni **⦿ Vysílat**. Stav uvidíš v záložce Vysílání.

⚠ Klíč streamu nikomu neukazuj – kdo ho má, může vysílat na tvůj kanál. Aplikace si ho neukládá.

## 5. Nahrávání
- **● Program** – nahraje to, co jde ven. **● Vše (ISO)** – program + každou kameru a mikrofon zvlášť, ve stejnou chvíli.
- **Doporučeno:** záložka Nahrávky → **📁 Vybrat složku pro nahrávky**. Pak se všechno zapisuje **průběžně rovnou na disk** – nic se nedrží v paměti, jde nahrávat hodiny a při pádu prohlížeče soubor zůstane. Po novém spuštění jen potvrdíš přístup ke složce.
- Bez vybrané složky se nahrávka drží v paměti a po zastavení se stáhne.

## 6. Když něco nejde
- **Kamera je černá** – jedna kamera jde většinou otevřít jen jednou. Zavři jiné programy, které ji používají (Zoom, OBS, Teams).
- **Nové okno se neotevře** – povol vyskakovací okna (ikona vpravo v adresním řádku).
- **Vysílání nejde** – běží `node server.js`? V záložce Vysílání klikni „Otestovat spojení“.
- **Projekt** se ukládá sám v prohlížeči. Zálohu uděláš tlačítkem 💾. Videa a obrazovku je po novém spuštění potřeba připojit znovu („Připojit znovu“).
