#!/usr/bin/env python3
"""Remove the zcode-pin-ui script block from an extracted renderer/index.html (idempotent).
Usage: python uninject-pin-ui.py <extracted_out_dir>
"""
import sys
from pathlib import Path

MARKER = '<script id="zcode-pin-ui">'

def main() -> int:
    if len(sys.argv) != 2:
        print("[ERROR] usage: uninject-pin-ui.py <extracted_out_dir>")
        return 1
    out_dir = Path(sys.argv[1])
    html_path = out_dir / "renderer" / "index.html"
    if not html_path.exists():
        print("[ERROR] renderer/index.html not found")
        return 1
    html = html_path.read_text(encoding="utf-8")
    idx = html.find(MARKER)
    if idx < 0:
        print("[OK] zcode-pin-ui block not present, nothing to remove")
        return 0
    end = html.find("</script>", idx)
    if end < 0:
        print("[ERROR] marker without closing script tag, abort")
        return 1
    html = html[:idx] + html[end + len("</script>"):]
    html_path.write_text(html, encoding="utf-8")
    print("[OK] zcode-pin-ui block removed")
    return 0

if __name__ == "__main__":
    sys.exit(main())