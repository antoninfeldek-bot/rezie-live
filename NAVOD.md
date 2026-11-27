# 🎬 Režie Live – návod

## Co je ve složce
- **index.html** + složky **css/** a **js/** – samotná režie (běží v prohlížeči Chrome / Edge)
- **server.js** – malý pomocný program, který posílá vysílání na YouTube / Twitch / Facebook
- **NAVOD.md** – tenhle návod

Všechno nech pohromadě v **jedné složce** (tak, jak je to na GitHubu).

Aplikace umí česky i anglicky – přepínač **🌐 EN / 🌐 CZ** je v horní liště (a na úvodní obrazovce). Anglický návod: GUIDE.md.

## 🍎 Aplikace pro Mac (doporučeno)
1. Otevři [Releases](https://github.com/antoninfeldek-bot/rezie-live/releases/latest) a stáhni **Rezie-Live-mac-arm64.dmg** (Mac s čipem M1/M2/M3/M4) nebo **Rezie-Live-mac-x64.dmg** (starší Mac s Intelem).
2. Otevři DMG a přetáhni **Rezie Live** do složky **Aplikace**.
3. Při prvním spuštění macOS napíše, že aplikaci nezná. Otevři **Nastavení systému → Soukromí a zabezpečení**, sjeď dolů a klikni **Přesto otevřít**. (Nebo v Terminálu: `xattr -dr com.apple.quarantine "/Applications/Rezie Live.app"`.)
4. Povol kameru a mikrofon. Pro sdílení obrazovky povol aplikaci v **Soukromí a zabezpečení → Nahrávání obrazovky**.

## 🪟 Aplikace pro Windows (10 a 11, 64bit)
1. Na stejné stránce [Releases](https://github.com/antoninfeldek-bot/rezie-live/releases/latest) stáhni **Rezie-Live-windows-x64-setup.exe**.
2. Spusť instalátor. Když Windows napíše **„Systém Windows ochránil váš počítač“**, klikni na **Další informace → Přesto spustit** (aplikace zatím není podepsaná).
3. Při prvním spuštění může brána Windows Firewall chtít povolit síť – povol **soukromé sítě** (kvůli ovladači, čtečce a hostům).

Na Macu i Windows je FFmpeg už v aplikaci uvnitř – nic dalšího se neinstaluje.

### 🚀 Nativní vysílání (jen v aplikaci)
V záložce Vysílání vyber **🚀 Nativní vysílání**:
- obraz se kóduje **jen jednou na grafické kartě** (H.264) a stejný signál jde na **všechna místa najednou** (YouTube, Twitch, Facebook, vlastní RTMP/RTMPS i **SRT**),
- každé místo se **samo znovu připojí**, když vypadne – ostatní jedou dál,
- když internet nestíhá, **datový tok se sám sníží** a pak zase zvýší,
- **pojistná nahrávka** (MKV) se nahrává na disk zároveň se streamem – i když spadne internet,
- obraz je řízený zvukovými hodinami → **zvuk a obraz se nikdy nerozjedou**, i když je okno schované,
- u YouTube jde zapnout **záložní server** (backup ingest).

### ⚙ Nastavení (tlačítko ⚙ nahoře)
- **Obraz:** rozlišení plátna (720p, 1080p, 1440p, 4K, **na výšku 9:16 pro TikTok/Reels/Shorts**, čtverec, 4:3), výstupní rozlišení, **FPS 24/25/30/50/60**, výchozí rozlišení kamer.
- **Vysílání:** kodér (grafika / procesor), CBR/VBR, interval klíčových snímků, profil H.264, datový tok zvuku, nízké zpoždění.
- **Nahrávání:** kvalita programu i ISO, formát MP4/WebM, zvuk, automatické nahrávání při vysílání.
- **Zvuk:** 48 / 44,1 kHz, výstupní zařízení pro odposlech.
- **Obecné:** dotaz před spuštěním/ukončením vysílání, počítač během vysílání neusne.
- **Pokročilé:** **zpoždění vysílání** (např. 10 s), čekání mezi znovupřipojeními, náhled úsporně/plynule.

Po změně plátna nebo FPS se studio samo restartuje a vrstvy se přepočítají na nový formát.

### 📱 Dálkové ovládání a hosté (záložka Dálkově)
Zaškrtni **Povolit v místní síti** – objeví se tři QR kódy:
- **Ovladač** – naskenuj iPadem nebo mobilem (stejná Wi-Fi). Druhý člověk pak přepíná scény (CUT, AUTO, T-bar), pouští grafiku, míchá zvuk, ovládá scénář a čtečku.
- **Čtecí zařízení (iPad)** – naskenuj iPadem, který je ve čtecím zařízení. Ukáže text na celou obrazovku a posouvá ho přesně podle režie. Klepnutím se ukáže lišta: zrcadlení (podle režie / zapnuto / vypnuto), velikost písma, celá obrazovka. Obrazovka nezhasne.
- **Odkaz pro hosty** – host otevře odkaz v mobilu nebo počítači, povolí kameru a připojí se. V režii se objeví jako zdroj 👤. Vidí program, slyší všechny kromě sebe (mix-minus) a když je ve vysílání, svítí mu červeně „JSI VE VYSÍLÁNÍ“.

**🌍 Host odkudkoli (přes internet):** u odkazu pro hosty zaškrtni **Hosté i mimo Wi-Fi**. Za pár sekund se objeví nový QR kód a odkaz `https://…trycloudflare.com` – ten pošli hostovi (WhatsApp, e-mail…). Funguje odkudkoli, bez varování o certifikátu, zdarma a bez účtu (tunel Cloudflare je v aplikaci přibalený). Přes internet jde jen stránka hosta – ovladač a čtečka zůstávají jen ve tvé Wi-Fi. Adresa se mění při každém zapnutí. Kdyby se host z přísné sítě (škola, firma, mobilní data) nepřipojil, zapni TURN: na **dash.cloudflare.com → Realtime → TURN Server → Create** si zdarma vytvoř klíč a v „Pokročilé: TURN server“ vyplň **Turn Token ID** a **API Token**.

Při prvním otevření prohlížeč napíše, že spojení není soukromé (certifikát si aplikace vyrobila sama) – klikni **Podrobnosti → Přesto pokračovat**. Mac se může zeptat, jestli povolit příchozí spojení – dej **Povolit**.

### 🎙 Interkom (kameramani a pokyny pro hosta)
- **Kameramani:** v záložce 📱 Dálkově je QR kód **Kameramani (interkom)**. Kameraman ho otevře v mobilu, nasadí sluchátka, zadá jméno a vybere svou kameru. Mobil mu pak svítí jako **tally**: červená = jeho kamera je ve vysílání, zelená = je v náhledu (připrav se).
- **Mluvení:** tlačítko **🎙** nahoře otevře panel interkomu. **Drž** „Všem kameramanům“ nebo „Mluvit“ u konkrétního člověka. Ke všem kameramanům můžeš mluvit i držením klávesy **§** (nebo **`**). Hlas režie jde z **vlastního mikrofonu režie** (vybereš v panelu) a **nikdy nejde do vysílání**.
- **Odpovědi:** kameraman drží „Drž a mluv s režií“ (nebo zapne mikrofon trvale). Uslyšíš ho ve sluchátkách režie.
- **Pokyny:** z nabídky „💬 Pokyn…“ („Přibliž“, „Zaostři“, „Za 5 s jdeš do vysílání“…) nebo napiš vlastní. Kameramanovi se ukáže velkým písmem s pípnutím a vibrací a odpoví 👍 / ⏳ / ❌.
- **Host před vysíláním:** v panelu u hosta drž **„Mluvit s hostem“**. Uslyší tě jen on ve sluchátkách (program se mu na tu chvíli ztlumí). Divák nic neslyší. Pokyny („Za 10 s jsi ve vysílání“, „Dívej se do kamery“…) se mu ukážou na obrazovce.

### ⧉ Ovládací panely v samostatných oknech
Na druhý monitor si můžeš dát **čtečku**, **scénář**, **interkom**, **mix pult** a **stav vysílání**:
- Čtečka a Scénář: otevři záložku dole a klikni na **⧉** vpravo na liště záložek.
- Interkom: v panelu 🎙 tlačítko **⧉**.
- Mix pult a Stav: na stránce Zvuk nebo Stav tlačítko **⧉** vedle přepínače stránek.

Panel v okně má u názvu **↗**. Zavřením okna se vrátí zpátky. Zkratky (CUT, AUTO, § interkom) fungují i z okna, při psaní textu ne. Aplikace si okna pamatuje.

### 📊 Stav vysílání
Stránka **📊 Stav** nahoře (tečka u ní svítí 🟢 / 🟡 / 🔴) ukazuje na jednom místě, jestli všechno běží:
- **Vysílání:** každé místo zvlášť (živě / znovu se připojuje, tok dat, jak dlouho běží, počet výpadků), kodér, graf toku dat za poslední 2 minuty.
- **Internet:** tlačítko **Změřit rychlost internetu** (odezva, stahování, odesílání) a kolik tvoje nastavení potřebuje.
- **Hosté a kameramani:** odezva, ztráta paketů, tok dat, rozlišení a jestli jde spojení přímo, nebo přes TURN.
- **Počítač:** snímky za sekundu, zátěž, paměť, zvuk, nahrávání, chybějící zdroje.
- Nahoře velké hlášení: ✅ Vše běží v pořádku, nebo co přesně je špatně.

### 📡 NDI výstup a virtuální kamera
1. Nainstaluj zdarma **NDI Tools** (https://ndi.video/tools/) – obsahují i NDI Runtime.
2. V záložce **Vysílání** dole zaškrtni **Posílat program přes NDI**.
3. Program teď uvidí každý program s NDI ve stejné síti (OBS, vMix, NDI Studio Monitor, jiný Mac…).
4. **Virtuální kamera:** otevři z NDI Tools aplikaci **NDI Virtual Input** (na Windows **NDI Webcam Input**) a vyber v ní „Režie Live – Program“. Pak si v Zoomu, Teams, FaceTimu, Meetu… vyber kameru NDI.

Převod obrazu pro NDI dělá grafika, procesor se skoro nezatíží. (Vlastní virtuální kameru bez NDI by šlo udělat jen s placeným vývojářským účtem Apple.)

### 🎛 Karty pro HDMI vstup
Elgato, Blackmagic, Magewell, AVerMedia a další karty se přidávají jako kamera (u názvu mají 🎛). Aplikace zjistí, jaké formáty karta umí, a nabídne je (např. 1080p 50 / 59,94 / 60, 4K 30). U karty rovnou nabídne i **zvuk z HDMI**. Skutečný formát vidíš u zdroje.

### ⚡ Výkon
Aplikace kreslí jen tolikrát za sekundu, kolik má vysílání snímků (na 120Hz displeji až 4× méně práce), náhled kreslí zmenšeně, z kamer bere jen nové snímky a používá výkonnou grafiku. Když přesto nestíhá: ⚙ Nastavení → Pokročilé → Náhled „Úsporně“.

### ⏪ Replay (opakované záběry, zpomalovačky)
Záložka **⏪ Replay**: zaškrtni kamery, které se mají nahrávat do paměti (posledních 15 s – 2 min). Vyber kameru, délku (3–20 s) a rychlost (100 / 75 / 50 / 25 %) a klikni **REPLAY do vysílání**. V rohu svítí „⏪ REPLAY“ a po skončení se režie vrátí na předchozí scénu. **★ Značka** si uloží důležitý moment na později. Klávesy a Stream Deck: záložka Ovládání → „Replay do vysílání“, „Značka“.

### 📑 Titulky z tabulky (Google Sheets, CSV)
Záložka **Grafika** dole → **Data pro titulky** → vlož odkaz na Google tabulku (stačí sdílet „Kdokoli s odkazem“) nebo přidej soubor CSV. Do textu v editoru grafiky pak napiš `{Data1!B2}` (buňka), `{Data1!Jméno}` (sloupec Jméno v aktuálním řádku) nebo `{Data1!B@+1}` (další řádek). Řádky přepínáš ◀ ▶ (nebo klávesou). Data se samy obnovují.

### 🌐 Web a 💬 chat ve vysílání (jen v desktopové aplikaci)
Zdroje → **🌐 + Web / chat**: libovolná stránka, nebo **chat z YouTube / Twitche** (vložíš odkaz na své živé vysílání nebo název kanálu). Chat má průhledné pozadí a sám se dá do rohu.

### 📃 Playlist a 🗂 prezentace
**📃 + Playlist videí** – víc videí za sebou (opakovat, náhodně). **🗂 + Prezentace** – obrázky snímků (z PowerPointu/Keynote: Exportovat → Obrázky); další snímek **PageDown** nebo klikrem.

### 🔀 Zvukové sběrnice
Záložka **Zvuk** dole → **Sběrnice**: vlastní mix na jiný výstup (sluchátka moderátora, reproduktory v sále…). U každého kanálu nastavíš, kolik do sběrnice jde.

### 🎥 PTZ kamery
Záložka **🎥 PTZ**: přidej kameru (IP adresa, typ VISCA). Šipky drž = pohyb, zoom, autofokus, předvolby 1–9 (i na klávesy a Stream Deck).

### 2️⃣ Výstup 2
Tlačítko **2️⃣** nahoře otevře okno s jiným obrazem – jinou scénou, náhledem nebo jedním zdrojem (třeba na plátno v sále). Dvojklik = celá obrazovka.

### ⚙ Automatizace
Záložka **Ovládání** dole → **Automatizace**: „když skončí znělka → přepni na Kameru 1“, „v 19:59 → scéna Odpočet“, „když začne vysílání → logo“…

### 🛡 Spolehlivost
- Projekt se ukládá sám každých pár sekund, každou minutu se dělá záloha.
- Odpojená kamera nebo mikrofon se po zapojení **samy znovu připojí**.
- Ukazatel **● fps** nahoře ukazuje, jestli počítač stíhá (klikni pro podrobnosti).
- **V aplikaci pro Mac**: když okno spadne nebo zamrzne, vysílání **nepřestane** – poběží tabulka „Technické potíže“, režie se sama znovu otevře a program se vrátí do vysílání.

## 1. Jednorázová instalace
1. **Node.js** – stáhni z nodejs.org (verze LTS) a nainstaluj.
2. **FFmpeg** – potřeba jen pro vysílání:
   - Windows: v terminálu `winget install ffmpeg` (pak terminál zavři a otevři znovu)
   - Mac: `brew install ffmpeg`
   - Kontrola: `ffmpeg -version` musí něco vypsat.

## 2. Spuštění
- **Windows:** dvojklik na **start-windows.bat**
- **Mac:** dvojklik na **start-mac.command** (poprvé pravý klik → Otevřít)
- nebo v terminálu ve složce: `node server.js` a v Chrome otevři **http://localhost:8080**

Klikni **Spustit studio** a povol kameru a mikrofon.

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
Prolínačka, přes barvu, stíračka, najetí, vytlačení, zoom, kruh, rozmazání a **stinger** (vlastní animace – video s průhledností, např. WebM z After Effects, + bod střihu). Každý jde upravit a uložit. Vybraný přechod jede na **AUTO (Enter)** a **T-bar** (svislý jezdec uprostřed – táhni ručně; po dokončení zůstane nahoře a další přechod uděláš stažením dolů, jako v televizi).

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
- **▦ Multiview** = všechny kamery najednou + náhled + program + hodiny, stav vysílání a hlasitost.
- **📜 Okno čtečky** = text pro moderátora. Pro skleněnou čtečku zapni **Zrcadlit**.
- Režie běží dál, i když hlavní okno zakryješ nebo minimalizuješ (vysílání, nahrávání i okna Program a Multiview jedou dál).

### Zvuk
Záložka **Zvuk**: hlasitost každého mikrofonu, ztlumení (M), zpoždění (když zvuk předbíhá obraz), MASTER a odposlech do sluchátek.

## 4. Vysílání (záložka Vysílání)
Jsou dvě cesty – vybereš je nahoře v záložce:

### 📡 Přes server.js (RTMP) – nejspolehlivější, funguje všude
1. Spusť start-windows.bat / start-mac.command (potřebuje Node.js a FFmpeg).
2. Vyber platformu a vlož **klíč streamu**:
   - YouTube: YouTube Studio → Vytvořit → Spustit živé vysílání → Stream → Klíč streamu
   - Facebook: Živé video → Použít klíč streamu
   - Twitch: Ovládací panel tvůrce → Nastavení → Stream → Primární klíč streamu
   - Jiná síť: „Vlastní“ – zkopíruj adresu serveru i klíč.
3. **+ Přidat další místo** = vysílání na víc míst najednou (třeba YouTube + Facebook). Když jedno spadne, ostatní jedou dál.
4. **Kódování:** když máš grafickou kartu NVIDIA / Intel / AMD nebo Mac, vyber ji – ulehčí procesoru. Aplikace sama ukáže, co tvůj počítač umí (tlačítko „Otestovat spojení“).
5. **Rozlišení:** 1080p (4500–6000 kbps) nebo 720p (2500–4000 kbps) pro slabší internet. Na víc míst najednou potřebuješ součet.
6. **⦿ Spustit vysílání.** Ukazuje fps, datový tok a rychlost. Když spojení vypadne, sám se připojí znovu. Když píše „počítač nestíhá“, dej 720p nebo kódování na grafice.

### 🌐 Přímo z prohlížeče (WHIP) – bez instalace, i z online verze
- **Twitch:** vyber Twitch a vlož klíč streamu. (Twitch to zatím oficiálně nedokumentuje – funguje, ale může se změnit.)
- **Restream:** v Restreamu najdi WHIP (beta), zkopíruj adresu a token. Restream to pak rozešle na YouTube, Facebook i jinam.
- **Vlastní WHIP server** (MediaMTX, Cloudflare…): vlož jeho adresu.
- YouTube a Facebook WHIP zatím přímo nepřijímají – pro ně Restream nebo režim server.js.
- WebRTC se samo přizpůsobí, když internet zakolísá, a ukazuje ping a kvalitu.

⚠ Klíč streamu nikomu neukazuj. Aplikace si ho pamatuje jen když zaškrtneš „Pamatovat klíče v tomto počítači“.

## 5. Nahrávání
- **● Program** – nahraje to, co jde ven. **● Vše (ISO)** – program + každou kameru a mikrofon zvlášť, ve stejnou chvíli.
- **Doporučeno:** záložka Nahrávky → **📁 Vybrat složku pro nahrávky**. Pak se všechno zapisuje **průběžně rovnou na disk** – nic se nedrží v paměti, jde nahrávat hodiny a při pádu prohlížeče soubor zůstane. Po novém spuštění jen potvrdíš přístup ke složce.
- Bez vybrané složky se nahrávka drží v paměti a po zastavení se stáhne.

## 6. Když něco nejde
- **Kamera je černá** – jedna kamera jde většinou otevřít jen jednou. Zavři jiné programy, které ji používají (Zoom, OBS, Teams).
- **Nové okno se neotevře** – povol vyskakovací okna (ikona vpravo v adresním řádku).
- **Vysílání nejde** – běží server.js (start-windows.bat / start-mac.command)? V záložce Vysílání klikni „Otestovat spojení“. Stav a chyby vidíš v „Záznamu“ dole v záložce. Hláška o klíči = špatně zkopírovaný klíč streamu.
- **Projekt** se ukládá sám v prohlížeči. Zálohu uděláš tlačítkem 💾. Videa a obrazovku je po novém spuštění potřeba připojit znovu („Připojit znovu“).
