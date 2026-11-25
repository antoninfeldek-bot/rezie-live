# 🎬 Režie Live – návod

## Co je ve složce
- **rezie.html** – samotná režie (běží v prohlížeči Chrome / Edge)
- **server.js** – malý pomocný program, který posílá vysílání na YouTube / Twitch / Facebook
- **NAVOD.md** – tenhle návod

Všechny tři soubory dej do **jedné složky**.

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

(Režie jde otevřít i dvojklikem na rezie.html, ale vysílání funguje jen se spuštěným server.js.)

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
- **● Nahrávat program** – nahraje to, co jde ven.
- **● Nahrávat vše (ISO)** – program + každou kameru a mikrofon zvlášť, ve stejnou chvíli. Potom to můžeš znovu sestříhat.
- Soubory se po zastavení samy stáhnou (Chrome se může zeptat na „stahování více souborů“ – povol).
- Nahrávka se drží v paměti počítače, dokud ji nezastavíš. Na hodně dlouhé nahrávání (víc než ~1 hodina) potřebuješ dost RAM.

## 6. Když něco nejde
- **Kamera je černá** – jedna kamera jde většinou otevřít jen jednou. Zavři jiné programy, které ji používají (Zoom, OBS, Teams).
- **Nové okno se neotevře** – povol vyskakovací okna (ikona vpravo v adresním řádku).
- **Vysílání nejde** – běží `node server.js`? V záložce Vysílání klikni „Otestovat spojení“.
- **Projekt** se ukládá sám v prohlížeči. Zálohu uděláš tlačítkem 💾. Videa a obrazovku je po novém spuštění potřeba připojit znovu („Připojit znovu“).
