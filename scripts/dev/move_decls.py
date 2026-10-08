#!/usr/bin/env python3
"""Move named top-level declarations from one module into another.

Usage:
  python3 scripts/dev/move_decls.py --from SRC --to TARGET --names a,b,c [--header TEXT]
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

DECL_RE = re.compile(
    r"^(?:export )?(?:default )?(?:async )?(?:type|interface|const|function|enum|class) (\w+)"
)


def blocks(path: Path) -> list[tuple[int, int, str]]:
    lines = path.read_text().splitlines()
    starts = [(i, m.group(1)) for i, line in enumerate(lines) if (m := DECL_RE.match(line))]
    out = []
    for position, (index, name) in enumerate(starts):
        end = starts[position + 1][0] if position + 1 < len(starts) else len(lines)
        out.append((index, end, name))
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="source", required=True)
    parser.add_argument("--to", dest="target", required=True)
    parser.add_argument("--names", required=True)
    parser.add_argument("--header", default="")
    args = parser.parse_args()

    names = [n for n in args.names.split(",") if n]
    source = Path(args.source)
    target = Path(args.target)
    entries = blocks(source)

    moved: list[str] = []
    removals: list[tuple[int, int]] = []
    for index, end, name in entries:
        if name in names:
            lines = source.read_text().splitlines()
            moved.append("\n".join(lines[index:end]).rstrip())
            removals.append((index, end))
    found = {DECL_RE.match(block).group(1) for block in moved}
    missing = [n for n in names if n not in found]
    if missing:
        print("not found in source:", missing)
        return 1

    lines = source.read_text().splitlines()
    keep: list[str] = []
    index = 0
    ordered = sorted(removals)
    while index < len(lines):
        hit = next((r for r in ordered if r[0] <= index < r[1]), None)
        if hit:
            index = hit[1]
            continue
        keep.append(lines[index])
        index += 1
    source.write_text("\n".join(keep) + "\n")

    header = args.header or f"// Extracted from {source} to keep that module focused."
    target.parent.mkdir(parents=True, exist_ok=True)
    existing = target.read_text() if target.exists() else ""
    body = "\n\n".join(moved)
    target.write_text((existing + "\n" if existing else header + "\n\n") + body + "\n")
    print(f"moved {len(moved)} declarations ({sum(e - s for s, e in removals)} lines) into {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
