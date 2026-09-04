"""
Turns the EagleEyes production output into the JSON the print-inspection demo
replays.

Everything the page shows about *what the system decided* comes from here, and
all of it is the real thing:

  * `data/results/visualizer_results.csv` — one row per *frame* from a run of the
    production folder-watcher over the EXT705 set: the verdict, the de-duplicated
    big-block count, and which of the four gates passed.

    A frame is one camera image, and one camera image is a bunch of tickets:
    they are printed seven across the width of the web and three deep, so a
    single bitmap holds twenty-one of them and twenty-one Q-blocks. That is
    what `count_rules.big_expected` is counting, and why it is 21 (or 14, on
    the short two-row layout) rather than 1.
  * `config/rules.json` — the thresholds themselves, and the `gate_ext705` block,
    which carries the timings from the run that produced them.

Ground truth comes from the filenames: the camera writes `..._CAM1_OK.bmp` or
`..._CAM1_NG.bmp`, so every row can be scored against what the frame actually
was. That is what makes the confusion matrix on the page a measurement rather
than a claim.

The replay sequence is shuffled with a fixed seed. In capture order the entire
good set comes first, because it was photographed on different days from the
defective set, and a demo that opens with two hundred consecutive passes tells
a viewer nothing about an inspection system. The proportions and the verdicts
are untouched.

One honest distinction the page repeats: `rules.json` notes the thresholds were
"derived from GOOD images only". The 2,123 defective frames were therefore
never used to fit anything, and the recall on them is out of sample. The good
frames are not — the thresholds were built from that population, so their pass
rate is an in-sample figure and is labelled as one.

    python scripts/build-print-inspection.py

Writes:
    src/content/data/print-inspection.json
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import pathlib
import re
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = (
    ROOT.parent
    / "project"
    / "EagleEyes_PROD_Solution_backup"
    / "EagleEyes_PROD"
)
RESULTS = SOURCE / "data" / "results" / "visualizer_results.csv"
RULES = SOURCE / "config" / "rules.json"
OUT = ROOT / "src" / "content" / "data" / "print-inspection.json"

# The four gates, in the order the engine applies them. A ticket is OK only if
# all four pass; the count gate short-circuits the rest when it fails.
GATES = [
    {
        "id": "count",
        "column": 5,
        "label": "Count",
        "question": "Are all the blocks there?",
    },
    {
        "id": "visibility",
        "column": 6,
        "label": "Visibility",
        "question": "Is each one crisp enough to be sure of?",
    },
    {
        "id": "density",
        "column": 7,
        "label": "Density",
        "question": "Is there enough ink in it?",
    },
    {
        "id": "position",
        "column": 8,
        "label": "Position",
        "question": "Is it in the right place relative to its neighbours?",
    },
]

#: How many frames the demo streams. Enough for the failure mix to show
#: through without shipping the whole run to the browser.
REPLAY = 600


def stamp_of(name: str) -> dt.datetime | None:
    """`251107_225922_0000094530_CAM1_OK.bmp` → when the camera took it."""
    match = re.match(r"(\d{6})_(\d{6})_", name)
    if not match:
        return None
    return dt.datetime.strptime(match.group(1) + match.group(2), "%y%m%d%H%M%S")


def serial_of(name: str) -> str:
    match = re.search(r"_(\d{10})_", name)
    return match.group(1).lstrip("0") if match else "?"


def main() -> None:
    if not RESULTS.exists():
        raise SystemExit(f"results CSV not found at {RESULTS}")

    rows = list(csv.reader(RESULTS.open(encoding="utf-8")))
    rules = json.loads(RULES.read_text(encoding="utf-8"))

    # ---- score every row against what the ticket actually was --------------
    matrix = Counter()
    gate_pass = Counter()
    failures = Counter()
    big_counts = Counter()

    frames = []
    for row in rows:
        name, status, big = row[1], row[2], int(row[3])
        truth = "OK" if name.endswith("_OK.bmp") else "NG"
        matrix[(truth, status)] += 1
        big_counts[big] += 1

        checks = [row[gate["column"]] == "1" for gate in GATES]
        for gate, ok in zip(GATES, checks):
            if ok:
                gate_pass[gate["id"]] += 1

        listed = row[9] if len(row) > 9 else ""
        for reason in filter(None, listed.split(";")):
            failures[reason] += 1

        frames.append(
            {
                "serial": serial_of(name),
                "at": stamp_of(name),
                "truth": truth,
                "status": status,
                "big": big,
                "checks": checks,
            }
        )

    frames.sort(key=lambda t: (t["at"] or dt.datetime.min, t["serial"]))

    # ---- what the line was actually running at ----------------------------
    per_second = Counter(t["at"] for t in frames if t["at"])
    ordered_rate = sorted(per_second.values())
    median_rate = ordered_rate[len(ordered_rate) // 2] if ordered_rate else 0

    # ---- timings, from the gate run that produced the thresholds ----------
    gate = rules.get("gate_ext705", {})
    profiling = gate.get("profiling", {})
    images = int(gate.get("ok_total", 0)) + int(gate.get("ng_total", 0))
    detect_ms = (profiling.get("detections_primary", 0) / images * 1000) if images else 0
    rules_ms = (profiling.get("evaluate_loop", 0) / images * 1000) if images else 0

    # ---- the sample the page streams --------------------------------------
    # Shuffled, deterministically, and this is a deliberate choice worth being
    # explicit about. The good tickets were all captured on different days from
    # the defective ones, so in capture order the first two hundred are every
    # good ticket in a row — which would show a viewer twenty seconds of an
    # inspection system finding nothing wrong. The mix and every verdict here
    # are the run's own; only the sequence is rearranged, and the page says so.
    order = list(range(len(frames)))
    state = 20251126
    for i in range(len(order) - 1, 0, -1):
        state = (state * 1103515245 + 12345) % (2**31)
        j = state % (i + 1)
        order[i], order[j] = order[j], order[i]
    sample = [frames[i] for i in order[:REPLAY]]

    visibility = rules["visibility_thresholds"]["ranges"]
    density = rules["density_thresholds"]["summary"]["big_q_block"]

    payload = {
        "source": {
            "system": "EagleEyes",
            "client": "Nissha Medical Technologies",
            "line": "EXT705 ticket press",
            "note": (
                "Verdicts, gate outcomes and block counts are the production "
                "engine's own output over a labelled run of 2,315 camera "
                "frames, each one a bunch of twenty-one tickets. Ground truth "
                "is the label the camera wrote into each filename. The order "
                "frames arrive in has been shuffled — the good and defective "
                "sets were captured on different days — but nothing else about "
                "them has been changed."
            ),
            "model": rules["meta"]["weights_path"],
            "generatedAt": dt.date.today().isoformat(),
        },
        "measured": {
            "frames": len(frames),
            "good": matrix[("OK", "OK")] + matrix[("OK", "NG")],
            "defective": matrix[("NG", "NG")] + matrix[("NG", "OK")],
            "passed": matrix[("OK", "OK")],
            "caught": matrix[("NG", "NG")],
            "falseRejects": matrix[("OK", "NG")],
            "missed": matrix[("NG", "OK")],
            "gates": [
                {
                    "id": g["id"],
                    "label": g["label"],
                    "question": g["question"],
                    "passed": gate_pass[g["id"]],
                    "total": len(frames),
                }
                for g in GATES
            ],
            "failures": [
                {"reason": reason, "count": count}
                for reason, count in failures.most_common()
            ],
            "bigCounts": [
                {"blocks": n, "frames": c} for n, c in sorted(big_counts.items())
            ],
            "lineRate": median_rate,
            "detectMs": round(detect_ms, 1),
            "rulesMs": round(rules_ms, 1),
        },
        "rules": {
            "allowedBigCounts": rules["count_rules"]["big_expected_any"],
            "imgsz": rules["count_inference"]["primary"]["imgsz"],
            "primaryConf": rules["count_inference"]["primary"]["conf"],
            "recoveryConf": rules["count_inference"]["recovery"]["conf"],
            "conf": visibility["conf"]["big_q_block"],
            "areaFrac": visibility["area_frac"]["big_q_block"],
            "meanGray": {
                "min": round(density["mean_gray"]["min"], 2),
                "max": round(density["mean_gray"]["max"], 2),
            },
            "darkRatio": {
                "min": round(density["dark_ratio"]["min"], 4),
                "max": round(density["dark_ratio"]["max"], 4),
            },
            "zThreshold": rules["relative_position"]["suggested_z_threshold"],
            "thresholdsFrom": rules["dataset_stats"]["old"]["meta"]["notes"],
        },
        "replay": [
            {
                "serial": t["serial"],
                "truth": t["truth"],
                "status": t["status"],
                "big": t["big"],
                "checks": [1 if c else 0 for c in t["checks"]],
            }
            for t in sample
        ],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    m = payload["measured"]
    print(f"frames      {m['frames']:,}  ({m['good']} good, {m['defective']} defective)")
    print(f"passed      {m['passed']:,}   caught {m['caught']:,}")
    print(f"false rejects {m['falseRejects']}   missed {m['missed']}")
    print(f"line rate   {m['lineRate']} frames/second (median)")
    print(f"latency     {m['detectMs']} ms detect + {m['rulesMs']} ms rules")
    print(f"replay      {len(payload['replay'])} frames")
    print(f"written     {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
