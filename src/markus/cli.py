"""Markus CLI: build .mks manuscripts to LaTeX and PDF."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import time
from pathlib import Path

import click

from markus import __version__
from markus.check import check_document
from markus.latex import write_tex
from markus.parser import MarkusParseError, parse
from markus.templates_registry import list_templates, resolve_template
from markus.texpath import find_latexmk, latex_env_for_template

DEFAULT_TEMPLATE = "article"
AUX_DIR_NAME = ".markus-aux"
AUX_EXTS = (".aux", ".log", ".out", ".fls", ".fdb_latexmk", ".bbl", ".blg", ".toc", ".synctex.gz", ".nav", ".snm", ".vrb")


def _extract_log_errors(log_path: Path, limit: int = 6) -> list[str]:
    if not log_path.is_file():
        return []
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    errors: list[str] = []
    i = 0
    while i < len(lines) and len(errors) < limit:
        if lines[i].startswith("!"):
            chunk = [lines[i].lstrip("! ").strip()]
            # the offending line usually follows as "l.<num> ..."
            for j in range(i + 1, min(i + 6, len(lines))):
                m = re.match(r"^l\.(\d+)\s*(.*)$", lines[j])
                if m:
                    chunk.append(f"  at .tex line {m.group(1)}: {m.group(2).strip()}")
                    break
            errors.append(" — ".join(c for c in chunk if c))
        i += 1
    return errors


def _scan_log_warnings(log_path: Path) -> list[str]:
    if not log_path.is_file():
        return []
    text = log_path.read_text(encoding="utf-8", errors="replace")
    out: list[str] = []
    if "There were undefined references" in text:
        out.append("undefined cross-references remain (check labels / run again)")
    for m in re.finditer(r"Citation `([^']+)' on page \d+ undefined", text):
        out.append(f"citation '{m.group(1)}' is undefined")
    return out


def _find_log(tex_path: Path, out_dir: Path) -> Path:
    aux_log = out_dir / AUX_DIR_NAME / f"{tex_path.stem}.log"
    if aux_log.is_file():
        return aux_log
    return out_dir / f"{tex_path.stem}.log"


def _compile_pdf(
    tex_path: Path,
    out_dir: Path,
    template: str | None = None,
    work_dir: Path | None = None,
) -> None:
    latexmk = find_latexmk()
    if not latexmk:
        raise click.ClickException(
            "latexmk not found. Install MacTeX or TeX Live, or set MARKUS_TEX_BIN "
            "to your tex bin folder (e.g. /Library/TeX/texbin)."
        )
    # run from the source directory so relative \includegraphics paths resolve
    cwd = str((work_dir or tex_path.parent).resolve())
    aux_dir = out_dir.resolve() / AUX_DIR_NAME
    base_cmd = [
        latexmk,
        "-pdf",
        "-interaction=nonstopmode",
        "-g",
        f"-outdir={out_dir.resolve()}",
        str(tex_path.resolve()),
    ]
    aux_cmd = base_cmd[:-1] + ["-emulate-aux-dir", f"-auxdir={aux_dir}", base_cmd[-1]]
    env = latex_env_for_template(template)
    # bibtex must find the .bib copied next to the output (trailing sep keeps defaults)
    for var in ("BIBINPUTS", "TEXINPUTS"):
        existing = env.get(var, "")
        env[var] = f"{out_dir.resolve()}{os.pathsep}{cwd}{os.pathsep}{existing}"

    result = subprocess.run(
        aux_cmd, capture_output=True, text=True, encoding="utf-8",
        errors="replace", env=env, cwd=cwd,
    )
    if result.returncode != 0 and (
        "emulate-aux-dir" in (result.stderr or "")
        and "unknown option" in (result.stderr or "").lower()
    ):
        # very old latexmk without aux-dir support
        result = subprocess.run(
            base_cmd, capture_output=True, text=True, encoding="utf-8",
            errors="replace", env=env, cwd=cwd,
        )

    log_path = _find_log(tex_path, out_dir)
    pdf_path = out_dir / f"{tex_path.stem}.pdf"

    if result.returncode != 0:
        errors = _extract_log_errors(log_path)
        msg_lines = [f"LaTeX build failed for {tex_path.name}"]
        msg_lines += [f"  ! {e}" for e in errors]
        if not errors:
            tail = (result.stdout or "").strip().splitlines()[-12:]
            msg_lines += [f"  {ln}" for ln in tail]
        if pdf_path.exists():
            msg_lines.append(f"A partial PDF was written to {pdf_path} — it is incomplete.")
        msg_lines.append(f"Full log: {log_path}")
        raise click.ClickException("\n".join(msg_lines))

    for w in _scan_log_warnings(log_path):
        click.secho(f"warning: {w}", fg="yellow", err=True)


def _parse_source(source: Path):
    text = source.read_text(encoding="utf-8")
    try:
        doc = parse(text, path=str(source))
    except MarkusParseError as exc:
        raise click.ClickException(str(exc)) from exc
    return text, doc


def _print_warnings(warnings: list[str]) -> None:
    for w in warnings:
        click.secho(f"warning: {w}", fg="yellow", err=True)


@click.group()
@click.version_option(__version__, prog_name="markus")
def main() -> None:
    """Markus — write .mks, get LaTeX-quality PDFs."""


@main.command("templates")
def templates_cmd() -> None:
    """List built-in venue / layout templates."""
    click.echo(f"{'ID':<16} {'Cols':<5} Name")
    click.echo("-" * 60)
    for spec in list_templates():
        click.echo(f"{spec.id:<16} {spec.columns:<5} {spec.label}")
        click.echo(f"{'':16} {'':5} {spec.description}")
        click.echo()


def _resolve_template_name(doc, template: str | None) -> str:
    tpl_name = template or doc.meta.get("template")
    if tpl_name is None and not doc.meta:
        tpl_name = "notes"
    elif tpl_name is None:
        tpl_name = DEFAULT_TEMPLATE
    try:
        return resolve_template(str(tpl_name)).id
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc


def _build_once(source: Path, out_dir: Path | None, template: str | None,
                tex_only: bool, pdf: bool) -> None:
    text, doc = _parse_source(source)
    tpl = _resolve_template_name(doc, template)
    out = out_dir or source.parent
    out.mkdir(parents=True, exist_ok=True)

    _print_warnings(check_document(doc, text, source))

    stem = source.stem
    tex_path = out / f"{stem}.tex"
    write_tex(doc, tex_path, template=tpl)
    click.echo(f"Wrote {tex_path}")

    bib = doc.meta.get("bib") or doc.meta.get("bibliography")
    if bib:
        bib_src = (source.parent / str(bib)).resolve()
        if bib_src.is_file():
            bib_dest = out / bib_src.name
            if bib_dest.resolve() != bib_src.resolve():
                shutil.copy2(bib_src, bib_dest)
                click.echo(f"Copied {bib_src.name}")
        else:
            click.secho(f"warning: bibliography not found: {bib_src}", fg="yellow", err=True)

    if tex_only or not pdf:
        return

    _compile_pdf(tex_path, out, template=tpl, work_dir=source.parent)
    pdf_path = out / f"{stem}.pdf"
    if pdf_path.exists():
        click.echo(f"Wrote {pdf_path}")
    else:
        raise click.ClickException("PDF was not produced — check the LaTeX log in the output directory")


@main.command("build")
@click.argument("source", type=click.Path(exists=True, path_type=Path))
@click.option(
    "-o",
    "--out-dir",
    type=click.Path(path_type=Path),
    default=None,
    help="Output directory (default: same as source file)",
)
@click.option(
    "-t",
    "--template",
    default=None,
    help=f"LaTeX template name (default: {DEFAULT_TEMPLATE} or 'template' in front matter)",
)
@click.option("--tex-only", is_flag=True, help="Emit .tex only, do not run latexmk")
@click.option("--pdf/--no-pdf", default=True, help="Compile PDF with latexmk")
@click.option("-w", "--watch", is_flag=True, help="Rebuild whenever the source or bibliography changes")
def build(
    source: Path,
    out_dir: Path | None,
    template: str | None,
    tex_only: bool,
    pdf: bool,
    watch: bool,
) -> None:
    """Compile a .mks file to .tex and optionally PDF."""
    if source.suffix != ".mks":
        click.secho(f"warning: expected .mks extension, got {source.suffix}", fg="yellow", err=True)

    if not watch:
        _build_once(source, out_dir, template, tex_only, pdf)
        return

    def deps() -> list[Path]:
        paths = [source]
        try:
            _, doc = _parse_source(source)
            bib = doc.meta.get("bib") or doc.meta.get("bibliography")
            if bib:
                paths.append((source.parent / str(bib)).resolve())
        except click.ClickException:
            pass
        return [p for p in paths if p.is_file()]

    def snapshot() -> tuple:
        return tuple(p.stat().st_mtime_ns for p in deps())

    click.echo(f"Watching {source} (Ctrl-C to stop)")
    last = None
    while True:
        try:
            current = snapshot()
            if current != last:
                last = current
                try:
                    _build_once(source, out_dir, template, tex_only, pdf)
                except click.ClickException as exc:
                    click.secho(f"error: {exc.message}", fg="red", err=True)
                click.echo("Waiting for changes...")
            time.sleep(0.5)
        except KeyboardInterrupt:
            click.echo("Stopped.")
            return


@main.command("check")
@click.argument("source", type=click.Path(exists=True, path_type=Path))
def check_cmd(source: Path) -> None:
    """Lint a .mks file: unknown refs/citations, missing figures, bad glyphs."""
    text, doc = _parse_source(source)
    warnings = check_document(doc, text, source)
    _print_warnings(warnings)
    if warnings:
        click.echo(f"{len(warnings)} warning(s).")
    else:
        click.echo("No problems found.")


@main.command("clean")
@click.argument("source", type=click.Path(exists=True, path_type=Path), required=False)
@click.option(
    "-o",
    "--out-dir",
    type=click.Path(path_type=Path),
    default=None,
    help="Directory that was used as build output (default: source dir)",
)
def clean(source: Path | None, out_dir: Path | None) -> None:
    """Remove LaTeX build artifacts (.aux, .log, .markus-aux, ...)."""
    target = out_dir or (source.parent if source and source.is_file() else source) or Path(".")
    stems = [source.stem] if source and source.is_file() else None
    removed = 0
    aux = Path(target) / AUX_DIR_NAME
    if aux.is_dir():
        shutil.rmtree(aux)
        removed += 1
    for p in Path(target).iterdir():
        if p.suffix in AUX_EXTS and (stems is None or p.name.split(".")[0] in stems):
            p.unlink()
            removed += 1
    click.echo(f"Removed {removed} artifact(s) from {target}")


@main.command("init")
@click.argument("name", default="paper")
@click.option(
    "-d",
    "--dir",
    type=click.Path(path_type=Path),
    default=Path("."),
    help="Directory to create the sample in",
)
def init(name: str, dir: Path) -> None:
    """Create a starter .mks manuscript and bibliography."""
    dir.mkdir(parents=True, exist_ok=True)
    mks_path = dir / f"{name}.mks"
    bib_path = dir / "refs.bib"

    if mks_path.exists():
        raise click.ClickException(f"{mks_path} already exists")

    mks_path.write_text(_STARTER_MKS.format(name=name.replace("_", " ").title()), encoding="utf-8")
    if not bib_path.exists():
        bib_path.write_text(_STARTER_BIB, encoding="utf-8")

    click.echo(f"Created {mks_path}")
    click.echo(f"Created {bib_path}")
    click.echo(f"Run: markus build {mks_path}")


@main.command("compile-tex")
@click.argument("tex_file", type=click.Path(exists=True, path_type=Path))
@click.option("-o", "--out-dir", type=click.Path(path_type=Path), default=None)
@click.option(
    "-t",
    "--template",
    default=None,
    help="Template id (e.g. ieee) so bundled class files are on the search path",
)
def compile_tex(tex_file: Path, out_dir: Path | None, template: str | None) -> None:
    """Compile an existing .tex file to PDF with latexmk."""
    out = out_dir or tex_file.parent
    _compile_pdf(tex_file, out, template=template)
    click.echo(f"Done — output in {out}")


_STARTER_MKS = """---
title: "{name}"
author:
  - name: Your Name
    affiliation: Your Institution
    email: you@example.edu
