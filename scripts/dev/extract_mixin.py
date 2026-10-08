#!/usr/bin/env python3
"""Generic extraction: move class methods into a mixin module and module-level helpers alongside.

Usage:
  python3 /tmp/opencode/move_to_mixin.py --module PATH --mixin NAME \
      --methods a,b,c --helpers x,y [--plan]
"""
from __future__ import annotations

import argparse
import ast
from pathlib import Path

SERVICE = Path("backend/app/services/equipment_service.py")


def class_method_spans(source: str) -> dict[str, tuple[int, int]]:
    tree = ast.parse(source)
    service = next(
        n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "EquipmentService"
    )
    spans: dict[str, tuple[int, int]] = {}
    for node in service.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            spans[node.name] = (
                min([node.lineno] + [d.lineno for d in node.decorator_list]),
                node.end_lineno or node.lineno,
            )
    return spans


def module_spans(source: str) -> dict[str, tuple[int, int]]:
    tree = ast.parse(source)
    spans: dict[str, tuple[int, int]] = {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            name = node.name
        elif isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            name = node.target.id
        else:
            continue
        spans[name] = (
            min([node.lineno] + [d.lineno for d in getattr(node, "decorator_list", [])]),
            node.end_lineno or node.lineno,
        )
    return spans


def cut(lines: list[str], ranges: list[tuple[int, int]]) -> list[str]:
    keep: list[str] = []
    index = 0
    ordered = sorted(ranges)
    while index < len(lines):
        line_no = index + 1
        hit = next((r for r in ordered if r[0] <= line_no <= r[1]), None)
        if hit:
            index = hit[1]
            continue
        keep.append(lines[index])
        index += 1
    return keep


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--module", required=True)
    parser.add_argument("--mixin", required=True)
    parser.add_argument("--methods", required=True)
    parser.add_argument("--helpers", default="")
    parser.add_argument("--plan", action="store_true")
    args = parser.parse_args()

    methods = [m for m in args.methods.split(",") if m]
    helpers = [h for h in args.helpers.split(",") if h]

    source = SERVICE.read_text()
    lines = source.splitlines()
    method_spans = class_method_spans(source)
    helper_spans = module_spans(source)

    missing = [m for m in methods if m not in method_spans] + [
        h for h in helpers if h not in helper_spans
    ]
    if missing:
        print("not found:", missing)
        return 1

    total = sum(e - s + 1 for s, e in (method_spans[m] for m in methods)) + sum(
        e - s + 1 for s, e in (helper_spans[h] for h in helpers)
    )
    print(f"{len(methods)} methods + {len(helpers)} helpers, {total} lines")
    if args.plan:
        return 0

    helper_body = "\n".join(
        "\n".join(lines[helper_spans[h][0] - 1:helper_spans[h][1]]) for h in helpers
    )
    method_body = "\n".join(
        "\n".join(lines[method_spans[m][0] - 1:method_spans[m][1]]) for m in methods
    )
    mixin_text = (
        f'"""{" ".join(args.mixin.split("Mixin")[0].split())} mixin for the equipment service."""\n\n'
        "from __future__ import annotations\n\n"
        "from typing import TYPE_CHECKING\n\n"
        + (helper_body + "\n\n\n" if helper_body else "")
        + f"class {args.mixin}:\n"
        '    """Mixed into ``EquipmentService``."""\n\n'
        + method_body
        + "\n"
    )
    ast.parse(mixin_text)

    new_service = "\n".join(
        cut(lines, [*(method_spans[m] for m in methods), *(helper_spans[h] for h in helpers)])
    ) + "\n"
    ast.parse(new_service)

    Path(args.module).write_text(mixin_text)
    SERVICE.write_text(new_service)
    print("wrote", args.module, "and rewrote", SERVICE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
