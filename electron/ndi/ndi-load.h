/* Režie Live – společné načtení knihovny NDI (z NDI Runtime / NDI Tools v počítači) */
#ifndef RZ_NDI_LOAD_H
#define RZ_NDI_LOAD_H
#include <stdio.h>
#include <stdlib.h>
#ifdef _WIN32
#include <windows.h>
#include <io.h>
#include <fcntl.h>
#define dlsym(l, n) ((void *)GetProcAddress((HMODULE)(l), n))
#else
#include <dlfcn.h>
#endif

static void *ndi_load(const char **usedOut) {
  void *lib = NULL; const char *used = NULL;
#ifdef _WIN32
  /* stdin/stdout jako binární (jinak Windows mění \n a 0x1A ukončí čtení) */
  _setmode(_fileno(stdin), _O_BINARY); _setmode(_fileno(stdout), _O_BINARY);
  static char envp[3][1024];
  const char *envs[3] = { "NDI_RUNTIME_DIR_V6", "NDI_RUNTIME_DIR_V5", "NDI_RUNTIME_DIR_V4" };
  for (int i = 0; i < 3; i++) { const char *e = getenv(envs[i]); if (e) snprintf(envp[i], sizeof envp[i], "%s\\Processing.NDI.Lib.x64.dll", e); }
  const char *paths[] = { getenv("NDI_LIB"), envp[0][0] ? envp[0] : NULL, envp[1][0] ? envp[1] : NULL, envp[2][0] ? envp[2] : NULL,
    "C:\\Program Files\\NDI\\NDI 6 Runtime\\v6\\Processing.NDI.Lib.x64.dll",
    "C:\\Program Files\\NDI\\NDI 5 Runtime\\v5\\Processing.NDI.Lib.x64.dll",
    "C:\\Program Files\\NDI\\NDI 6 Tools\\Runtime\\Processing.NDI.Lib.x64.dll",
    "C:\\Program Files\\NDI\\NDI 5 Tools\\Runtime\\Processing.NDI.Lib.x64.dll",
    "Processing.NDI.Lib.x64.dll" };
  for (int i = 0; i < (int)(sizeof paths / sizeof *paths); i++) { if (!paths[i]) continue; lib = (void *)LoadLibraryA(paths[i]); if (lib) { used = paths[i]; break; } }
#else
  const char *env = getenv("NDI_RUNTIME_DIR_V6"); char envp[1024] = {0};
  if (env) snprintf(envp, sizeof envp, "%s/libndi.dylib", env);
  const char *paths[] = { getenv("NDI_LIB"), env ? envp : NULL,
    "/usr/local/lib/libndi.dylib", "/opt/homebrew/lib/libndi.dylib", "/Library/NDI SDK for Apple/lib/macOS/libndi.dylib",
    "/Applications/NDI Video Monitor.app/Contents/Frameworks/libndi_advanced.dylib",
    "/Applications/NDI Studio Monitor.app/Contents/Frameworks/libndi_advanced.dylib",
    "/Applications/NDI Virtual Input.app/Contents/Frameworks/libndi_advanced.dylib",
    "libndi.so.6", "libndi.so", NULL };
  for (int i = 0; i < (int)(sizeof paths / sizeof *paths); i++) { if (!paths[i]) continue; lib = dlopen(paths[i], RTLD_NOW | RTLD_LOCAL); if (lib) { used = paths[i]; break; } }
#endif
  if (usedOut) *usedOut = used;
  return lib;
}
#endif
