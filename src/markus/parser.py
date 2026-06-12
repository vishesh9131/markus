"""Parse Markus (.mks) into a document AST."""

from __future__ import annotations

import re
from typing import Any

import yaml

from markus.ast import (
    Block,
    BlockQuote,
    Cite,
    CiteGroup,
    Code,
    CodeBlock,
    Document,
    Emphasis,
    Environment,
    Figure,
    FootnoteDef,
    FootnoteRef,
    Heading,
    HorizontalRule,
    Inline,
    LineBreak,
    Link,
    ListBlock,
    ListItem,
    MathBlock,
    MathInline,
    Paragraph,
    RawLatex,
    Ref,
    Strikeout,
    Strong,
    Table,
    Text,
)


class MarkusParseError(ValueError):
    """A user-facing parse error with location info."""


FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*(?:\n|$)", re.DOTALL)
ATTR_RE = re.compile(r"\{([^}]*)\}\s*$")
LABEL_ATTR_RE = re.compile(r"#(?:(?:eq|fig|sec|tbl):)?([\w:-]+)")
WIDTH_ATTR_RE = re.compile(r"width\s*=\s*([^\s,}]+)")
FIGURE_RE = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)(?:\s*\{([^}]*)\})?\s*$")
HEADING_RE = re.compile(
    r"^(#{1,6})\s+(.+?)(?:\s*\{#(?:(?:eq|fig|sec|tbl):)?([\w:-]+)\})?\s*$"
)
FENCE_OPEN_RE = re.compile(r"^(`{3,}|~{3,})\s*([A-Za-z0-9_+#.-]*)\s*(\{[^}]*\})?\s*$")
TABLE_SEP_RE = re.compile(r"^\|?[\s:|-]+\|[\s|:-]*\s*$")
ENV_OPEN_RE = re.compile(r"^:::\s*(\w+)(?:\s+(.+))?\s*$")
ENV_CLOSE_RE = re.compile(r"^:::\s*$")
HRULE_RE = re.compile(r"^(-{3,}|\*{3,}|_{3,})\s*$")
LIST_ITEM_RE = re.compile(r"^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$")
TASK_MARK_RE = re.compile(r"^\[([ xX])\]\s+(.*)$")
FOOTNOTE_DEF_RE = re.compile(r"^\[\^([\w-]+)\]:\s+(.*)$")
PAGE_BREAK_RE = re.compile(r"^\\(newpage|clearpage|pagebreak)\s*$")
HARD_BREAK_RE = re.compile(r"(\\\\|[ ]{2,})$")


def parse(source: str, path: str | None = None) -> Document:
    meta: dict[str, Any] = {}
    body = source
    offset = 0
    m = FRONT_MATTER_RE.match(source)
    if m:
        try:
            meta = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError as exc:
            mark = getattr(exc, "problem_mark", None)
            line = mark.line + 2 if mark else 1
            problem = getattr(exc, "problem", None) or "syntax error"
            raise MarkusParseError(
                f"{path or 'document'}:{line}: invalid YAML front matter: {problem}\n"
                "hint: in double-quoted YAML strings, backslash is an escape "
                "character. Use single quotes for LaTeX, e.g.\n"
                "  title: 'A $O(n \\log n)$ Study'"
            ) from exc
        if not isinstance(meta, dict):
            raise MarkusParseError(
                f"{path or 'document'}: front matter must be a YAML mapping"
            )
        body = source[m.end() :]
        offset = source[: m.end()].count("\n")

    preserve_breaks = bool(meta.get("preserve-breaks")) or str(
        meta.get("template", "")
    ).strip().lower() in {"letter", "notice"}

    blocks = _parse_blocks(body.splitlines(), offset=offset, preserve_breaks=preserve_breaks)

    footnotes: dict[str, list[Inline]] = {}
    _collect_footnotes(blocks, footnotes)
    return Document(meta=meta, blocks=blocks, footnotes=footnotes)


def _collect_footnotes(blocks: list[Block], out: dict[str, list[Inline]]) -> None:
    for b in blocks:
        if isinstance(b, FootnoteDef):
            out[b.key] = b.inlines
        elif isinstance(b, (BlockQuote, Environment)):
            _collect_footnotes(b.blocks, out)
        elif isinstance(b, ListBlock):
            for item in b.items:
                _collect_footnotes(item.children, out)


