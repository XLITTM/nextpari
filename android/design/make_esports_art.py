"""Esports tiles are original photographic art stored as drawable-nodpi WebP.

Do not regenerate the geometric crosshair/chevron placeholders.
Photographic sources (owner-supplied CS2/Dota 2, original generated LoL/Valorant)
are converted to 720x1008 WebP in app/src/main/res/drawable-nodpi/.
"""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1] / "app" / "src" / "main" / "res" / "drawable-nodpi"
REQUIRED = ("esports_cs2.webp", "esports_dota2.webp", "esports_lol.webp", "esports_valorant.webp")


def main() -> int:
    missing = [name for name in REQUIRED if not (ROOT / name).exists()]
    if missing:
        print("missing esports tiles:", ", ".join(missing), file=sys.stderr)
        return 1
    print("esports photographic tiles present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
