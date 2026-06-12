"""Locate latexmk when GUI apps have a minimal PATH (common on macOS)."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

VENDOR_IEEE = Path(__file__).resolve().parent / "vendor" / "ieee"

# Templates that need IEEEtran.cls / IEEEtran.bst (bundled under vendor/ieee).
IEEE_TEMPLATE_IDS = frozenset({"ieee", "ieee-journal", "ieee-trans"})

# MacTeX, Homebrew (Apple Silicon / Intel), typical Linux texlive
TEX_BIN_CANDIDATES = (
    Path("/Library/TeX/texbin"),
    Path("/opt/homebrew/bin"),
    Path("/usr/local/bin"),
    Path("/usr/bin"),
)


def tex_bin_dirs() -> list[Path]:
    dirs: list[Path] = list(TEX_BIN_CANDIDATES)
    for root in (Path("/usr/local/texlive"), Path("/opt/homebrew/opt/texlive")):
        if root.is_dir():
            for child in sorted(root.iterdir()):
                bin_dir = child / "bin"
                if bin_dir.is_dir():
                    for arch in ("universal-darwin", "x86_64-darwin", "aarch64-linux", "x86_64-linux"):
                        candidate = bin_dir / arch
                        if candidate.is_dir():
                            dirs.append(candidate)
    extra = os.environ.get("MARKUS_TEX_BIN")
    if extra:
        dirs.insert(0, Path(extra))
    return dirs


def augmented_path_env() -> dict[str, str]:
    env = os.environ.copy()
    parts = [str(d) for d in tex_bin_dirs() if d.is_dir()]
    parts.extend(env.get("PATH", "").split(os.pathsep))
    # dedupe while keeping order
    seen: set[str] = set()
    ordered: list[str] = []
    for p in parts:
        if p and p not in seen:
            seen.add(p)
            ordered.append(p)
    env["PATH"] = os.pathsep.join(ordered)
    return env


def _prepend_tex_input(var_name: str, directory: Path, env: dict[str, str]) -> None:
    """Prepend a directory to a TeX search-path env var (keeps default trees)."""
    if not directory.is_dir():
        return
    root = str(directory.resolve())
    # Trailing os.pathsep keeps kpathsea's default search paths.
    prefix = root + os.sep + os.sep + os.pathsep
    current = env.get(var_name, "")
    if current and not current.endswith(os.pathsep):
        current += os.pathsep
    env[var_name] = prefix + current


def latex_env_for_template(template: str | None = None) -> dict[str, str]:
    """PATH + bundled class/BST paths for venue templates on minimal TeX installs."""
    env = augmented_path_env()
    tpl = (template or "").strip().lower()
    if tpl in IEEE_TEMPLATE_IDS and VENDOR_IEEE.is_dir():
        _prepend_tex_input("TEXINPUTS", VENDOR_IEEE, env)
        _prepend_tex_input("BSTINPUTS", VENDOR_IEEE, env)
    return env


def find_latexmk() -> str | None:
    with_tex_path = augmented_path_env().get("PATH", "")
    found = shutil.which("latexmk", path=with_tex_path)
    if found:
        return found
    for d in tex_bin_dirs():
        candidate = d / "latexmk"
        if candidate.is_file():
            return str(candidate)
    return None
