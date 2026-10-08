#!/usr/bin/env python3
"""Add missing imports across frontend/src based on `tsc --noEmit` TS2304 errors.

Generalises the equipment-API helper: for every "Cannot find name 'X'" it finds the module
that defines X (exporting it if needed) and prepends a grouped import. Repeat until clean.
"""
from __future__ import annotations

import re
import subprocess
from collections import defaultdict
from pathlib import Path

SRC = Path("frontend/src")
DECL_RE = re.compile(
    r"^(?:export )?(?:default )?(?:async )?(?:type|interface|const|function|enum|class) (\w+)",
    re.M,
)
EXPORTED_RE = re.compile(
    r"^export (?:default )?(?:async )?(?:type|interface|const|function|enum|class) (\w+)", re.M
)
ERR_RE = re.compile(
    r"^(src/[^\s(]+\.tsx?)\((\d+),\d+\): error TS2304: Cannot find name '(\w+)'"
)
CLIENT_NAMES = {"apiRequest", "ApiError", "apiBaseUrl", "getResponseErrorMessage"}


def definition_index() -> dict[str, Path]:
    index: dict[str, Path] = {}
    for path in sorted(SRC.rglob("*.ts")) + sorted(SRC.rglob("*.tsx")):
        if ".test." in path.name:
            continue
        for name in DECL_RE.findall(path.read_text()):
            index.setdefault(name, path)
    return index


def specifier_for(target: Path, source: Path) -> str:
    rel = source.relative_to(SRC)
    if source.parent == target.parent:
        return "./" + rel.with_suffix("").name
    if rel.parts[0] == "api" and len(rel.parts) == 2:
        return "@/api/" + rel.with_suffix("").name
    return "@/" + str(rel.with_suffix(""))


def main() -> int:
    result = subprocess.run(
        ["npx", "tsc", "--noEmit"], cwd="frontend", capture_output=True, text=True
    )
    missing: dict[Path, set[str]] = defaultdict(set)
    for line in result.stdout.splitlines():
        match = ERR_RE.match(line)
        if match:
            missing[SRC.parent / match.group(1)].add(match.group(3))
    if not missing:
        print("no unresolved names")
        return 0

    index = definition_index()
    unresolved: set[str] = set()
    for target, names in sorted(missing.items()):
        groups: dict[str, set[str]] = defaultdict(set)
        for name in names:
            if name in CLIENT_NAMES:
                groups["@/api/client"].add(name)
                continue
            source = index.get(name)
            if source is None or source == target:
                unresolved.add(name)
                continue
            text = source.read_text()
            if name not in EXPORTED_RE.findall(text):
                text = re.sub(
                    rf"^(?=(?:type|interface|const|function|async function|enum|class) {name}\b)",
                    "export ",
                    text,
                    count=1,
                    flags=re.M,
                )
                source.write_text(text)
            groups[specifier_for(target, source)].add(name)

        imports = [
            f'import {{ {", ".join(sorted(group))} }} from "{specifier}";'
            for specifier, group in sorted(groups.items())
        ]
        text = target.read_text()
        first_import = re.search(r"^import ", text, re.M)
        if first_import:
            text = text[: first_import.start()] + "\n".join(imports) + "\n" + text[first_import.start():]
        else:
            text = "\n".join(imports) + "\n\n" + text
        target.write_text(text)
        print(f"{target.name}: +{len(imports)} import lines")
    if unresolved:
        print("unresolved:", ", ".join(sorted(unresolved)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
