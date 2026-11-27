# 🎬 Live Director – guide (English)

The app is bilingual – switch **🌐 EN / 🌐 CZ** in the top bar (or on the start screen). Czech guide: NAVOD.md.

## What's in the folder
- **index.html** + **css/**, **js/** and **fonts/** – the studio itself (runs in Chrome / Edge and in the app)
- **remote.html**, **guest.html**, **prompter.html**, **crew.html** – pages for the phone remote, guests, the teleprompter and camera operators
- **server.js** – helper for RTMP streaming, remote control, guests and Stream Deck
- **electron/** – the Mac and Windows app (native streaming, network inputs, NDI, updates)
- **GUIDE.md** (this guide) and **NAVOD.md** (Czech), **TESTING.en.md** + **testing/** – test sheet
- **tests/smoke.py** – automated test, **docs/NEXT_VERSION.md** – plan for the next version

Keep everything together in **one folder** (as it is on GitHub).

## 🍎 Mac app (recommended)
1. Open [Releases](https://github.com/feldek-apps/rezie-live/releases/latest) and download **Rezie-Live-mac-arm64.dmg** (Mac with M1/M2/M3/M4 chip) or **Rezie-Live-mac-x64.dmg** (older Intel Mac).
2. Open the DMG and drag **Rezie Live** into **Applications**.
3. On first start macOS says it doesn't know the app. Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. (Or in Terminal: `xattr -dr com.apple.quarantine "/Applications/Rezie Live.app"`.)
4. Allow camera and microphone. For screen sharing allow the app in **Privacy & Security → Screen Recording**.

## 🪟 Windows app (10 and 11, 64-bit)
1. On the same [Releases](https://github.com/feldek-apps/rezie-live/releases/latest) page download **Rezie-Live-windows-x64-setup.exe**.
2. Run the installer. If Windows says **“Windows protected your PC”**, click **More info → Run anyway** (the app isn't signed yet).
3. On first start Windows Firewall may ask about network access – allow **private networks** (for the remote, prompter and guests).

On Mac and Windows FFmpeg is already inside the app – nothing else to install.

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
4. **Virtual camera:** open **NDI Virtual Input** (on Windows **NDI Webcam Input**) from NDI Tools and pick “Režie Live – Program”. Then choose the NDI camera in Zoom, Teams, FaceTime, Meet…

The conversion for NDI runs on the GPU, so the CPU barely notices. (A built-in virtual camera without NDI needs a paid Apple developer account.)

### 🎛 HDMI capture cards
Elgato, Blackmagic, Magewell, AVerMedia and other cards are added as a camera (marked 🎛). The app reads which formats the card supports and offers them (e.g. 1080p 50 / 59.94 / 60, 4K 30). For a card it also offers the **HDMI audio**. The real format is shown on the source.

### 🌐 360° cameras (Insta360, Ricoh Theta…) and custom resolution
- When adding a camera, **Format** offers **⭐ Device maximum**, **2:1 · 360°** formats (1920×960, 2880×1440, 3840×1920, 5760×2880) and **✏️ Custom resolution…** (width, height, FPS).
- The picture comes without cropping or rescaling. If the camera can't do the chosen resolution, the app tells you what it really sends.
- Full 360° on air: ⚙ Settings → Video → canvas **3840×1920 (360° 2:1)**, then turn on **360°** for the live stream on YouTube. Put the Insta360 in USB webcam mode, 360° view.

### 🌐 360° shots (virtual cameras from a 360° camera)
Turn one 360° camera (Insta360 X4…) into several cameras. Sources → **🌐 + 360° shot** (or **Make 360° shots** on a 360° source) → pick the source, mode and how many shots. Each extra shot gets its own scene.
- **Modes:** 🎥 Shot (virtual PTZ camera), 🪐 Tiny planet, 🌅 Panorama, 🌐 Full 360° picture (recentred).
- **Control:** in the source card **drag** = turn, **wheel** = zoom, or the Pan / Tilt / Field of view sliders.
- **Presets 1–6:** Shift+click a number = save, click = move there smoothly. On keys and Stream Deck in the Control tab (group 360°).

### ⚡ Performance
The app draws only as many times per second as the stream has frames (up to 4× less work on a 120 Hz display), draws the preview smaller, takes only new frames from cameras and uses the high-performance GPU. If it still can’t keep up: ⚙ Settings → Advanced → Preview “Economy”.

### ⏪ Replay 2.0 (instant replay, slow motion, multiple angles)
**⏪ Replay** tab:
- **What is recorded:** tick cameras, guests, NDI/SRT inputs, videos – or the whole **🎬 Program**. Keeps the last 15 s – 2 min at 25–60 fps (60 = smoother slow motion). Encoded on the GPU into memory, nothing on disk.
- **Angles:** buttons with source names. A click during playback switches the angle and continues **at the same moment**. **All angles** = the same moment from every source in a row.
- **Speed:** 100 / 75 / 50 / 25 % (also while playing). **Smooth slow motion** blends neighbouring frames.
- **IN / OUT:** find the moment with the slider (the frame shows in the ⏪ Replay source – put the Replay scene in preview), click **[ IN**, move, **OUT ]**. **REPLAY on air** then plays exactly that part. Without IN/OUT it plays the last X seconds.
- **Transition into replay and back:** pick a stinger or other transition – used automatically at start and end.
- **★ Mark** saves a moment; each mark has **Play** and **IN/OUT**.
- Control (keys, MIDI, Stream Deck, macros): Replay on air, All angles, Next angle, IN, OUT, Pause, Speed 25–100 %, **slider as a MIDI fader** (jog).

### 🎬 Macros (Control → Macros)
A macro = several actions in a row with one press. **+ New macro** (or **✨ From template**), then add steps:
- **▶ Action** – anything from the Control list (scene to preview / on air, CUT, AUTO, graphic IN / OUT, mute / unmute a mic, layout, replay, PTZ, recording…),
- **⏱ Wait (s)**, **⏳ Wait for transition end**, **🎞 Wait for video end**, **✋ Wait for next press** (the macro pauses and continues on the next trigger – “step by step”).
Reorder with ↑ ↓, ▶ on a step tests it. **When it's running and you trigger it again:** restarts / stops / nothing. **Loop** = repeat. The running step is green.
Trigger: **▶ Run**, key / MIDI / Stream Deck (action list below, group “Macros”), the **mobile remote** (macro buttons under transitions) or **automation** (“when X happens → macro”).

### ▦ Scene layout (SuperSource)
**▦ Layout** button in the layers panel. Pick a template – **automatic by count**, 1 full, 2 side by side (tall / 16:9), 3 (big + 2 small / three columns), 2×2 and 3×2 grid, picture in picture, big left + strip right. Set margin, gap, corner radius, border (width, color), shadow and animation length.
It arranges the scene's video layers (cameras, guests, videos, NDI…) in layer order. Graphics, texts, images and colors stay as they are. Each box is **filled without distortion** (edges cropped) – move the crop in the layer under **▦ Border and crop**, where you can also turn corners, border and shadow on for a single layer.
Switching layouts **animates smoothly**, even when the scene is on air. The “Layout … – scene on air / in preview” actions work on keys, Stream Deck and in macros.

### 📱 Phone as a camera
**Remote** tab → enable local network → **📱 Phone as a camera** card → scan the QR with a phone on the same Wi-Fi → **Allow camera** → choose quality (720p – 4K) and fps (25 / 30 / 60) → **Join**. A **📱 name** source appears in Sources.
The phone only sends (no return video) in H.264 with low latency – saves battery, network and the director's GPU. **Zoom** and **torch** work on the phone (if supported), the screen stays on. Phone audio is unprocessed (clean ambient sound); choose **No microphone** to turn it off. Tip: tripod, charger, 5 GHz Wi-Fi.

### 🔌 Program audio to Zoom / Teams, virtual camera
- **Audio:** install a free virtual audio device (Mac: **BlackHole**, Windows: **VB-Cable**), restart the app, then **Audio → Buses → 🔌 Program audio to Zoom / Teams**. In Zoom choose BlackHole / CABLE Output as the microphone.
- **Video:** NDI output (Streaming → NDI) + free **NDI Virtual Input** (NDI Tools) = an “NDI Video” camera in Zoom, Teams and Meet.

### 📡 Network inputs – audio that stays in sync
Audio from NDI / SRT / RTMP inputs adjusts itself to the director's clock (gently, ±0.5 %, inaudible), so it doesn't drift from the picture even after hours. The input card shows **🔊 buffer (ms) and correction (%)**. If audio is constantly offset from video, set the channel **delay** in the mixer.

### 🔤 Computer fonts in graphics
In graphics (and the text source), at the bottom of the **Font** list: **🖥 Load fonts from this computer…** – loads all installed fonts (once, then remembered). **✎ Type a font name…** = manual entry. A font marked **✱** isn't on this computer (project from another computer) – install it, otherwise a fallback is used.

### 🎨 New 2.0 look
A dark, calm look with a single selection color (blue). **Red** lights up only for things that are really **on air / recording** (Program, Stream, REC – with a pulse), **green** = preview / ready, **amber** = warnings and muted channels. **Inter** font (bundled, works offline), numbers and times in **JetBrains Mono** so they don't jump.

### 📑 Titles from a sheet (Google Sheets, CSV)
**Graphics** tab at the bottom → **Data for titles** → paste a Google Sheet link (shared “Anyone with the link”) or add a CSV file. In the graphics editor type `{Data1!B2}` (cell), `{Data1!Name}` (column Name in the current row) or `{Data1!B@+1}` (next row). Switch rows with ◀ ▶ (or a key). Data refreshes itself.

### 🌐 Web and 💬 chat on air (desktop app only)
Sources → **🌐 + Web / chat**: any page, or **YouTube / Twitch chat** (paste your live stream link or channel name). The chat has a transparent background and goes to a corner by itself.

### 📃 Playlist and 🗂 slides
**📃 + Video playlist** – several videos in a row (loop, shuffle). **🗂 + Slides** – slide images (from PowerPoint/Keynote: Export → Images); next slide with **PageDown** or a clicker.

### 🔀 Audio buses
**Audio** tab at the bottom → **Buses**: a separate mix to another output (host headphones, hall speakers…). Set how much of each channel goes to the bus.

### 🎥 PTZ cameras
**🎥 PTZ** tab: add a camera (IP address, VISCA type). Hold the arrows to move, zoom, autofocus, presets 1–9 (also on keys and Stream Deck).

### 2️⃣ Outputs 2–4
The **2️⃣ Outputs** button at the top opens a menu with **Output 2 / 3 / 4**. Each output is a window with a different picture – the program, the preview, another scene or one source (e.g. for the projector in the hall). Double-click = full screen. Outputs can also be switched as their own program – see **🎛 Side programs** below.

### ⚙ Automation
**Control** tab at the bottom → **Automation**: “when the intro ends → switch to Camera 1”, “at 19:59 → Countdown scene”, “when streaming starts → logo”…

### 📡 Video over the network: NDI, SRT, RTMP, IP cameras
**Sources → 📡 + SRT / RTMP / IP camera** or **🔗 + NDI input** (desktop app only).
- **SRT (best for phones and the internet):** you'll see an address `srt://IP:9000`. On a phone install the free **Larix Broadcaster** → Connections → New → paste the address, Mode: Caller. From OBS: Settings → Stream → Custom.
- **RTMP:** server `rtmp://IP:1935/live` plus the key the app shows (OBS, drones, RTMP cameras).
- **IP camera / address:** `rtsp://…`, `srt://…`, `https://…/stream.m3u8`.
- **NDI:** pick from the list of sources on the network. Needs the free **NDI Tools**.
Audio from the input appears in the mixer as a normal channel.

### 🏆 Live: score, chat and polls
**🏆 Live** tab: score and game clock (template **Score (sports)**), viewer chat from Twitch (channel name) or YouTube (free API key) – click a message to show it on air (template **Chat message**), and polls where viewers vote by typing 1–4 (template **Poll**).

### ✂ Cut list, chapters and ISO
Every cut is logged while recording or streaming. In **Recordings** download an **EDL** (Premiere, DaVinci), **YouTube chapters** or CSV. Key **M** = marker. ISO now also records guests and network inputs separately.

### 🎛 Side programs (Outputs 2–4 switched like the main program)
Above CUT there is a **PGM · 2 · 3 · 4** selector. **PGM** = main program (what goes to stream and recording). Click **2**, **3** or **4** and the director now controls that output's **side program**:
- the PREVIEW and PROGRAM monitors show the output's preview and program (title “· Output 2”, blue frame – it isn't the stream),
- click a scene = output preview, double-click = straight to its program, **CUT**, **AUTO** (with the selected transition as a fade), **T-bar**, keys 1–9 / Shift+1–9, Enter, Space and MIDI work just like for the main program,
- **the main stream and recording keep running unchanged** – the side program is for the hall, stage, projector, a second screen…
- **🪟** opens / closes the output window, **↗🖥** sends it full screen to a chosen monitor or projector (in the app; in the browser drag the window and double-click), **✨** adds graphics (titles).
- Back to the main program: **PGM**.
Macros, automation, rundown, Stream Deck and the phone remote still control the main program. Outputs have their own actions (Control → group “Side programs”): *Output 2: CUT / AUTO / scene N to preview / scene N straight to program / window*, and *Control Output 2* (switches the director). A side program is picture only (audio stays on the main mix or buses).

### 📱 Remote roles
In **📱 Remote** choose what a remote may control: **everything**, **only graphics, titles, score and rundown**, or **only audio**. Each role has its own QR code.

### 🆕 Updates
The app finds new versions by itself and offers **Update** (Windows installs it, Mac opens the new version to drag into Applications). Manually: ⚙ Settings → General.

### ⊞ Layout
The **⊞** button at the top: **Two tabs side by side** (e.g. Sources + Graphics at once) and **Default panel sizes**. Resize panels by dragging the edges between them (double-click = default) on the Director and Graphics pages. Sources, Graphics, Live, Replay, PTZ, Control, Streaming, Prompter and Rundown can open in a separate window with **⧉**.

### 🛡 Reliability
- The project saves itself every few seconds, with a backup every minute.
- An unplugged camera or microphone **reconnects by itself**.
- The **● fps** badge at the top shows if the computer keeps up (click for details).
- **In the app (Mac and Windows) with 🚀 Native streaming**: if the window crashes or freezes, the stream **does not stop** – a “Technical difficulties” slate runs, the app reopens itself and the program goes back on air.

## 1. Install once (only to run from source)
The Mac / Windows app and the online version don't need this – Node.js and FFmpeg are only needed for `node server.js`.
1. **Node.js** – download the LTS version from nodejs.org.
2. **FFmpeg** – only needed for RTMP streaming:
   - Windows: `winget install ffmpeg` in a terminal (then reopen the terminal)
   - Mac: `brew install ffmpeg`
   - Check: `ffmpeg -version` must print something.

## 2. Start
- **Windows:** double-click **start-windows.bat**
- **Mac:** double-click **start-mac.command** (first time: right-click → Open)
- or in a terminal in the folder: `node server.js` and open **http://localhost:8080** in Chrome

Online version (no install): https://feldek-apps.github.io/rezie-live/ – streams directly via WHIP, or via RTMP when `node server.js` runs on the computer.

Click **Start studio** and allow camera and microphone access.

## 3. Five work pages
- **🎬 Director** – scenes, preview / program, transitions, T-bar and all tabs at the bottom.
- **✨ Graphics** – animated titles editor (like After Effects).
- **🎚 Audio** – mixer with effects.
- **🎨 Color** – grading, LUTs and scopes.
- **📊 Status** – whether everything is running (stream, internet, guests, computer).

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
