"""Parse Markus (.mks) into a document AST."""

from __future__ import annotations

import re
from typing import Any

import yaml

from markus.ast import (
    Block,
    Cite,
    Code,
    CodeBlock,
    Document,
    Emphasis,
    Environment,
    Figure,
    Heading,
    Inline,
    Link,
    ListBlock,
    MathBlock,
    MathInline,
    Paragraph,
    RawLatex,
    Ref,
    Strong,
    Table,
    Text,
)

FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*(?:\n|$)", re.DOTALL)
ATTR_RE = re.compile(r"\{([^}]*)\}\s*$")
LABEL_ATTR_RE = re.compile(r"#(?:(?:eq|fig|sec|tbl):)?([\w:-]+)")
WIDTH_ATTR_RE = re.compile(r"width\s*=\s*([^\s,}]+)")
FIGURE_RE = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)(?:\s*\{([^}]*)\})?\s*$")
HEADING_RE = re.compile(
    r"^(#{1,6})\s+(.+?)(?:\s*\{#(?:(?:eq|fig|sec|tbl):)?([\w:-]+)\})?\s*$"
)
FENCE_OPEN_RE = re.compile(r"^```(\w*)\s*$")
TABLE_SEP_RE = re.compile(r"^\|?[\s:-]+\|[\s|:-]+\|?\s*$")
ENV_OPEN_RE = re.compile(r"^:::\s*(\w+)(?:\s+(.+))?\s*$")
ENV_CLOSE_RE = re.compile(r"^:::\s*$")


def parse(source: str, path: str | None = None) -> Document:
    meta: dict[str, Any] = {}
    body = source
    m = FRONT_MATTER_RE.match(source)
    if m:
        meta = yaml.safe_load(m.group(1)) or {}
        if not isinstance(meta, dict):
            raise ValueError(f"{path or 'document'}: front matter must be a YAML mapping")
        body = source[m.end() :]

    blocks = _parse_blocks(body.splitlines())
    return Document(meta=meta, blocks=blocks)


def _parse_blocks(lines: list[str]) -> list[Block]:
    blocks: list[Block] = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # fenced block
        if FENCE_OPEN_RE.match(stripped):
            lang = FENCE_OPEN_RE.match(stripped).group(1) or None
            i += 1
            chunk: list[str] = []
            while i < n and not FENCE_OPEN_RE.match(lines[i].strip()):
                chunk.append(lines[i])
                i += 1
            if i < n:
                i += 1
            code = "\n".join(chunk)
            if lang == "latex":
                blocks.append(RawLatex(content=code))
            else:
                blocks.append(CodeBlock(code=code, language=lang))
            continue

        # environment
        env_m = ENV_OPEN_RE.match(stripped)
        if env_m:
            kind = env_m.group(1).lower()
            title = env_m.group(2)
            i += 1
            inner_lines: list[str] = []
            while i < n and not ENV_CLOSE_RE.match(lines[i].strip()):
                inner_lines.append(lines[i])
                i += 1
            if i < n:
                i += 1
            inner = _parse_blocks(inner_lines)
            blocks.append(Environment(kind=kind, title=title, blocks=inner))
            continue

        # display math (single or multi-line)
        if stripped.startswith("$$"):
            latex_lines: list[str] = []
            rest = stripped[2:]
            if stripped.endswith("$$") and len(stripped) > 4:
                latex_lines.append(stripped[2:-2].strip())
                i += 1
            else:
                if rest.strip():
                    latex_lines.append(rest.strip())
                i += 1
                while i < n:
                    if lines[i].strip().endswith("$$"):
                        latex_lines.append(lines[i].strip()[:-2])
                        i += 1
                        break
                    latex_lines.append(lines[i])
                    i += 1
            latex = "\n".join(latex_lines).strip()
            label = None
            if i < n:
                label = _pull_label(lines[i])
                if label:
                    i += 1
            blocks.append(MathBlock(latex=latex, label=label))
            continue

        # figure
        fig_m = FIGURE_RE.match(stripped)
        if fig_m:
            caption, path, attrs = fig_m.group(1), fig_m.group(2), fig_m.group(3) or ""
            label, width = _parse_attrs(attrs)
            blocks.append(
                Figure(path=path, caption=caption, label=label, width=width)
            )
            i += 1
            continue

        # heading
        h_m = HEADING_RE.match(stripped)
        if h_m:
            level = len(h_m.group(1))
            text = h_m.group(2).strip()
            label = h_m.group(3)
            blocks.append(Heading(level=level, text=text, label=label))
            i += 1
            continue

        # table
        if "|" in stripped and stripped.startswith("|"):
            table, i = _parse_table(lines, i)
            blocks.append(table)
            continue

        # list
        if re.match(r"^[-*+]\s+", stripped) or re.match(r"^\d+\.\s+", stripped):
            lst, i = _parse_list(lines, i)
            blocks.append(lst)
            continue

        # paragraph (possibly multiple lines until blank)
        para_lines: list[str] = [stripped]
        i += 1
        while i < n and lines[i].strip() and not _starts_block(lines[i]):
            para_lines.append(lines[i].strip())
            i += 1
        text = " ".join(para_lines)
        label = _extract_trailing_label(text)
        inlines = _parse_inlines(text)
        blocks.append(Paragraph(inlines=inlines))
        if label:
            # attach label to previous paragraph as sec label - rare; skip for now
            pass

    return blocks


