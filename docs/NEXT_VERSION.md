# Předávka pro další verzi Režie Live (z chatu 27. 11. 2026)

Repo je přesunuté do **feldek-apps/rezie-live** (dřív antoninfeldek-bot/rezie-live).
Pravidlo autora: **nevydávat novou verzi kvůli každé drobnosti** – opravy sbírat a vydat najednou.
Build (GitHub Actions) se spouští pushem do `main` → vznikne release `v2.0.<run>`. Větev `next` build nespouští.

## 1. Hotové a otestované, čeká na vydání (větev `next`)
- Obraz zamrzal, když byla karta Chromu na pozadí (webová verze): `js/core.js` texFor – když nechodí rVFC
  (karta na pozadí), nahrává se každý snímek; `js/replay.js` totéž pro replay.

## 2. Po přesunu repa upravit
- `electron/update.js` – adresa pro kontrolu aktualizací (owner/repo → feldek-apps/rezie-live).
- `README.md`, `NAVOD.md`, `GUIDE.md`, `TESTING.md`, `TESTING.en.md`, `package.json` – odkazy na repo a Releases.
- Online verze: `https://feldek-apps.github.io/rezie-live/` (v repu Settings → Pages: deploy z `main`).
- Popis repa „About“ (Description, Website, Topics) – nastaví autor ručně, z Claude prostředí to nejde.

## 3. Nové funkce do další verze (přání autora – profi a modulárně)
- Víc šablon grafiky jako designy + přednastavená umístění podle typu (např. skóre dole uprostřed).
- Skóre pro víc sportů: americký fotbal, hokej, basketbal (+ současné), možnost přidat vlastní políčka.
- Závody: napojení na data z časomíry – časy, ztráty (+ sekundy), pořadí.
- Celý chat na obrazovce (ne jen jedna zpráva).
- Host bez obrazu / zvuku: místo černé plochy vlnky reagující na zvuk (modulární design).
- Šablony projektů: start = nový projekt / ze šablony; systémová nabídka OS „File“: Nový projekt, Otevřít projekt, Uložit…

## 4. Stabilita a konektivita na úroveň vMixu (doporučené pořadí 2 → 1 → 4 → 6)
1. Oddělit „motor“ (skládání obrazu, zvuk, stream) od UI do samostatného skrytého procesu Electronu.
2. SRT/RTMP/RTSP vstupy bez překódování: ffmpeg `-c:v copy -bsf:v h264_mp4toannexb -f h264`, dělení Annex-B na snímky
   v `electron/inputs.js`, posílat zakódované (~10 KB/snímek), dekódovat WebCodecs (hardware) v `js/netin.js`; fallback raw.
3. Jedny hodiny pro obraz i zvuk (zvuk vstupů už má korekci driftu).
4. Vlastní TURN pro hosty + ICE restart bez výpadku zdroje (guest-client restartIce, server přepošle, režie odpoví bez zavření pc).
5. SRTLA (bonding Wi-Fi + data) pro mobilní vstupy.
6. Dlouhé zátěžové testy, hlášení pádů (Sentry), zamknutá verze Electronu, seznam doporučeného HW.
7. Podepsání aplikace (Apple 99 $/rok, Windows cert) – až s placenou verzí. 8. DeckLink SDI (nativní modul).

## 5. Poučení z oprav
- Testovat i to, co je OPRAVDU vidět (screenshot), ne jen pixely canvasu – tak se schovala chyba s černými monitory.
- `.screen canvas{display:block}` přebíjí atribut `hidden` – překryvy raději odstraňovat z DOM.
- Windows (ANGLE/Direct3D): WebGL kontext bez `desynchronized`, s `preserveDrawingBuffer:true`, jinak prosakoval
  zmenšený náhled do programu a nešly přechody (opraveno ve v2.0.20 – ověřit u autora).
- Automatický test: `tests/smoke.py` (popis uvnitř).