def _parse_blocks(
    lines: list[str], offset: int = 0, preserve_breaks: bool = False
) -> list[Block]:
    blocks: list[Block] = []
    i = 0
    n = len(lines)

    def lineno(idx: int) -> int:
        return offset + idx + 1

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # HTML-style comment (block form, possibly multi-line)
        if stripped.startswith("<!--"):
            while i < n and "-->" not in lines[i]:
                i += 1
            if i < n:
                i += 1
            continue

        # fenced block (``` or ~~~, optional language and ignored {attrs})
        fence_m = FENCE_OPEN_RE.match(stripped)
        if fence_m:
            start_line = lineno(i)
            fence = fence_m.group(1)
            close_re = re.compile(rf"^{re.escape(fence[0])}{{{len(fence)},}}\s*$")
            lang = fence_m.group(2) or None
            i += 1
            chunk: list[str] = []
            while i < n and not close_re.match(lines[i].strip()):
                chunk.append(lines[i])
                i += 1
            if i < n:
                i += 1
            code = "\n".join(chunk)
            if lang and lang.lower() in {"latex", "tex"} :
                blocks.append(RawLatex(content=code, line=start_line))
            else:
                blocks.append(CodeBlock(code=code, language=lang, line=start_line))
            continue

        # environment (theorem / proof / callouts)
        env_m = ENV_OPEN_RE.match(stripped)
        if env_m:
            start_line = lineno(i)
            kind = env_m.group(1).lower()
            title = env_m.group(2)
            i += 1
            inner_start = i
            depth = 1
            inner_lines: list[str] = []
            while i < n:
                s = lines[i].strip()
                if ENV_OPEN_RE.match(s):
                    depth += 1
                elif ENV_CLOSE_RE.match(s):
                    depth -= 1
                    if depth == 0:
                        break
                inner_lines.append(lines[i])
                i += 1
            if i < n:
                i += 1
            inner = _parse_blocks(
                inner_lines, offset=offset + inner_start, preserve_breaks=preserve_breaks
            )
            blocks.append(Environment(kind=kind, title=title, blocks=inner, line=start_line))
            continue

        # display math (single or multi-line), label inline or on next line
        if stripped.startswith("$$"):
            start_line = lineno(i)
            latex_lines: list[str] = []
            label: str | None = None
            rest = stripped[2:]
            closed = False
            # single-line $$...$$ or $$...$$ {#eq:id}
            single = re.match(r"^\$\$(.+?)\$\$\s*(\{[^}]*\})?\s*$", stripped)
            if single:
                latex_lines.append(single.group(1).strip())
                if single.group(2):
                    label = _pull_label(single.group(2))
                i += 1
                closed = True
            else:
                if rest.strip():
                    latex_lines.append(rest.strip())
                i += 1
                while i < n:
                    end_m = re.match(r"^(.*)\$\$\s*(\{[^}]*\})?\s*$", lines[i])
                    if end_m is not None and "$$" in lines[i]:
                        if end_m.group(1).strip():
                            latex_lines.append(end_m.group(1))
                        if end_m.group(2):
                            label = _pull_label(end_m.group(2))
                        i += 1
                        closed = True
                        break
                    latex_lines.append(lines[i])
                    i += 1
            latex = "\n".join(latex_lines).strip()
            if closed and label is None and i < n:
                nl_label = _pull_label(lines[i])
                if nl_label and lines[i].strip().startswith("{"):
                    label = nl_label
                    i += 1
            blocks.append(MathBlock(latex=latex, label=label, line=start_line))
            continue

        # figure
        fig_m = FIGURE_RE.match(stripped)
        if fig_m:
            caption, path, attrs = fig_m.group(1), fig_m.group(2), fig_m.group(3) or ""
            label, width = _parse_attrs(attrs)
            blocks.append(
                Figure(path=path, caption=caption, label=label, width=width, line=lineno(i))
            )
            i += 1
            continue

        # heading
        h_m = HEADING_RE.match(stripped)
        if h_m and not HRULE_RE.match(stripped):
            level = len(h_m.group(1))
            text = h_m.group(2).strip()
            label = h_m.group(3)
            blocks.append(Heading(level=level, text=text, label=label, line=lineno(i)))
            i += 1
            continue

        # horizontal rule
        if HRULE_RE.match(stripped):
            blocks.append(HorizontalRule(line=lineno(i)))
            i += 1
            continue

        # explicit page-break commands pass through
        if PAGE_BREAK_RE.match(stripped):
            blocks.append(RawLatex(content=stripped, line=lineno(i)))
            i += 1
            continue

        # footnote definition
        fn_m = FOOTNOTE_DEF_RE.match(stripped)
        if fn_m:
            start_line = lineno(i)
            key = fn_m.group(1)
            parts = [fn_m.group(2)]
            i += 1
            while i < n and lines[i].strip() and lines[i].startswith(("    ", "\t")):
                parts.append(lines[i].strip())
                i += 1
            blocks.append(
                FootnoteDef(key=key, inlines=_parse_inlines(" ".join(parts)), line=start_line)
            )
            continue

        # blockquote
        if stripped.startswith(">"):
            start_line = lineno(i)
            quoted: list[str] = []
            while i < n and lines[i].strip().startswith(">"):
                quoted.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            inner = _parse_blocks(quoted, offset=start_line - 1, preserve_breaks=preserve_breaks)
            blocks.append(BlockQuote(blocks=inner, line=start_line))
            continue

        # table
        if "|" in stripped and stripped.startswith("|"):
            table, i = _parse_table(lines, i, lineno(i))
            blocks.append(table)
            continue

        # list
        if LIST_ITEM_RE.match(line) and not HRULE_RE.match(stripped):
            lst, i = _parse_list(lines, i)
            blocks.append(lst)
            continue

        # paragraph (possibly multiple lines until blank or new block)
        start_line = lineno(i)
        para_parts: list[str] = []
        while i < n and lines[i].strip() and not (para_parts and _starts_block(lines[i])):
            raw = lines[i].rstrip("\n")
            text = raw.strip()
            hard = bool(HARD_BREAK_RE.search(raw)) or preserve_breaks
            if hard:
                text = HARD_BREAK_RE.sub("", raw).strip()
            para_parts.append(text + ("\n" if hard else " "))
            i += 1
        para_text = "".join(para_parts)
        # trailing separator from the last line is not a break
        para_text = para_text.rstrip("\n ").strip()
        inlines = _parse_inlines(para_text)
        if inlines:
            blocks.append(Paragraph(inlines=inlines, line=start_line))

    return blocks


