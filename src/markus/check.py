"""Pre-build diagnostics: unknown refs/citations, missing figures, unsupported glyphs."""

from __future__ import annotations

import re
from pathlib import Path

from markus.ast import (
    Block,
    BlockQuote,
    Cite,
    CiteGroup,
    Document,
    Emphasis,
    Environment,
    Figure,
    FootnoteRef,
    Heading,
    Inline,
    ListBlock,
    MathBlock,
    Paragraph,
    Ref,
    Span,
    Strikeout,
    Strong,
    Table,
)
from markus.latex import UNICODE_MAP

BIB_KEY_RE = re.compile(r"@\w+\s*\{\s*([^,\s{}]+)\s*,")


def _qual(kind: str, label: str | None) -> str | None:
    if not label:
        return None
    return label if ":" in label else f"{kind}:{label}"


def _walk_inlines(nodes: list[Inline], line: int | None, refs, cites, fnotes) -> None:
    for n in nodes:
        if isinstance(n, Ref):
            refs.append((f"{n.kind}:{n.label}", line))
        elif isinstance(n, Cite):
            cites.append((n.key, line))
        elif isinstance(n, CiteGroup):
            cites.extend((k, line) for k in n.keys)
        elif isinstance(n, FootnoteRef):
            fnotes.append((n.key, line))
        elif isinstance(n, (Strong, Emphasis, Strikeout, Span)):
            _walk_inlines(n.children, line, refs, cites, fnotes)


def _walk_blocks(blocks: list[Block], labels, refs, cites, fnotes, figures) -> None:
    for b in blocks:
        if isinstance(b, Heading):
            ql = _qual("sec", b.label)
            if ql:
                labels.add(ql)
        elif isinstance(b, MathBlock):
            ql = _qual("eq", b.label)
            if ql:
                labels.add(ql)
        elif isinstance(b, Figure):
            ql = _qual("fig", b.label)
            if ql:
                labels.add(ql)
            figures.append((b.path, b.line))
        elif isinstance(b, Table):
            ql = _qual("tbl", b.label)
            if ql:
                labels.add(ql)
            for cells in [b.headers, *b.rows]:
                for cell in cells:
                    _walk_inlines(cell, b.line, refs, cites, fnotes)
        elif isinstance(b, Paragraph):
            _walk_inlines(b.inlines, b.line, refs, cites, fnotes)
        elif isinstance(b, (BlockQuote, Environment)):
            _walk_blocks(b.blocks, labels, refs, cites, fnotes, figures)
        elif isinstance(b, ListBlock):
            for item in b.items:
                _walk_inlines(item.inlines, b.line, refs, cites, fnotes)
                _walk_blocks(item.children, labels, refs, cites, fnotes, figures)


def check_document(doc: Document, source_text: str, source_path: Path) -> list[str]:
    """Return human-readable warnings; never raises."""
    warnings: list[str] = []
    name = source_path.name

    labels: set[str] = set()
    refs: list[tuple[str, int | None]] = []
    cites: list[tuple[str, int | None]] = []
    fnotes: list[tuple[str, int | None]] = []
    figures: list[tuple[str, int | None]] = []
    _walk_blocks(doc.blocks, labels, refs, cites, fnotes, figures)

    def loc(line: int | None) -> str:
        return f"{name}:{line}" if line else name

    for target, line in refs:
        if target not in labels:
            warnings.append(f"{loc(line)}: reference to unknown label '@{target}'")

    bib = doc.meta.get("bib") or doc.meta.get("bibliography")
    if cites:
        if not bib:
            keys = ", ".join(sorted({k for k, _ in cites})[:5])
            warnings.append(
                f"{name}: citations used ({keys}) but no 'bib:' in front matter "
                "— they will appear as [?]"
            )
        else:
            bib_path = (source_path.parent / str(bib)).resolve()
            if not bib_path.is_file():
                warnings.append(f"{name}: bibliography file not found: {bib}")
            else:
                bib_keys = set(BIB_KEY_RE.findall(bib_path.read_text(encoding="utf-8", errors="replace")))
                for key, line in cites:
                    if key not in bib_keys:
                        warnings.append(
                            f"{loc(line)}: citation key '{key}' not found in {bib}"
                        )

    for path, line in figures:
        if re.match(r"^[a-z]+://", path):
            continue
        fig_path = source_path.parent / path
        if not fig_path.is_file():
            warnings.append(f"{loc(line)}: figure file not found: {path}")

    for key, line in fnotes:
        if key not in doc.footnotes:
            warnings.append(f"{loc(line)}: footnote [^{key}] has no definition")

    # glyphs pdflatex cannot typeset and markus does not map
    reported: set[str] = set()
    in_fence = False
    for idx, src_line in enumerate(source_text.splitlines(), start=1):
        if re.match(r"^\s*(`{3,}|~{3,})", src_line):
            in_fence = not in_fence
        for ch in src_line:
            if (
                ord(ch) >= 0x2000
                and ch not in UNICODE_MAP
                and ch not in reported
            ):
                reported.add(ch)
                warnings.append(
                    f"{name}:{idx}: character '{ch}' (U+{ord(ch):04X}) is not "
                    "supported by pdflatex and will be dropped"
                )
    return warnings
