"""Markus CLI: build .mks manuscripts to LaTeX and PDF."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import click

from markus import __version__
from markus.latex import write_tex
from markus.parser import parse
from markus.templates_registry import list_templates, resolve_template
from markus.texpath import find_latexmk, latex_env_for_template

DEFAULT_TEMPLATE = "article"


def _compile_pdf(tex_path: Path, out_dir: Path, template: str | None = None) -> None:
    latexmk = find_latexmk()
    if not latexmk:
        raise click.ClickException(
            "latexmk not found. Install MacTeX or TeX Live, or set MARKUS_TEX_BIN "
            "to your tex bin folder (e.g. /Library/TeX/texbin)."
        )
    cmd = [
        latexmk,
        "-pdf",
        "-interaction=nonstopmode",
        "-g",
        f"-outdir={out_dir}",
        str(tex_path.resolve()),
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=latex_env_for_template(template),
    )
    pdf_path = out_dir / f"{tex_path.stem}.pdf"
    if result.returncode != 0:
        if pdf_path.exists():
            click.echo(
                "LaTeX finished with warnings; PDF was still written.",
                err=True,
            )
        else:
            click.echo(result.stdout, err=True)
            click.echo(result.stderr, err=True)
            raise click.ClickException(f"LaTeX build failed for {tex_path.name}")


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
def build(
    source: Path,
    out_dir: Path | None,
    template: str | None,
    tex_only: bool,
    pdf: bool,
) -> None:
    """Compile a .mks file to .tex and optionally PDF."""
    if source.suffix != ".mks":
        click.echo(f"Warning: expected .mks extension, got {source.suffix}", err=True)

    text = source.read_text(encoding="utf-8")
    doc = parse(text, path=str(source))
    tpl_name = template or doc.meta.get("template")
    if tpl_name is None and not doc.meta:
        tpl_name = "notes"
    elif tpl_name is None:
        tpl_name = DEFAULT_TEMPLATE
    try:
        tpl = resolve_template(str(tpl_name)).id
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc
    out = out_dir or source.parent
    out.mkdir(parents=True, exist_ok=True)

    stem = source.stem
    tex_path = out / f"{stem}.tex"
    write_tex(doc, tex_path, template=str(tpl))
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
            click.echo(f"Warning: bibliography not found: {bib_src}", err=True)

    if tex_only or not pdf:
        return

    _compile_pdf(tex_path, out, template=tpl)
    pdf_path = out / f"{stem}.pdf"
    if pdf_path.exists():
        click.echo(f"Wrote {pdf_path}")
    else:
        raise click.ClickException("PDF was not produced — check LaTeX log in output directory")


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

: Table: Comparison on the benchmark dataset
{{#tbl:results}}

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
