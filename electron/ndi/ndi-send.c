/* Režie Live – NDI výstup programu.
   Malý pomocný program: ze stdin čte snímky (NV12) a zvuk (float, prokládané stereo) a posílá je přes NDI®.
   Knihovnu NDI nebalíme (licence) – načte se za běhu z nainstalovaného NDI Runtime / NDI Tools.
   Protokol na stdin: 1 bajt typ ('V' obraz, 'A' zvuk, 'Q' konec) + 4 bajty délka (LE) + data.
   Na stdout píše stav: "OK", "CONN n", "ERR …".
   NDI® is a registered trademark of Vizrt NDI AB. https://ndi.video */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <dlfcn.h>
#include <time.h>

typedef void *send_inst;
typedef struct { const char *p_ndi_name; const char *p_groups; bool clock_video; bool clock_audio; } send_create_t;
typedef struct {
  int xres, yres; int FourCC; int frame_rate_N, frame_rate_D; float picture_aspect_ratio; int frame_format_type;
  int64_t timecode; uint8_t *p_data; int line_stride_in_bytes; const char *p_metadata; int64_t timestamp;
} video_frame_v2_t;
typedef struct {
  int sample_rate, no_channels, no_samples; int64_t timecode; float *p_data; int channel_stride_in_bytes; const char *p_metadata; int64_t timestamp;
} audio_frame_v2_t;

#define FOURCC(a, b, c, d) ((int)((uint32_t)(a) | ((uint32_t)(b) << 8) | ((uint32_t)(c) << 16) | ((uint32_t)(d) << 24)))
#define TC_SYNTH INT64_MAX

static bool (*p_init)(void);
static void (*p_destroy)(void);
static send_inst (*p_send_create)(const send_create_t *);
static void (*p_send_destroy)(send_inst);
static void (*p_send_video)(send_inst, const video_frame_v2_t *);
static void (*p_send_audio)(send_inst, const audio_frame_v2_t *);
static int (*p_send_conns)(send_inst, uint32_t);

static int read_all(void *buf, size_t n) {
  size_t got = 0; uint8_t *b = buf;
  while (got < n) { size_t r = fread(b + got, 1, n - got, stdin); if (r == 0) return 0; got += r; }
  return 1;
}

int main(int argc, char **argv) {
  if (argc < 7) { fprintf(stdout, "ERR args\n"); return 2; }
  const char *name = argv[1]; int W = atoi(argv[2]), H = atoi(argv[3]), fpsN = atoi(argv[4]), fpsD = atoi(argv[5]), rate = atoi(argv[6]);
  setvbuf(stdout, NULL, _IOLBF, 0);
  /* najít knihovnu NDI */
  const char *env = getenv("NDI_RUNTIME_DIR_V6"); char envp[1024] = {0};
  if (env) snprintf(envp, sizeof envp, "%s/libndi.dylib", env);
  const char *paths[] = { getenv("NDI_LIB"), env ? envp : NULL,
    "/usr/local/lib/libndi.dylib", "/opt/homebrew/lib/libndi.dylib", "/Library/NDI SDK for Apple/lib/macOS/libndi.dylib",
    "/Applications/NDI Video Monitor.app/Contents/Frameworks/libndi_advanced.dylib",
    "/Applications/NDI Studio Monitor.app/Contents/Frameworks/libndi_advanced.dylib",
    "/Applications/NDI Virtual Input.app/Contents/Frameworks/libndi_advanced.dylib",
    "libndi.so.6", "libndi.so", NULL };
  void *lib = NULL; const char *used = NULL;
  for (int i = 0; i < (int)(sizeof paths / sizeof *paths); i++) { if (!paths[i]) continue; lib = dlopen(paths[i], RTLD_NOW | RTLD_LOCAL); if (lib) { used = paths[i]; break; } }
  if (!lib) { fprintf(stdout, "ERR nolib\n"); return 3; }
  p_init = dlsym(lib, "NDIlib_initialize"); p_destroy = dlsym(lib, "NDIlib_destroy");
  p_send_create = dlsym(lib, "NDIlib_send_create"); p_send_destroy = dlsym(lib, "NDIlib_send_destroy");
  p_send_video = dlsym(lib, "NDIlib_send_send_video_v2"); p_send_audio = dlsym(lib, "NDIlib_send_send_audio_v2");
  p_send_conns = dlsym(lib, "NDIlib_send_get_no_connections");
  if (!p_init || !p_send_create || !p_send_video || !p_send_audio) { fprintf(stdout, "ERR symbols\n"); return 4; }
  if (!p_init()) { fprintf(stdout, "ERR cpu\n"); return 5; }
  send_create_t cs = { name, NULL, false, false };
  send_inst snd = p_send_create(&cs);
  if (!snd) { fprintf(stdout, "ERR create\n"); return 6; }
  fprintf(stdout, "OK %s\n", used);

  size_t vsize = (size_t)W * H * 3 / 2;
  uint8_t *bufs[2] = { malloc(vsize), malloc(vsize) }; int cur = 0;   /* dva buffery: NDI si snímek drží do dalšího volání */
  float *abuf = NULL, *planar = NULL; size_t acap = 0;
  int lastConn = -1; time_t lastCheck = 0;
  for (;;) {
    uint8_t hdr[5]; if (!read_all(hdr, 5)) break;
    uint32_t len = hdr[1] | (hdr[2] << 8) | (hdr[3] << 16) | ((uint32_t)hdr[4] << 24);
    if (hdr[0] == 'Q') break;
    if (hdr[0] == 'V') {
      if (len != vsize) { /* nečekaná velikost – přeskočit */ uint8_t tmp[65536]; while (len) { size_t n = len > sizeof tmp ? sizeof tmp : len; if (!read_all(tmp, n)) goto done; len -= n; } continue; }
      if (!read_all(bufs[cur], vsize)) break;
      video_frame_v2_t f = { W, H, FOURCC('N', 'V', '1', '2'), fpsN, fpsD, (float)W / (float)H, 1, TC_SYNTH, bufs[cur], W, NULL, 0 };
      p_send_video(snd, &f); cur ^= 1;
    } else if (hdr[0] == 'A') {
      if (len > acap) { acap = len; abuf = realloc(abuf, acap); planar = realloc(planar, acap); }
      if (!read_all(abuf, len)) break;
      int frames = (int)(len / 8);   /* stereo float */
      for (int i = 0; i < frames; i++) { planar[i] = abuf[i * 2]; planar[frames + i] = abuf[i * 2 + 1]; }
      audio_frame_v2_t a = { rate, 2, frames, TC_SYNTH, planar, frames * 4, NULL, 0 };
      p_send_audio(snd, &a);
    } else {
      uint8_t tmp[4096]; while (len) { size_t n = len > sizeof tmp ? sizeof tmp : len; if (!read_all(tmp, n)) goto done; len -= n; }
    }
    time_t now = time(NULL);
    if (p_send_conns && now != lastCheck) { lastCheck = now; int c = p_send_conns(snd, 0); if (c != lastConn) { lastConn = c; fprintf(stdout, "CONN %d\n", c); } }
  }
done:
  p_send_destroy(snd); if (p_destroy) p_destroy();
  return 0;
}
