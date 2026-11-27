/* Režie Live – NDI vstup (příjem obrazu a zvuku z jiného počítače / kamery / OBS / vMixu).
   Knihovnu NDI nebalíme (licence) – načte se za běhu z nainstalovaného NDI Runtime / NDI Tools.
   Použití:  ndi-recv --find           → na stderr řádky "SRC <název>" (asi 3 s), pak konec
             ndi-recv "<název>" high|low
   Na stdout (binárně): 'V' + délka(4) + šířka(4) + výška(4) + formát(1: 0 = I420, 1 = BGRA) + data
                        'A' + délka(4) + vzorkování(4) + data (float, prokládané stereo)
   Na stderr (text): "OK", "CONN", "LOST", "ERR …".
   NDI® is a registered trademark of Vizrt NDI AB. https://ndi.video */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include "ndi-load.h"
#include <time.h>

typedef struct { const char *p_ndi_name; const char *p_url_address; } source_t;
typedef struct { bool show_local_sources; const char *p_groups; const char *p_extra_ips; } find_create_t;
typedef struct { source_t source_to_connect_to; int color_format; int bandwidth; bool allow_video_fields; const char *p_ndi_recv_name; } recv_create_v3_t;
typedef struct {
  int xres, yres; int FourCC; int frame_rate_N, frame_rate_D; float picture_aspect_ratio; int frame_format_type;
  int64_t timecode; uint8_t *p_data; int line_stride_in_bytes; const char *p_metadata; int64_t timestamp;
} video_frame_v2_t;
typedef struct {
  int sample_rate, no_channels, no_samples; int64_t timecode; float *p_data; int channel_stride_in_bytes; const char *p_metadata; int64_t timestamp;
} audio_frame_v2_t;
typedef struct { int length; int64_t timecode; char *p_data; } metadata_frame_t;

#define FOURCC(a, b, c, d) ((int)((uint32_t)(a) | ((uint32_t)(b) << 8) | ((uint32_t)(c) << 16) | ((uint32_t)(d) << 24)))
enum { FT_NONE = 0, FT_VIDEO = 1, FT_AUDIO = 2, FT_META = 3, FT_ERROR = 4, FT_STATUS = 100 };

static bool (*p_init)(void);
static void (*p_destroy)(void);
static void *(*p_find_create)(const find_create_t *);
static bool (*p_find_wait)(void *, uint32_t);
static const source_t *(*p_find_get)(void *, uint32_t *);
static void (*p_find_destroy)(void *);
static void *(*p_recv_create)(const recv_create_v3_t *);
static void (*p_recv_destroy)(void *);
static int (*p_recv_capture)(void *, video_frame_v2_t *, audio_frame_v2_t *, metadata_frame_t *, uint32_t);
static void (*p_free_video)(void *, const video_frame_v2_t *);
static void (*p_free_audio)(void *, const audio_frame_v2_t *);
static int (*p_recv_conns)(void *);

