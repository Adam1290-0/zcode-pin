#!/usr/bin/env python3
"""Inject the pin UI script into an extracted ZCode asar tree (idempotent marker replace).
Usage: python inject-pin-ui.py <extracted_out_dir> <ui_pin.js> [token_file]
The token file lives in ~/.zcode/plugins/pin/ (NOT the git repo). The token is baked
into the IIFE closure by literal replacement of '__ZPIN_TOKEN__' — never a window global.
"""
import sys, secrets, os
from pathlib import Path

MARKER = '<script id="zcode-pin-ui">'
TOKEN_PLACEHOLDER = "'__ZPIN_TOKEN__'"

def read_raw(p: Path) -> str:
    return p.read_text(encoding="utf-8")

def write_raw(p: Path, s: str) -> None:
    p.write_text(s, encoding="utf-8")

def load_token(token_file: Path) -> str:
    if token_file.exists():
        t = token_file.read_text(encoding="utf-8").strip()
        if t:
            return t
    t = secrets.token_hex(32)
    if "</" in t:  # safety: must not close the script tag it is injected into
        t = secrets.token_hex(32)  # retry once (astronomically unlikely to hit twice)
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(t, encoding="utf-8")
    print(f"[i] generated auth token -> {token_file}")
    return t

def main() -> int:
    if len(sys.argv) not in (3, 4):
        print("[ERROR] usage: inject-pin-ui.py <extracted_out_dir> <ui_js> [token_file]")
        return 1
    out_dir = Path(sys.argv[1])
    ui_js = Path(sys.argv[2])
    token_file = Path(sys.argv[3]) if len(sys.argv) == 4 else \
        Path(os.path.expandvars(r"%USERPROFILE%\.zcode\plugins\pin\auth-token"))
    html_path = out_dir / "renderer" / "index.html"
    if not out_dir.exists() or not ui_js.exists():
        print(f"[ERROR] missing {out_dir} or {ui_js}")
        return 1
    if not html_path.exists():
        print("[ERROR] renderer/index.html not found")
        return 1
    token = load_token(token_file)
    html = read_raw(html_path)
    js = read_raw(ui_js)
    if TOKEN_PLACEHOLDER not in js:
        print("[ERROR] ui_pin.js missing token placeholder " + TOKEN_PLACEHOLDER)
        return 1
    js = js.replace(TOKEN_PLACEHOLDER, repr(token))  # literal replace inside IIFE only
    tag = MARKER + "\n" + js + "\n</script>"
    idx = html.find(MARKER)
    if idx >= 0:
        end = html.find("</script>", idx)
        if end < 0:
            print("[ERROR] marker without closing script tag, abort"); return 1
        html = html[:idx] + tag + html[end + len("</script>"):]
        print("[OK] replaced existing zcode-pin-ui block")
    else:
        body_end = html.rfind("</body>")
        if body_end < 0:
            print("[ERROR] </body> not found"); return 1
        html = html[:body_end] + tag + "\n" + html[body_end:]
        print("[OK] inserted zcode-pin-ui block before </body>")
    write_raw(html_path, html)
    return 0

if __name__ == "__main__":
    sys.exit(main())