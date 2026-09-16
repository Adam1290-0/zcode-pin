#!/usr/bin/env python3
"""Remove the pin wrapper require line from zcode.cjs (surgical, idempotent).
Usage: python uninject-pin-wrapper.py [zcode.cjs path] [pin-wrapper.js path]
Deletes the exact require_line bytes (including the /*zpin*/ marker) instead of
restoring the whole file, so other plugins injected after pin survive.
"""
import sys
from pathlib import Path

def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("H:/Zcode/resources/glm/zcode.cjs")
    wrapper = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent / "pin-wrapper.js"
    if not target.exists():
        print(f"[ERROR] not found: {target}"); return 1
    wrapper_uri = str(wrapper.resolve().as_posix())
    require_line = b'try{require("' + wrapper_uri.encode() + b'")}catch(e){}/*zpin*/'
    data = target.read_bytes()
    if require_line not in data:
        print("[OK] pin require line not present, nothing to remove"); return 0
    target.write_bytes(data.replace(require_line, b""))
    print("[OK] pin require line removed from zcode.cjs")
    return 0

if __name__ == "__main__":
    sys.exit(main())