static void put32(uint8_t *b, uint32_t v) { b[0] = v; b[1] = v >> 8; b[2] = v >> 16; b[3] = v >> 24; }
static int out(const void *b, size_t n) { return fwrite(b, 1, n, stdout) == n; }

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "ERR args\n"); return 2; }
  setvbuf(stderr, NULL, _IONBF, 0);
  const char *used = NULL; void *lib = ndi_load(&used);
  if (!lib) { fprintf(stderr, "ERR nolib\n"); return 3; }
  p_init = dlsym(lib, "NDIlib_initialize"); p_destroy = dlsym(lib, "NDIlib_destroy");
  p_find_create = dlsym(lib, "NDIlib_find_create_v2"); p_find_wait = dlsym(lib, "NDIlib_find_wait_for_sources");
  p_find_get = dlsym(lib, "NDIlib_find_get_current_sources"); p_find_destroy = dlsym(lib, "NDIlib_find_destroy");
  p_recv_create = dlsym(lib, "NDIlib_recv_create_v3"); p_recv_destroy = dlsym(lib, "NDIlib_recv_destroy");
  p_recv_capture = dlsym(lib, "NDIlib_recv_capture_v2"); p_free_video = dlsym(lib, "NDIlib_recv_free_video_v2");
  p_free_audio = dlsym(lib, "NDIlib_recv_free_audio_v2"); p_recv_conns = dlsym(lib, "NDIlib_recv_get_no_connections");
  if (!p_init || !p_find_create || !p_find_get || !p_recv_create || !p_recv_capture || !p_free_video || !p_free_audio) { fprintf(stderr, "ERR symbols\n"); return 4; }
  if (!p_init()) { fprintf(stderr, "ERR cpu\n"); return 5; }

  /* --- hledání zdrojů v síti --- */
  find_create_t fc = { true, NULL, NULL };
  void *fnd = p_find_create(&fc);
  if (!fnd) { fprintf(stderr, "ERR find\n"); return 6; }
  if (!strcmp(argv[1], "--find")) {
    for (int i = 0; i < 6; i++) if (p_find_wait) p_find_wait(fnd, 500);
    uint32_t n = 0; const source_t *src = p_find_get(fnd, &n);
    for (uint32_t i = 0; i < n; i++) fprintf(stderr, "SRC %s\n", src[i].p_ndi_name ? src[i].p_ndi_name : "");
    fprintf(stderr, "END\n");
    if (p_find_destroy) p_find_destroy(fnd);
    if (p_destroy) p_destroy();
    return 0;
  }
  const char *want = argv[1]; int low = argc > 2 && !strcmp(argv[2], "low");
  source_t found = { NULL, NULL };
  for (int tries = 0; !found.p_ndi_name; tries++) {   /* počkat, až se zdroj objeví v síti */
    if (p_find_wait) p_find_wait(fnd, 1000);
    uint32_t n = 0; const source_t *src = p_find_get(fnd, &n);
    for (uint32_t i = 0; i < n; i++) if (src[i].p_ndi_name && !strcmp(src[i].p_ndi_name, want)) { found.p_ndi_name = strdup(src[i].p_ndi_name); found.p_url_address = src[i].p_url_address ? strdup(src[i].p_url_address) : NULL; }
    if (!found.p_ndi_name && tries % 5 == 0) fprintf(stderr, "WAIT\n");
  }
  recv_create_v3_t rc = { found, 1 /* UYVY_BGRA */, low ? 0 : 100, false, "Režie Live" };
  void *rcv = p_recv_create(&rc);
  if (!rcv) { fprintf(stderr, "ERR recv\n"); return 7; }
  fprintf(stderr, "OK %s\n", used);

  uint8_t *buf = NULL; size_t cap = 0; uint8_t *abuf = NULL; size_t acap = 0;
  time_t lastData = time(NULL); int lost = 0;
  for (;;) {
    video_frame_v2_t v; audio_frame_v2_t a; memset(&v, 0, sizeof v); memset(&a, 0, sizeof a);
    int t = p_recv_capture(rcv, &v, &a, NULL, 1000);
    if (t == FT_VIDEO) {
      int w = v.xres, h = v.yres, fmt; size_t sz;
      if (v.FourCC == FOURCC('U', 'Y', 'V', 'Y')) { fmt = 0; w &= ~1; h &= ~1; sz = (size_t)w * h * 3 / 2; }
      else { fmt = 1; sz = (size_t)w * h * 4; }
      if (sz + 17 > cap) { cap = sz + 17; buf = realloc(buf, cap); }
      uint8_t *d = buf + 17;
      if (fmt == 0) {   /* UYVY → I420 */
        uint8_t *Y = d, *U = d + w * h, *V = U + (w / 2) * (h / 2);
        for (int y = 0; y < h; y++) {
          const uint8_t *s = v.p_data + (size_t)y * v.line_stride_in_bytes; uint8_t *yy = Y + (size_t)y * w;
          for (int x = 0; x < w; x += 2) { yy[x] = s[x * 2 + 1]; yy[x + 1] = s[x * 2 + 3]; }
          if (!(y & 1)) { uint8_t *uu = U + (size_t)(y / 2) * (w / 2), *vv = V + (size_t)(y / 2) * (w / 2); for (int x = 0; x < w; x += 2) { uu[x / 2] = s[x * 2]; vv[x / 2] = s[x * 2 + 2]; } }
        }
      } else {
        for (int y = 0; y < h; y++) memcpy(d + (size_t)y * w * 4, v.p_data + (size_t)y * v.line_stride_in_bytes, (size_t)w * 4);
      }
      p_free_video(rcv, &v);
      buf[0] = 'V'; put32(buf + 1, (uint32_t)(sz + 12)); put32(buf + 5, w); put32(buf + 9, h); buf[13] = 0; buf[14] = 0; buf[15] = 0; buf[16] = (uint8_t)fmt;
      /* hlavička: typ(1) délka(4) šířka(4) výška(4) 3× rezerva formát(1) */
      if (!out(buf, sz + 17)) break;
      fflush(stdout);
      lastData = time(NULL); if (lost) { lost = 0; fprintf(stderr, "CONN\n"); }
    } else if (t == FT_AUDIO) {
      int n = a.no_samples, ch = a.no_channels; size_t sz = (size_t)n * 2 * sizeof(float);
      if (sz + 12 > acap) { acap = sz + 12; abuf = realloc(abuf, acap); }
      uint8_t *hb = (uint8_t *)abuf; float *dst = (float *)(hb + 12);
      for (int i = 0; i < n; i++) {
        const float *L = (const float *)((const uint8_t *)a.p_data);
        float l = ch > 0 ? L[i] : 0, r = ch > 1 ? ((const float *)((const uint8_t *)a.p_data + a.channel_stride_in_bytes))[i] : l;
        dst[i * 2] = l; dst[i * 2 + 1] = r;
      }
      p_free_audio(rcv, &a);
      hb[0] = 'A'; put32(hb + 1, (uint32_t)(sz + 7)); put32(hb + 5, (uint32_t)a.sample_rate); hb[9] = hb[10] = hb[11] = 0;
      /* hlavička: typ(1) délka(4) vzorkování(4) 3× rezerva */
      if (!out(hb, sz + 12)) break;
      fflush(stdout);
      lastData = time(NULL);
    } else if (t == FT_ERROR) { fprintf(stderr, "ERR conn\n"); break; }
    if (!lost && time(NULL) - lastData > 3) { lost = 1; fprintf(stderr, "LOST\n"); }
  }
  p_recv_destroy(rcv); if (p_find_destroy) p_find_destroy(fnd); if (p_destroy) p_destroy();
  return 0;
}
