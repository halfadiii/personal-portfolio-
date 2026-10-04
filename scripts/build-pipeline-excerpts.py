"""
Cut the code shown on the subway case study out of the real repository.

The pipeline section of /work/nyc-subway-reliability says "open a stage to see
what it does and the code that runs it". For its first month that code was
written to look the part: BigQuery-dialect SQL and file names that matched the
project's description, from before the repository existed. Once the repository
was public the two could be compared, and they did not match.

So the code is no longer typed here. This reads a checkout of
halfadiii/nyc-subway-reliability, takes each excerpt from the file it names by
marker lines, removes the common indentation, and changes nothing else.

    python scripts/build-pipeline-excerpts.py [--repo <path to a clone>]
    python scripts/build-pipeline-excerpts.py --check

Output: src/content/data/pipeline-excerpts.json

`--check` writes nothing. It fails if the committed excerpts differ from what
the repository holds now, or if a code block in the case study's own prose
(src/content/work/nyc-subway-reliability.mdx, which is pasted by hand) is not a
run of consecutive lines from the file it is supposed to come from. Run it
after the repository changes, before believing the page.

Markers rather than line numbers, so an excerpt survives lines being added
above it. A marker that no longer exists is an error, not an empty block.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import textwrap
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "content" / "data" / "pipeline-excerpts.json"
CASE_STUDY = ROOT / "src" / "content" / "work" / "nyc-subway-reliability.mdx"
DEFAULT_REPO = ROOT.parent.parent / "MTA"
REPOSITORY = "https://github.com/halfadiii/nyc-subway-reliability"

# Stage id in src/content/pipeline.ts -> where its code comes from.
# (language, file, the line it starts at, the line it ends at or None for the
# end of the file). Lines are matched whole, with their indentation ignored.
EXCERPTS: dict[str, tuple[str, str, str, str | None]] = {
    "ingest": (
        "python",
        "ingest/poller.py",
        "def round_once(self) -> int:",
        'print(f"    {feed_id:9s} decode/write failed: {exc}", flush=True)',
    ),
    "landing": (
        "python",
        "ingest/poller.py",
        "when = datetime.fromtimestamp(observed_at, tz=timezone.utc).astimezone(NY)",
        "return len(rows)",
    ),
    "arrival": (
        "sql",
        "transform/models/intermediate/int_inferred_arrivals.sql",
        "select",
        None,
    ),
    # The model's final `select`. The one inside its CTE is `select * from ...`
    # on one line, so it does not match a line that is `select` and nothing else.
    "models": (
        "sql",
        "transform/models/marts/fct_excess_wait.sql",
        "select",
        None,
    ),
    "weather": (
        "python",
        "analysis/rain_regression.py",
        "def fit_route(frame: pd.DataFrame) -> dict:",
        "}",
    ),
}

# The code blocks in the case study's prose, in the order they appear.
CASE_STUDY_SOURCES = [
    "ingest/schema.py",
    "transform/models/intermediate/int_inferred_arrivals.sql",
]


def cut(repo: Path, relative: str, first: str, last: str | None) -> tuple[int, str]:
    """The excerpt, and the 1-based line it starts on."""
    lines = (repo / relative).read_text(encoding="utf-8").splitlines()
    starts = [i for i, line in enumerate(lines) if line.strip() == first]
    if not starts:
        raise SystemExit(f"{relative}: no line reads {first!r}")
    start = starts[0]
    if last is None:
        end = len(lines) - 1
    else:
        ends = [i for i in range(start + 1, len(lines)) if lines[i].strip() == last]
        if not ends:
            raise SystemExit(f"{relative}: no line after {start + 1} reads {last!r}")
        end = ends[0]
    return start + 1, textwrap.dedent("\n".join(lines[start:end + 1])).rstrip()


def commit_of(repo: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "--short", "HEAD"],
        capture_output=True, text=True,
    )
    return result.stdout.strip() or "unknown"


def uncommitted(repo: Path, files: set[str]) -> list[str]:
    """Excerpted files with changes that are not in the commit being recorded."""
    result = subprocess.run(
        ["git", "-C", str(repo), "status", "--porcelain", "--", *sorted(files)],
        capture_output=True, text=True,
    )
    return [line[3:] for line in result.stdout.splitlines() if line.strip()]


def build(repo: Path) -> dict:
    excerpts = {}
    for stage, (lang, relative, first, last) in EXCERPTS.items():
        line, source = cut(repo, relative, first, last)
        excerpts[stage] = {
            "lang": lang,
            "filename": relative,
            "line": line,
            "source": source,
        }
    return excerpts


def contiguous(haystack: list[str], needle: list[str]) -> int:
    """The 1-based line `needle` starts at inside `haystack`, or 0."""
    for at in range(len(haystack) - len(needle) + 1):
        if haystack[at:at + len(needle)] == needle:
            return at + 1
    return 0


def check_case_study(repo: Path) -> list[str]:
    text = CASE_STUDY.read_text(encoding="utf-8").replace("\r", "")
    blocks = [m.group(1).rstrip() for m in re.finditer(r"```\w+\n(.*?)```", text, re.S)]
    problems = []
    if len(blocks) != len(CASE_STUDY_SOURCES):
        problems.append(
            f"the case study has {len(blocks)} code blocks; "
            f"{len(CASE_STUDY_SOURCES)} are listed in CASE_STUDY_SOURCES"
        )
    for block, relative in zip(blocks, CASE_STUDY_SOURCES):
        file_lines = [line.strip() for line in (repo / relative).read_text(encoding="utf-8").splitlines()]
        found = contiguous(file_lines, [line.strip() for line in block.split("\n")])
        if found:
            print(f"  ok    case study block from {relative}, line {found}")
        else:
            problems.append(f"a case study code block is not in {relative} as written")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--repo", type=Path, default=DEFAULT_REPO)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    repo = args.repo.resolve()
    if not (repo / "ingest" / "poller.py").exists():
        print(f"No checkout of the subway repository at {repo}. Pass --repo.")
        return 1

    excerpts = build(repo)
    for stage, item in excerpts.items():
        print(
            f"  {stage:8s} {item['filename']}, from line {item['line']}, "
            f"{len(item['source'].splitlines())} lines"
        )

    dirty = uncommitted(repo, {item["filename"] for item in excerpts.values()})
    if dirty:
        print("\nThese files have changes that are not committed in that checkout:")
        for name in dirty:
            print(f"  {name}")
        print("Commit them first, or the page shows code nobody can find.")
        return 1

    if args.check:
        problems = check_case_study(repo)
        if not OUT.exists():
            problems.append(f"{OUT.relative_to(ROOT)} does not exist")
        else:
            committed = json.loads(OUT.read_text(encoding="utf-8"))["excerpts"]
            for stage, item in excerpts.items():
                if committed.get(stage, {}).get("source") != item["source"]:
                    problems.append(f"the committed excerpt for '{stage}' is out of date")
            for stage in committed.keys() - excerpts.keys():
                problems.append(f"the committed file has an excerpt for '{stage}' that is no longer defined")
        if problems:
            print("\nNot verbatim any more:")
            for problem in problems:
                print(f"  {problem}")
            return 1
        print("\nEvery code block on the case study is in the repository as shown.")
        return 0

    payload = {
        "repository": REPOSITORY,
        "commit": commit_of(repo),
        "generatedAt": date.today().isoformat(),
        "excerpts": excerpts,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"\nWrote {OUT.relative_to(ROOT)} from commit {payload['commit']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