def _starts_block(line: str) -> bool:
    s = line.strip()
    if not s:
        return True
    if FENCE_OPEN_RE.match(s) or s.startswith(":::") or s.startswith("$$"):
        return True
    if s.startswith("#") or s.startswith(">") or s.startswith("<!--"):
        return True
    if HRULE_RE.match(s) or PAGE_BREAK_RE.match(s):
        return True
    if FIGURE_RE.match(s) or FOOTNOTE_DEF_RE.match(s):
        return True
    if s.startswith("|"):
        return True
    if LIST_ITEM_RE.match(line):
        return True
    return False


def _pull_label(line: str) -> str | None:
    m = ATTR_RE.search(line.strip())
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


# --- tables ---


def _split_table_row(line: str) -> list[str]:
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    parts = re.split(r"(?<!\\)\|", s)
    return [p.replace("\\|", "|").strip() for p in parts]


def _parse_aligns(sep_line: str, ncols: int) -> list[str]:
    aligns: list[str] = []
    for cell in _split_table_row(sep_line):
        cell = cell.strip()
        left = cell.startswith(":")
        right = cell.endswith(":")
        if left and right:
            aligns.append("c")
        elif right:
            aligns.append("r")
        else:
            aligns.append("l")
    while len(aligns) < ncols:
        aligns.append("l")
    return aligns[:ncols]


def _parse_table(lines: list[str], start: int, start_line: int) -> tuple[Table, int]:
    i = start
    header_cells = _split_table_row(lines[i])
    ncols = len(header_cells)
    i += 1
    aligns = ["l"] * ncols
    if i < len(lines) and TABLE_SEP_RE.match(lines[i].strip()) and "-" in lines[i]:
        aligns = _parse_aligns(lines[i], ncols)
        i += 1
    raw_rows: list[list[str]] = []
    while i < len(lines) and lines[i].strip().startswith("|"):
        cells = _split_table_row(lines[i])
        # normalize row length to the header
        if len(cells) < ncols:
            cells = cells + [""] * (ncols - len(cells))
        elif len(cells) > ncols:
            cells = cells[: ncols - 1] + [" ".join(cells[ncols - 1 :])]
        raw_rows.append(cells)
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
            attr_m = ATTR_RE.search(caption)
            if attr_m:
                label = _pull_label(caption)
                caption = ATTR_RE.sub("", caption).strip()
            i += 1
            if label is None and i < len(lines):
                label = _pull_label(lines[i])
                if label is not None and lines[i].strip().startswith("{"):
                    i += 1
                else:
                    label = None
    headers = [_parse_inlines(c) for c in header_cells]
    rows = [[_parse_inlines(c) for c in row] for row in raw_rows]
    return (
        Table(
            headers=headers,
            rows=rows,
            aligns=aligns,
            caption=caption,
            label=label,
            line=start_line,
        ),
        i,
    )


