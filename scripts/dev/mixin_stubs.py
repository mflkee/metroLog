#!/usr/bin/env python3
"""Print the TYPE_CHECKING declarations a mixin needs for members it borrows through the MRO.

Usage: python3 scripts/dev/mixin_stubs.py backend/app/services/equipment_verifications.py

Reads the mixin, collects every `self.<name>` it uses but does not define, finds each member's
signature (or its repository type) in the equipment service and the sibling mixins, and prints a
ready-to-paste block. Run it after extracting a mixin to keep mypy at its baseline.
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
]


def class_names(path: Path) -> dict[str, ast.ClassDef]:
    tree = ast.parse(path.read_text())
    return {n.name: n for n in tree.body if isinstance(n, ast.ClassDef)}


def signature(path: Path, name: str) -> str | None:
    lines = path.read_text().splitlines()
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            start = min([node.lineno] + [d.lineno for d in node.decorator_list])
            collected: list[str] = []
            for line in lines[start - 1:node.end_lineno or start]:
                collected.append(line)
                if line.rstrip().endswith(":") and "->" in line:
                    break
            return "\n".join(collected)
    return None


def repo_types() -> dict[str, str]:
    tree = ast.parse(SERVICE.read_text())
    service = next(
        n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "EquipmentService"
    )
    mapping: dict[str, str] = {}
    for node in ast.walk(service):
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Attribute)
            and isinstance(node.value, ast.Call)
            and isinstance(node.value.func, ast.Name)
        ):
            mapping[node.targets[0].attr] = node.value.func.id
    return mapping


def main() -> int:
    target = Path(sys.argv[1])
    tree = ast.parse(target.read_text())
    mixin = next(n for n in tree.body if isinstance(n, ast.ClassDef))
    own = {
        m.name
        for m in mixin.body
        if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    used = sorted(set(re.findall(r"self\.(\w+)", target.read_text())))
    borrowed = [name for name in used if name not in own]

    repos = repo_types()
    sources = [SERVICE] + [SERVICES / name for name in SIBLINGS]
    attributes: list[tuple[str, str]] = []
    methods: list[str] = []
    unknown: list[str] = []
    for name in borrowed:
        if name in repos:
            attributes.append((name, repos[name]))
            continue
        for source in sources:
            found = signature(source, name)
            if found:
                methods.append(found)
                break
        else:
            unknown.append(name)

    print(f"# borrowed: {len(borrowed)}  attributes: {len(attributes)}  methods: {len(methods)}")
    if unknown:
        print(f"# UNKNOWN (declare by hand): {', '.join(unknown)}")
    print("    if TYPE_CHECKING:")
    for name, kind in attributes:
        print(f"            {name}: {kind}")
    for found in methods:
        body = "\n".join("        " + line for line in found.splitlines())
        print(body.rstrip() + " ...")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
