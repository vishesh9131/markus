#!/usr/bin/env python3
"""Markus compiler entry point shipped inside the VS Code / Cursor extension."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "deps"))
sys.path.insert(0, str(ROOT))

from markus.cli import main

if __name__ == "__main__":
    main()