# --- lists ---


def _item_indent(line: str) -> int:
    m = LIST_ITEM_RE.match(line)
    return len(m.group(1).expandtabs(4)) if m else -1


def _parse_list(lines: list[str], start: int) -> tuple[ListBlock, int]:
    base_indent = _item_indent(lines[start])
    first_marker = LIST_ITEM_RE.match(lines[start]).group(2)
    ordered = first_marker[0].isdigit()

    items: list[ListItem] = []
    pending_text: list[str] = []
    pending_checked: bool | None = None
    pending_children: list[Block] = []

    def flush() -> None:
        nonlocal pending_text, pending_checked, pending_children
        if pending_text or pending_children:
            items.append(
                ListItem(
                    inlines=_parse_inlines(" ".join(pending_text)),
                    checked=pending_checked,
                    children=pending_children,
                )
            )
        pending_text = []
        pending_checked = None
        pending_children = []

    i = start
    n = len(lines)
    while i < n:
        line = lines[i]
        s = line.strip()
        if not s:
            # blank line: list continues only if next non-blank is an item/continuation
            j = i + 1
            while j < n and not lines[j].strip():
                j += 1
            if j < n and (
                _item_indent(lines[j]) >= base_indent
                or (len(lines[j]) - len(lines[j].lstrip())) > base_indent
            ):
                i = j
                continue
            break
        m = LIST_ITEM_RE.match(line)
        if m:
            indent = _item_indent(line)
            if indent < base_indent:
                break
            if indent > base_indent:
                child, i = _parse_list(lines, i)
                pending_children.append(child)
                continue
            if m.group(2)[0].isdigit() != ordered:
                # marker type changed at the same level: a new list starts here
                break
            flush()
            content = m.group(3)
            task_m = TASK_MARK_RE.match(content)
            if task_m:
                pending_checked = task_m.group(1).lower() == "x"
                content = task_m.group(2)
            pending_text.append(content)
            i += 1
            continue
        # continuation line (indented beyond the marker)
        cont_indent = len(line) - len(line.lstrip())
        if cont_indent > base_indent:
            pending_text.append(s)
            i += 1
            continue
        break
    flush()
    return ListBlock(ordered=ordered, items=items), i


# --- inline parsing ---

_ESCAPABLE = r"\\`*_{}\[\]()#+\-.!$@~|^%<>\""

_INLINE_PATTERNS = [
    ("escape", re.compile(rf"\\([{_ESCAPABLE}])")),
    ("comment", re.compile(r"<!--.*?-->", re.DOTALL)),
    ("break", re.compile(r"\n")),
    ("code", re.compile(r"`([^`]+)`")),
    ("footnote", re.compile(r"\[\^([\w-]+)\]")),
    ("citegroup", re.compile(r"\[@([^\]]+)\]")),
    ("ref", re.compile(r"@(fig|eq|sec|tbl):([\w:-]+)")),
    ("cite", re.compile(r"(?<![\w.@-])@([A-Za-z][\w:-]*)")),
    ("math", re.compile(r"\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)")),
    ("link", re.compile(r"\[([^\]]+)\]\(([^)]+)\)")),
    ("strong", re.compile(r"\*\*((?:[^*]|\*(?!\*))+)\*\*")),
    ("strike", re.compile(r"~~([^~]+)~~")),
    ("emph", re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")),
]


def parse_inlines(text: str) -> list[Inline]:
    """Public inline parser (used by the LaTeX emitter for headings/captions)."""
    return _parse_inlines(text)


def _parse_inlines(text: str) -> list[Inline]:
    if not text:
        return []
    # strip trailing attribute block from paragraph text
    text = ATTR_RE.sub("", text).rstrip()

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
        if kind == "escape":
            nodes.append(Text(value=m.group(1)))
        elif kind == "comment":
            pass
        elif kind == "break":
            nodes.append(LineBreak())
        elif kind == "footnote":
            nodes.append(FootnoteRef(key=m.group(1)))
        elif kind == "citegroup":
            keys = [
                k.strip().lstrip("@")
                for k in re.split(r"[;,]", m.group(1))
                if k.strip()
            ]
            if len(keys) == 1:
                nodes.append(Cite(key=keys[0]))
            else:
                nodes.append(CiteGroup(keys=keys))
        elif kind == "ref":
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
        elif kind == "strike":
            nodes.append(Strikeout(children=_parse_inlines(m.group(1))))
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
