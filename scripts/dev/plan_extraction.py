#!/usr/bin/env python3
"""Plan a mixin extraction: print the methods and module-level closure for a name pattern.

Usage: python3 scripts/dev/plan_extraction.py <regex>
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

SERVICES = Path("backend/app/services")
SERVICE = SERVICES / "equipment_service.py"
SIBLINGS = [
    "equipment_comments.py",
    "equipment_folders.py",
    "equipment_process_templates.py",
    "equipment_repairs.py",
    "equipment_text.py",
    "equipment_verifications.py",
]


def block_names(path: Path) -> set[str]:
    names: set[str] = set()
    for node in ast.parse(path.read_text()).body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            names.add(node.targets[0].id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
    return names


def main() -> int:
    pattern = re.compile(sys.argv[1])
    lines = SERVICE.read_text().splitlines()
    tree = ast.parse(SERVICE.read_text())
    service = next(
        n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "EquipmentService"
    )

    module_spans: dict[str, tuple[int, int]] = {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            name = node.name
        elif isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            name = node.target.id
        else:
            continue
        module_spans[name] = (
            min([node.lineno] + [d.lineno for d in getattr(node, "decorator_list", [])]),
            node.end_lineno or node.lineno,
        )

    methods = [
        (m.name, min([m.lineno] + [d.lineno for d in m.decorator_list]), m.end_lineno)
        for m in service.body
        if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)) and pattern.search(m.name)
    ]

    external = set()
    for name in SIBLINGS:
        external |= block_names(SERVICES / name)

    body = "\n".join("\n".join(lines[s - 1:e]) for _, s, e in methods)
    seeds = [
        name
        for name in module_spans
        if name not in external and re.search(rf"\b{re.escape(name)}\b", body)
    ]
    closure = set(seeds)
    queue = list(seeds)
    while queue:
        name = queue.pop()
        if name not in module_spans:
            continue
        start, end = module_spans[name]
        text = "\n".join(lines[start - 1:end])
        for other in module_spans:
            if other != name and other not in closure and other not in external:
                if re.search(rf"\b{re.escape(other)}\b", text):
                    closure.add(other)
                    queue.append(other)
    closure -= {n for n, _, _ in methods}

    print("METHODS:" + ",".join(n for n, _, _ in methods))
    print(f"# methods: {len(methods)}, {sum(e - s + 1 for _, s, e in methods)} lines")
    print("HELPERS:" + ",".join(sorted(closure)))
    print(
        f"# helpers: {len(closure)}, "
        f"{sum(module_spans[n][1] - module_spans[n][0] + 1 for n in closure)} lines"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