abstract: |
  A short abstract for your manuscript. Markus lets you write in a
  Markdown-like syntax and compile to publication-quality PDF via LaTeX.
template: article
bib: refs.bib
---

# Introduction

Write papers in **Markus** (`.mks`) with familiar markup. Inline math $E = mc^2$ and
display math:

$$
\\int_0^1 x^2 \\, dx = \\frac{{1}}{{3}}
$$
{{#eq:integral}}

Prior work established the foundations [@einstein1905]. See @eq:integral for the integral.

# Methods

::: theorem
The empty set is a subset of every set.
:::

::: proof
Let $A$ be any set. For all $x \\in \\emptyset$, we have $x \\in A$ vacuously.
:::

# Results

| Method | Score |
|--------|-------|
| Baseline | 0.72 |
| Ours | 0.91 |

: Table: Comparison on the benchmark dataset {{#tbl:results}}

Our approach improves over the baseline (@tbl:results).

# Conclusion

Drop raw LaTeX when needed:

```latex
% \\usepackage{{tikz}}  % uncomment in generated .tex if you add packages
```

Happy writing.
"""

_STARTER_BIB = """@article{{einstein1905,
  author  = {{Albert Einstein}},
  title   = {{On the Electrodynamics of Moving Bodies}},
  journal = {{Annalen der Physik}},
  year    = {{1905}},
  volume  = {{322}},
  number  = {{10}},
  pages   = {{891--921}}
}}
"""


if __name__ == "__main__":
    main()
