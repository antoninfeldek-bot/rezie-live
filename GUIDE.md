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

### ⚙ Settings (⚙ button at the top)
- **Video:** canvas resolution (720p, 1080p, 1440p, 4K, **vertical 9:16 for TikTok/Reels/Shorts**, square, 4:3), output resolution, **FPS 24/25/30/50/60**, default camera resolution.
- **Stream:** encoder (GPU / CPU), CBR/VBR, keyframe interval, H.264 profile, audio bitrate, low latency.
- **Recording:** program and ISO quality, MP4/WebM, audio, auto-record while streaming.
- **Audio:** 48 / 44.1 kHz, monitoring output device.
- **General:** confirm before starting/stopping the stream, keep the computer awake.
- **Advanced:** **stream delay** (e.g. 10 s), wait between reconnects, preview economy/smooth.

After changing the canvas or FPS the studio restarts itself and layers are recalculated for the new format.

### 📱 Remote control and guests (Remote tab)
Tick **Allow on the local network** – three QR codes appear:
- **Remote** – scan with an iPad or phone (same Wi-Fi). A second person can switch scenes (CUT, AUTO, T-bar), run graphics, mix audio, control the rundown and prompter.
- **Teleprompter (iPad)** – scan with the iPad in the teleprompter rig. It shows the text full screen and scrolls exactly with the app. Tap for a bar: mirror (like app / on / off), font size, full screen. The screen stays on.
- **Guest link** – the guest opens it on a phone or computer, allows the camera and joins. They appear as a 👤 source. They see the program, hear everyone except themselves (mix-minus) and see a red “YOU ARE LIVE” when on air.

**🌍 Guest from anywhere (over the internet):** at the guest link tick **Guests outside your Wi-Fi**. In a few seconds a new QR code and a `https://…trycloudflare.com` link appear – send it to the guest. Works from anywhere, no certificate warning, free and no account (the Cloudflare tunnel is bundled in the app). Only the guest page goes over the internet – the remote and prompter stay on your Wi-Fi. The address changes each time. If a guest on a strict network (school, company, mobile data) can’t connect, turn on TURN: at **dash.cloudflare.com → Realtime → TURN Server → Create** make a free key and fill the **Turn Token ID** and **API Token** in “Advanced: TURN server”.

On first open the browser says the connection isn’t private (the app made its own certificate) – click **Details → Proceed anyway**. The Mac may ask to allow incoming connections – choose **Allow**.

