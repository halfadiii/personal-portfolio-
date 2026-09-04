"""
Subsets the three self-hosted faces to the characters this site actually sets.

The Google and Fontshare downloads carry the full Latin range plus every OpenType
feature. This page is one language and a fixed body of copy, so most of that is
dead weight on the critical path (§8's LCP budget on a throttled connection).

Both variable axes are preserved — the width axis is load-bearing for the hero
(§4.2), so `--drop-tables` must not touch fvar/gvar/HVAR.

    python scripts/subset-fonts.py

Re-run after adding copy that uses a character outside `CHARSET`; the script
prints any character it had to drop.
"""

from __future__ import annotations

import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
# Untouched downloads live in src/fonts/source/; the subset output is what
# next/font actually loads from src/fonts/.
SRC = ROOT / "src" / "fonts" / "source"
OUT = ROOT / "src" / "fonts"

# ASCII, plus the punctuation and symbols the copy and the UI actually use.
CHARSET = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + " "  # no-break space
    + "°±·"  # degree, plus-minus, middle dot
    + "–—"  # en dash, em dash
    + "‘’“”"  # curly quotes
    + "…"  # ellipsis
    + "→←↑↓"  # arrows
    + "−"  # minus sign
    + "éè"  # resume / resume accents
    + "⌘"  # place of interest sign (the command key)
    + "✕×"  # multiplication / close marks
)

FACES = {
    "Archivo-Variable.woff2": "Archivo",
    "Switzer-Variable.woff2": "Switzer",
    "JetBrainsMono-Variable.woff2": "JetBrains Mono",
}


def subset_face(filename: str, label: str) -> None:
    source = SRC / filename
    target = OUT / filename
    if not source.exists():
        sys.exit(f"missing {source}")

    font = TTFont(source, fontNumber=0)
    available = set()
    for table in font["cmap"].tables:
        available.update(table.cmap.keys())

    wanted = {ord(ch) for ch in CHARSET}
    missing = sorted(wanted - available)
    if missing:
        print(
            f"  {label}: not in the source face — "
            + " ".join(f"U+{cp:04X}" for cp in missing)
        )

    options = subset.Options()
    options.layout_features = ["kern", "liga", "calt", "tnum", "ccmp", "locl"]
    options.name_IDs = ["*"]
    options.name_legacy = False
    options.notdef_outline = True
    options.recalc_bounds = True
    # Keep the variable axes intact: the hero animates the width axis.
    options.retain_gids = False
    options.desubroutinize = False
    options.flavor = "woff2"

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=wanted & available)
    subsetter.subset(font)

    before = source.stat().st_size
    font.flavor = "woff2"
    font.save(target)
    after = target.stat().st_size
    print(
        f"  {label}: {before // 1024} kB -> {after // 1024} kB "
        f"({100 - round(after / before * 100)}% smaller)"
    )
    font.close()


print("subsetting fonts to the site charset")
for filename, label in FACES.items():
    subset_face(filename, label)
