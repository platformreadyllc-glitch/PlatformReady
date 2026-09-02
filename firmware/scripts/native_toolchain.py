"""
Points the [env:native] test build (see firmware/platformio.ini and
firmware/test/README.md) at the host C/C++ compiler PlatformIO's own package
manager installed for it, since PlatformIO's "native" platform expects
gcc/g++ to already be on PATH and Windows doesn't ship one.

One-time setup this depends on:
    pio pkg install -g -t platformio/toolchain-gccmingw32
"""

Import("env")

import os

mingw_bin = os.path.join(
    os.path.expanduser("~"), ".platformio", "packages", "toolchain-gccmingw32", "bin"
)

if os.path.isdir(mingw_bin) and mingw_bin not in os.environ.get("PATH", ""):
    os.environ["PATH"] = mingw_bin + os.pathsep + os.environ.get("PATH", "")

# build_flags in platformio.ini doesn't reliably reach the link step on this
# platform — set LINKFLAGS directly so the test binary statically links the
# MinGW runtime (libgcc/libstdc++) instead of needing their DLLs on PATH at
# run time.
env.Append(LINKFLAGS=["-static"])