### 🎙 Intercom (crew and guest instructions)
- **Camera operators:** in the 📱 Remote tab there is a **Camera operators (intercom)** QR code. The operator opens it on a phone, puts on headphones, enters a name and picks their camera. The phone then works as a **tally**: red = their camera is on air, green = in preview (get ready).
- **Talking:** the **🎙** button at the top opens the intercom panel. **Hold** “All camera operators” or “Talk” next to a person. You can also hold the **§** (or **`**) key to talk to all crew. The director’s voice uses a **separate director mic** (choose it in the panel) and **never goes on air**.
- **Replies:** the operator holds “Hold to talk to the director” (or turns the mic always on). You hear them in the director’s headphones.
- **Instructions:** pick from “💬 Instruction…” (“Zoom in”, “Focus”, “On air in 5 s”…) or type your own. The operator sees it in big letters with a beep and vibration and replies 👍 / ⏳ / ❌.
- **Guest before going live:** in the panel hold **“Talk to guest”** next to the guest. Only they hear you in their headphones (their program audio is lowered). Viewers hear nothing. Instructions (“You are live in 10 s”, “Look into the camera”…) appear on their screen.

### ⧉ Control panels in separate windows
You can put the **prompter**, **rundown**, **intercom**, **mixer** and **stream status** on a second monitor:
- Prompter and Rundown: open the tab at the bottom and click **⧉** at the right of the tab bar.
- Intercom: the **⧉** button in the 🎙 panel.
- Mixer and Status: on the Audio or Status page, the **⧉** button next to the page switcher.

A panel in a window has **↗** next to its name. Close the window to bring it back. Shortcuts (CUT, AUTO, § intercom) work from the window, but not while typing. The app remembers the windows.

### 📊 Stream status
The **📊 Status** page at the top (its dot lights 🟢 / 🟡 / 🔴) shows in one place whether everything runs:
- **Streaming:** each destination (live / reconnecting, data rate, uptime, number of drops), the encoder, a data-rate graph for the last 2 minutes.
- **Internet:** a **Measure internet speed** button (ping, download, upload) and how much your settings need.
- **Guests and crew:** ping, packet loss, data rate, resolution and whether the connection is direct or via TURN.
- **Computer:** frames per second, load, memory, audio, recording, missing sources.
- A big banner at the top: ✅ Everything is running fine, or what exactly is wrong.

### 📡 NDI output and virtual camera
1. Install the free **NDI Tools** (https://ndi.video/tools/) – they include the NDI Runtime.
2. In the **Streaming** tab tick **Send the program over NDI**.
3. Any NDI app on the same network now sees the program (OBS, vMix, NDI Studio Monitor, another Mac…).
4. **Virtual camera:** open **NDI Virtual Input** from NDI Tools and pick “Režie Live – Program”. Then choose the NDI camera in Zoom, Teams, FaceTime, Meet…

The conversion for NDI runs on the GPU, so the CPU barely notices. (A built-in virtual camera without NDI needs a paid Apple developer account.)

### 🎛 HDMI capture cards
Elgato, Blackmagic, Magewell, AVerMedia and other cards are added as a camera (marked 🎛). The app reads which formats the card supports and offers them (e.g. 1080p 50 / 59.94 / 60, 4K 30). For a card it also offers the **HDMI audio**. The real format is shown on the source.

### ⚡ Performance
The app draws only as many times per second as the stream has frames (up to 4× less work on a 120 Hz display), draws the preview smaller, takes only new frames from cameras and uses the high-performance GPU. If it still can’t keep up: ⚙ Settings → Advanced → Preview “Economy”.

### ⏪ Replay (instant replay, slow motion)
**⏪ Replay** tab: tick the cameras to record into memory (last 15 s – 2 min). Pick a camera, length (3–20 s) and speed (100 / 75 / 50 / 25 %) and click **REPLAY to program**. A “⏪ REPLAY” bug shows and when it ends the app goes back to the previous scene. **★ Mark** saves a moment for later. Keys and Stream Deck: Control tab → “Replay to program”, “Mark”.

### 📑 Titles from a sheet (Google Sheets, CSV)
**Graphics** tab at the bottom → **Data for titles** → paste a Google Sheet link (shared “Anyone with the link”) or add a CSV file. In the graphics editor type `{Data1!B2}` (cell), `{Data1!Name}` (column Name in the current row) or `{Data1!B@+1}` (next row). Switch rows with ◀ ▶ (or a key). Data refreshes itself.

### 🌐 Web and 💬 chat on air (Mac app only)
Sources → **🌐 + Web / chat**: any page, or **YouTube / Twitch chat** (paste your live stream link or channel name). The chat has a transparent background and goes to a corner by itself.

### 📃 Playlist and 🗂 slides
**📃 + Video playlist** – several videos in a row (loop, shuffle). **🗂 + Slides** – slide images (from PowerPoint/Keynote: Export → Images); next slide with **PageDown** or a clicker.

### 🔀 Audio buses
**Audio** tab at the bottom → **Buses**: a separate mix to another output (host headphones, hall speakers…). Set how much of each channel goes to the bus.

### 🎥 PTZ cameras
**🎥 PTZ** tab: add a camera (IP address, VISCA type). Hold the arrows to move, zoom, autofocus, presets 1–9 (also on keys and Stream Deck).

### 2️⃣ Output 2
The **2️⃣** button at the top opens a window with a different picture – another scene, the preview or one source (e.g. for the projector in the hall). Double-click = full screen.

### ⚙ Automation
**Control** tab at the bottom → **Automation**: “when the intro ends → switch to Camera 1”, “at 19:59 → Countdown scene”, “when streaming starts → logo”…

### 🛡 Reliability
- The project saves itself every few seconds, with a backup every minute.
- An unplugged camera or microphone **reconnects by itself**.
- The **● fps** badge at the top shows if the computer keeps up (click for details).
- **In the Mac app**: if the window crashes or freezes, the stream **does not stop** – a “Technical difficulties” slate runs, the app reopens itself and the program goes back on air.

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
