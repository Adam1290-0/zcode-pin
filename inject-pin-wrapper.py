#!/usr/bin/env python3
"""Inject the pin wrapper require into zcode.cjs (idempotent, binary-safe).
Usage: python inject-pin-wrapper.py [zcode.cjs path] [pin-wrapper.js path]
Defaults: H:/Zcode/resources/glm/zcode.cjs, <repo>/pin-wrapper.js
Anchor: after the route-override marker /*zro*/ so pin's fetch patch wraps OUTSIDE
route-override's (pin injects first, route-override rewrites headers after).
"""
import sys, shutil
from pathlib import Path

MARKER = b"/*zpin*/"
ANCHOR = b"/*zro*/"

def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("H:/Zcode/resources/glm/zcode.cjs")
    wrapper = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent / "pin-wrapper.js"
    if not target.exists():
        print(f"[ERROR] not found: {target}"); return 1
    if not wrapper.exists():
        print(f"[ERROR] wrapper missing: {wrapper}"); return 1
    wrapper_uri = str(wrapper.resolve().as_posix())
    require_line = b'try{require("' + wrapper_uri.encode() + b'")}catch(e){}/*zpin*/'
    data = target.read_bytes()

    if require_line in data:
        print("[OK] already injected (safe form), skip"); return 0
    if MARKER in data:
        print("[WARN] a /*zpin*/ injection with unknown form exists; abort to avoid stacking."); return 1

    idx = data.find(ANCHOR)
    if idx < 0 or idx > 500:
        print("[ERROR] route-override anchor /*zro*/ not found near head "
              "(install route-override first, or edit ANCHOR)"); return 1
    backup = Path(str(target) + ".pinbak")
    if backup.exists() and backup.stat().st_size != target.stat().st_size:
        shutil.copy2(target, backup)
        print("[i] zcode.cjs changed (app updated) -> backup refreshed")
    if not backup.exists():
        shutil.copy2(target, backup)
        print(f"[1/2] backup -> {backup.name}")
    insert_at = idx + len(ANCHOR)
    target.write_bytes(data[:insert_at] + require_line + data[insert_at:])
    print("[2/2] injected require after route-override marker")
    return 0

if __name__ == "__main__":
    sys.exit(main())