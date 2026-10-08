#!/usr/bin/env python3
"""Insert the TYPE_CHECKING declarations printed by mixin_stubs.py into a mixin class.

Usage: python3 scripts/dev/insert_mixin_stubs.py <mixin-module>
"""
from __future__ import annotations

import ast
import subprocess
import sys
from pathlib import Path


def main() -> int:
    target = Path(sys.argv[1])
    output = subprocess.run(
        ["python3", "scripts/dev/mixin_stubs.py", str(target)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.splitlines()

    body: list[str] = []
    inside = False
    for line in output:
        if line.startswith("#"):
            continue
        if line.strip() == "if TYPE_CHECKING:":
            inside = True
            body.append("    if TYPE_CHECKING:")
            continue
        if inside:
            if not line.strip():
                body.append(line)
                continue
            # the generator indents the whole block by 4 relative to the class body
            body.append(line[4:] if line.startswith("    ") else line)

    block = "\n".join(body).rstrip()
    if "session: Session" not in block:
        block = block.replace(
            "    if TYPE_CHECKING:\n",
            "    if TYPE_CHECKING:\n        session: Session\n",
            1,
        )

    source = target.read_text()
    tree = ast.parse(source)
    mixin = next(
        n for n in tree.body if isinstance(n, ast.ClassDef) and n.name.endswith("Mixin")
    )
    doc = ast.get_docstring(mixin)
    if doc is None:
        raise SystemExit("mixin has no docstring to anchor the insertion")
    anchor = (
        f'class {mixin.name}:\n    """{doc}"""\n'
    )
    if anchor not in source:
        raise SystemExit("anchor not found")
    if "# Provided by EquipmentService" in source:
        raise SystemExit("declarations already present")
    target.write_text(source.replace(anchor, anchor + "\n" + block + "\n", 1))
    print(f"inserted {len(block.splitlines())} lines into {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
