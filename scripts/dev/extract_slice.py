#!/usr/bin/env python3
"""Move a state/ref/mutation slice out of a page into a hook, keeping member names.

The hook returns every moved member under its original name; the page destructures them, so its
body and JSX stay untouched. Missing imports in the new hook are then added by
scripts/dev/fix_ts_imports.py (derived from tsc errors).

Usage:
  python3 scripts/dev/extract_slice.py --page P --hook H --state a,b --refs c --mutations d,e \
      --params "token: string | null,equipmentId: number" --hook-name useX \
      --anchor "  const {\n    equipmentQuery," [--before]
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path


def consume_semicolon(lines: list[str], start: int) -> int:
    depth = 0
    index = start
    while index < len(lines):
        line = lines[index]
        depth += sum(line.count(c) for c in "({[") - sum(line.count(c) for c in ")}]")
        if depth <= 0 and line.rstrip().endswith(";"):
            return index + 1
        index += 1
    raise SystemExit(f"no statement end after line {start + 1}")


def consume_braces(lines: list[str], start: int) -> int:
    depth = 0
    index = start
    while index < len(lines):
        depth += lines[index].count("{") - lines[index].count("}")
        if depth == 0 and index > start:
            return index + 1
        index += 1
    raise SystemExit(f"unbalanced block after line {start + 1}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--page", required=True)
    parser.add_argument("--hook", required=True)
    parser.add_argument("--hook-name", required=True)
    parser.add_argument("--state", default="")
    parser.add_argument("--refs", default="")
    parser.add_argument("--mutations", default="")
    parser.add_argument("--queries", default="")
    parser.add_argument("--params", required=True, help="comma separated `name: type` pairs")
    parser.add_argument("--anchor", required=True, help="text in the page the call is inserted before")
    parser.add_argument("--doc", default="Extracted slice of the page; members keep their names.")
    parser.add_argument("--replace", default="parsedEquipmentId", help="page identifier to rename to the param")
    args = parser.parse_args()

    state = [n for n in args.state.split(",") if n]
    refs = [n for n in args.refs.split(",") if n]
    mutations = [n for n in args.mutations.split(",") if n]
    queries = [n for n in args.queries.split(",") if n]
    params = [p.strip() for p in args.params.split(",") if p.strip()]

    page = Path(args.page)
    lines = page.read_text().splitlines()
    removals: list[tuple[int, int]] = []
    blocks: dict[str, list[str]] = {"state": [], "refs": [], "mutations": []}

    def take(kind: str, start: int, end: int) -> str:
        text = "\n".join(lines[start:end])
        target = next((p.split(":")[0].strip() for p in params if "quipment" in p), params[0].split(":")[0].strip())
        return text.replace(args.replace, target) if args.replace else text

    for name in state:
        start = next(i for i, l in enumerate(lines) if l.strip().startswith(f"const [{name}, set"))
        end = consume_semicolon(lines, start)
        removals.append((start, end))
        blocks["state"].append(take("state", start, end))
    for name in refs:
        start = next(i for i, l in enumerate(lines) if l.strip().startswith(f"const {name} = useRef"))
        end = consume_semicolon(lines, start)
        removals.append((start, end))
        blocks["refs"].append(take("refs", start, end))
    for name in mutations:
        start = next(
            i for i, l in enumerate(lines) if l.strip().startswith(f"const {name} = useMutation({{")
        )
        end = consume_braces(lines, start)
        removals.append((start, end))
        blocks["mutations"].append(take("mutations", start, end))
    for name in queries:
        start = next(
            i for i, l in enumerate(lines) if l.strip().startswith(f"const {name} = useQuery({{")
        )
        end = consume_braces(lines, start)
        removals.append((start, end))
        blocks["mutations"].append(take("queries", start, end))

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

    returned: list[str] = []
    for name in state:
        returned.append(f"    {name},")
        returned.append(f"    set{name[0].upper()}{name[1:]},")
    for name in refs:
        returned.append(f"    {name},")
    for name in mutations:
        returned.append(f"    {name},")
    for name in queries:
        returned.append(f"    {name},")

    signature = ",\n  ".join(params)
    call_args = ",\n    ".join(
        f"{p.split(':')[0].strip()}: "
        + (args.replace if "quipment" in p else p.split(":")[0].strip())
        for p in params
    )
    hook = (
        'import { useRef, useState } from "react";\n\n'
        'import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";\n\n'
        f"type {args.hook_name[0].upper()}{args.hook_name[1:]}Params = {{\n  {signature},\n}};\n\n"
        f"/** {args.doc} */\n"
        f"export function {args.hook_name}({{\n  " + ",\n  ".join(p.split(":")[0].strip() for p in params) + f",\n}}: {args.hook_name[0].upper()}{args.hook_name[1:]}Params) {{\n"
        "  const queryClient = useQueryClient();\n\n"
        + "\n".join(blocks["state"])
        + "\n\n"
        + "\n".join(blocks["refs"])
        + "\n\n"
        + "\n\n".join(blocks["mutations"])
        + "\n\n  return {\n"
        + "\n".join(returned)
        + "\n  };\n}\n"
    )
    hook_path = Path(args.hook)
    hook_path.parent.mkdir(parents=True, exist_ok=True)
    hook_path.write_text(hook)

    text = "\n".join(keep) + "\n"
    destructure = (
        "  const {\n"
        + "\n".join(returned)
        + f"\n  }} = {args.hook_name}({{\n"
        + call_args
        + "\n  });\n\n"
    )
    if args.anchor not in text:
        raise SystemExit("anchor not found in the page")
    text = text.replace(args.anchor, destructure + args.anchor, 1)
    page.write_text(text)
    print(f"wrote {hook_path} ({len(hook.splitlines())} lines)")
    print(f"{page} now {len(text.splitlines())} lines; removed {len(removals)} declarations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
