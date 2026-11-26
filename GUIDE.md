# 🎬 Live Director – guide (English)

The app is bilingual – switch **🌐 EN / 🌐 CZ** in the top bar (or on the start screen).

## 🍎 Mac app (recommended)
1. Open [Releases](https://github.com/antoninfeldek-bot/rezie-live/releases/latest) and download **Rezie-Live-mac-arm64.dmg** (Mac with M1/M2/M3/M4 chip) or **Rezie-Live-mac-x64.dmg** (older Intel Mac).
2. Open the DMG and drag **Rezie Live** into **Applications**.
3. On first start macOS says it doesn't know the app. Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. (Or in Terminal: `xattr -dr com.apple.quarantine "/Applications/Rezie Live.app"`.)
4. Allow camera and microphone. For screen sharing allow the app in **Privacy & Security → Screen Recording**.

FFmpeg is already inside the app – nothing else to install.

### 🚀 Native streaming (app only)
In the Streaming tab choose **🚀 Native streaming**:
- video is encoded **only once on the GPU** (H.264) and the same signal goes to **all destinations at once** (YouTube, Twitch, Facebook, custom RTMP/RTMPS and **SRT**),
- each destination **reconnects by itself** if it drops – the others keep going,
- if the internet is too slow, **the bitrate lowers itself** and later goes back up,
- a **safety recording** (MKV) is saved to disk while streaming – even if the internet fails,
- video is driven by the audio clock → **sound and picture never drift apart**, even when the window is hidden,
- for YouTube you can turn on the **backup server** (backup ingest).

## 1. Install once
1. **Node.js** – download the LTS version from nodejs.org.
2. **FFmpeg** – only needed for RTMP streaming:
   - Windows: `winget install ffmpeg` in a terminal (then reopen the terminal)
   - Mac: `brew install ffmpeg`
   - Check: `ffmpeg -version` must print something.

## 2. Start
- **Windows:** double-click **start-windows.bat**
- **Mac:** double-click **start-mac.command** (first time: right-click → Open)
- or in a terminal in the folder: `node server.js` and open **http://localhost:8080** in Chrome

Online version (no install, streaming via WHIP only): https://antoninfeldek-bot.github.io/rezie-live/

Click **Start studio** and allow camera and microphone access.

## 3. Four work pages
- **🎬 Director** – scenes, preview / program, transitions, T-bar and all tabs at the bottom.
- **✨ Graphics** – animated titles editor (like After Effects).
- **🎚 Audio** – mixer with effects.
- **🎨 Color** – grading, LUTs and scopes.

### Basics
- **Sources** tab: add cameras, microphones, videos (intros), images (logos), texts (titles), screen capture.
- **Scenes** (bottom left): each scene is one "setup" (e.g. Camera, Guest, Intro).
- **PREVIEW** (green) = where you prepare and edit. **PROGRAM** (red) = what goes out.
- **CUT** (space) = instant switch. **AUTO** (Enter) = selected transition. **T-bar** = drag for a manual transition (it stays at the top afterwards; the next transition is done by pulling it down, like in TV).
- In the preview you can drag layers and resize them by the corners.

### Chroma key
Select the camera layer → **Properties** → **Enable key** → click **🎯** and then the green background → move **Similarity** until the green disappears. Put a background layer (image, video or color) under the camera.

### Graphics and animation
- A graphic = layers (text, rectangle, image, ticker). Ready templates: name tag, logo, LIVE badge, news ticker, big title, countdown, clock.
- **Timeline:** green = entry (IN), then the graphic waits, red = exit (OUT). Move the IN/OUT markers on the ruler.
- **◆ = keyframe.** Move the playhead, change a value and click ◆. Drag keyframes with the mouse; each has an easing.
- **Quick animation:** select a layer → Entry / Exit → Apply.
- **Fields:** type e.g. `{name}` into a text and change it live in Director → **Graphics** tab. Special: `{time}`, `{hm}`, `{date}`, `{cd}` (countdown), `{elapsed}`.
- On air: **F1–F8** or the ON AIR button. Graphics go over all scenes.

### Transitions
Crossfade, dip to color, wipe, slide, push, zoom, iris, blur and **stinger** (your own animation – a video with transparency + cut point). Every transition can be edited and saved.

### Audio mixer
- Each channel has its own **effect chain**: Low cut, Noise reduction, Gate, EQ, Compressor, De-esser, Limiter, Delay, Mono, Gain. Reorder with arrows, bypass any effect.
- **Presets:** 🎙 Voice, 🌬 Voice in a noisy room, 🎵 Music – and your own.
- **Noise reduction:** stay quiet for 2 s and click “Learn noise”.
- **S (solo)** = listen to one channel in headphones. **GR** = gain reduction.
- The **MASTER** has a limiter at −1 dB so the stream never distorts. Loudness meter in **LUFS** (YouTube ≈ −14).

### Color
Lift / Gamma / Gain / Offset wheels, curves, exposure, temperature, tint, contrast with pivot, saturation, hue shift and **LUT (.cube)** with strength. Scopes: waveform, RGB parade, vectorscope, histogram. Before / after, copy & paste grade, apply to all cameras, grade gallery.

### Rundown
Show blocks with duration, scene, graphic, prompter text and notes. **N** = next block, **B** = previous. Shows the time left (red when over) and when the show will end.

### Controls
Keys (“Learn”), MIDI controllers (“Connect MIDI” → “Learn”), and Stream Deck / Companion via HTTP URLs (run server.js and enable “Allow control via server.js”).

## 4. Streaming (Streaming tab)
### 📡 Via server.js (RTMP) – most reliable
1. Run start-windows.bat / start-mac.command.
2. Choose a platform and paste the **stream key** (YouTube Studio → Create → Go live → Stream key; Facebook → Live video → Use stream key; Twitch → Creator dashboard → Settings → Stream).
3. **+ Add another destination** = stream to several places at once.
4. **Encoding:** choose your GPU (NVIDIA / Intel / AMD / Mac) to take load off the CPU.
5. **⦿ Start streaming.** It shows fps, bitrate and speed and reconnects automatically.

### 🌐 Directly from the browser (WHIP) – no install
Twitch (experimental), Restream (forwards to YouTube, Facebook…), or your own WHIP server.

⚠ Never show your stream key to anyone. It is only remembered if you tick “Remember keys on this computer”.

## 5. Recording
- **● Program** – records what goes out. **● All (ISO)** – program + every camera and mic separately.
- **Recommended:** Recordings tab → **📁 Choose a folder for recordings** – everything is written continuously to disk.
- The Recordings tab shows which format your browser records (best: MP4 · H.264 + AAC).

## 6. Troubleshooting
- **Black camera** – close other apps using it (Zoom, OBS, Teams).
- **New window doesn’t open** – allow pop-ups for the page.
- **Something looks old after an update** – reload with Ctrl+Shift+R (Mac: Cmd+Shift+R).
- **Streaming doesn’t work** – is server.js running? Click “Test connection” and check the Log in the Streaming tab.
