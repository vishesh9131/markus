#!/usr/bin/env python3
"""Copy the Markus Python package + deps into vscode-markus/bundled for the VSIX."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_MARKUS = ROOT.parent / "src" / "markus"
BUNDLED = ROOT / "bundled"
DEST_PKG = BUNDLED / "markus"
DEST_DEPS = BUNDLED / "deps"
RUN_PY = BUNDLED / "run.py"


def main() -> None:
    if not SRC_MARKUS.is_dir():
        raise SystemExit(f"Missing source package: {SRC_MARKUS}")

    if DEST_PKG.exists():
        shutil.rmtree(DEST_PKG)
    if DEST_DEPS.exists():
        shutil.rmtree(DEST_DEPS)

    print(f"Copying {SRC_MARKUS} -> {DEST_PKG}")
    shutil.copytree(
        SRC_MARKUS,
        DEST_PKG,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache"),
    )

    if not RUN_PY.is_file():
        raise SystemExit(f"Missing entry script: {RUN_PY}")

    print(f"Installing click + pyyaml into {DEST_DEPS}")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "click>=8.1",
            "pyyaml>=6.0",
            "-t",
            str(DEST_DEPS),
            "--no-compile",
            "-q",
        ],
        check=True,
    )

    # smoke test
    subprocess.run(
        [sys.executable, str(RUN_PY), "--version"],
        check=True,
        cwd=str(BUNDLED),
    )
    print("Bundle OK — markus is ready inside the extension.")


if __name__ == "__main__":
    main()