def _starts_block(line: str) -> bool:
    s = line.strip()
    if not s:
        return True
    if s.startswith("```") or s.startswith(":::") or s.startswith("$$"):
        return True
    if s.startswith("#"):
        return True
    if FIGURE_RE.match(s):
        return True
    if s.startswith("|"):
        return True
    if re.match(r"^[-*+]\s+", s) or re.match(r"^\d+\.\s+", s):
        return True
    return False


def _pull_label(line: str) -> str | None:
    m = ATTR_RE.search(line.strip())
    if m:
        lm = LABEL_ATTR_RE.search(m.group(1))
        return lm.group(1) if lm else None
    return None


def _extract_trailing_label(text: str) -> str | None:
    m = ATTR_RE.search(text)
    if m:
        lm = LABEL_ATTR_RE.search(m.group(1))
        return lm.group(1) if lm else None
    return None


def _parse_attrs(attrs: str) -> tuple[str | None, str | None]:
    label = None
    width = None
    if not attrs:
        return label, width
    lm = LABEL_ATTR_RE.search(attrs)
    if lm:
        label = lm.group(1)
    wm = WIDTH_ATTR_RE.search(attrs)
    if wm:
        width = wm.group(1)
    return label, width


def _parse_table(lines: list[str], start: int) -> tuple[Table, int]:
    i = start
    header_cells = _split_table_row(lines[i])
    i += 1
    if i < len(lines) and TABLE_SEP_RE.match(lines[i].strip()):
        i += 1
    rows: list[list[str]] = []
    while i < len(lines) and lines[i].strip().startswith("|"):
        rows.append(_split_table_row(lines[i]))
        i += 1
    while i < len(lines) and not lines[i].strip():
        i += 1
    caption = None
    label = None
    if i < len(lines):
        cap_line = lines[i].strip()
        if cap_line.startswith(":") or cap_line.lower().startswith("table:"):
            caption = cap_line.lstrip(": ").strip()
            if caption.lower().startswith("table:"):
                caption = caption.split(":", 1)[-1].strip()
            i += 1
            if i < len(lines):
                label = _pull_label(lines[i])
                if label:
                    i += 1
    return Table(headers=header_cells, rows=rows, caption=caption, label=label), i


def _split_table_row(line: str) -> list[str]:
    parts = [p.strip() for p in line.strip().strip("|").split("|")]
    return parts


def _parse_list(lines: list[str], start: int) -> tuple[ListBlock, int]:
    i = start
    first = lines[i].strip()
    ordered = bool(re.match(r"^\d+\.", first))
    items: list[list[Inline]] = []
    while i < len(lines):
        s = lines[i].strip()
        if ordered:
            m = re.match(r"^\d+\.\s+(.*)$", s)
        else:
            m = re.match(r"^[-*+]\s+(.*)$", s)
        if not m:
            break
        items.append(_parse_inlines(m.group(1)))
        i += 1
    return ListBlock(ordered=ordered, items=items), i


# --- inline parsing ---

_INLINE_PATTERNS = [
    ("ref", re.compile(r"@(fig|eq|sec|tbl):([\w:-]+)")),
    ("cite", re.compile(r"@([\w:-]+)")),
    ("math", re.compile(r"\$([^$\n]+)\$")),
    ("link", re.compile(r"\[([^\]]+)\]\(([^)]+)\)")),
    ("code", re.compile(r"`([^`]+)`")),
    ("strong", re.compile(r"\*\*([^*]+)\*\*")),
    ("emph", re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")),
]


def _parse_inlines(text: str) -> list[Inline]:
    if not text:
        return []
    # strip trailing attribute block from paragraph text
    text = ATTR_RE.sub("", text).strip()

    nodes: list[Inline] = []
    pos = 0
    while pos < len(text):
        best = None
        best_start = len(text)
        for kind, pat in _INLINE_PATTERNS:
            m = pat.search(text, pos)
            if m and m.start() < best_start:
                best = (kind, m)
                best_start = m.start()
        if best is None:
            nodes.append(Text(value=text[pos:]))
            break
        kind, m = best
        if m.start() > pos:
            nodes.append(Text(value=text[pos : m.start()]))
        if kind == "ref":
            nodes.append(Ref(kind=m.group(1), label=m.group(2)))
        elif kind == "cite":
            nodes.append(Cite(key=m.group(1)))
        elif kind == "math":
            nodes.append(MathInline(latex=m.group(1)))
        elif kind == "link":
            nodes.append(Link(text=m.group(1), url=m.group(2)))
        elif kind == "code":
            nodes.append(Code(value=m.group(1)))
        elif kind == "strong":
            nodes.append(Strong(children=_parse_inlines(m.group(1))))
        elif kind == "emph":
            nodes.append(Emphasis(children=_parse_inlines(m.group(1))))
        pos = m.end()
    return _merge_text(nodes)


def _merge_text(nodes: list[Inline]) -> list[Inline]:
    out: list[Inline] = []
    for n in nodes:
        if out and isinstance(out[-1], Text) and isinstance(n, Text):
            out[-1] = Text(value=out[-1].value + n.value)
        else:
            out.append(n)
    return out
