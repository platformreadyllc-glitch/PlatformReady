#include "version_compare.h"
#include <cstdlib>
#include <cstring>

static void parseVersion(const char* v, int& major, int& minor, int& patch) {
  major = minor = patch = 0;
  if (!v) return;

  major = atoi(v);
  const char* dot1 = strchr(v, '.');
  if (!dot1) return;

  minor = atoi(dot1 + 1);
  const char* dot2 = strchr(dot1 + 1, '.');
  if (!dot2) return;

  patch = atoi(dot2 + 1);
}

bool otaIsNewer(const char* remote, const char* local) {
  int rMajor, rMinor, rPatch, lMajor, lMinor, lPatch;
  parseVersion(remote, rMajor, rMinor, rPatch);
  parseVersion(local, lMajor, lMinor, lPatch);

  if (rMajor != lMajor) return rMajor > lMajor;
  if (rMinor != lMinor) return rMinor > lMinor;
  return rPatch > lPatch;
}
