"""Emit LaTeX from a Markus document AST."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

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
from markus.templates_registry import TemplateSpec, resolve_template

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

_LISTING_LANGS = frozenset(
    {"python", "py", "java", "c", "cpp", "rust", "go", "sql", "r", "matlab", "latex", "tex"}
)

# ^222 / _12 without braces → ^{222} / _{12} (LaTeX only groups one token after ^/_)
_SCRIPT_OPERAND_RE = re.compile(
    r"([\^_])"  # operator
    r"(?!\{)"  # not already braced
    r"((?:\\[A-Za-z]+(?:\[[^\]]*\])?(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})?)"
    r"|(\d{2,})"  # multi-digit run
    r"|([A-Za-z]{2,}))"  # multi-letter (e.g. subscripts ij)
)


def _normalize_math_scripts(latex: str) -> str:
    """Wrap multi-token ^ and _ operands in braces for correct LaTeX exponents."""

    def _repl(m: re.Match[str]) -> str:
        op = m.group(1)
        body = m.group(2) or m.group(3) or m.group(4) or ""
        if not body:
            return m.group(0)
        return f"{op}{{{body}}}"

    return _SCRIPT_OPERAND_RE.sub(_repl, latex)


def _math_latex(latex: str) -> str:
    return _normalize_math_scripts(latex.strip())

ENV_MAP = {
    "theorem": ("theorem", "Theorem"),
    "lemma": ("lemma", "Lemma"),
    "definition": ("definition", "Definition"),
    "proof": ("proof", "Proof"),
    "remark": ("remark", "Remark"),
    "example": ("example", "Example"),
}


def emit(doc: Document, template: str = "article") -> str:
    spec = resolve_template(template)
    tpl_path = TEMPLATES_DIR / spec.id / "document.tex"
    if not tpl_path.exists():
        raise FileNotFoundError(f"Template '{spec.id}' is missing {tpl_path}")

    skeleton = tpl_path.read_text(encoding="utf-8")
    meta = doc.meta
    title = _meta_str(meta, "title", "Untitled")
    authors = _format_authors(meta.get("author", meta.get("authors", "Author")), spec)
    abstract_raw = _meta_str(meta, "abstract", "").strip()
    body = "\n\n".join(_emit_block(b, spec) for b in doc.blocks)

    bib_block = _emit_bibliography(meta, spec)

    replacements = {
        "% MARKUS_TITLE %": _latex_escape(title),
        "% MARKUS_AUTHORS %": authors,
        "% MARKUS_ABSTRACT %": _emit_abstract_standard(abstract_raw),
        "% MARKUS_ABSTRACT_RAW %": abstract_raw,
        "% MARKUS_KEYWORDS %": _emit_keywords_ieee(meta),
        "% MARKUS_KEYWORDS_ACM %": _emit_keywords_acm(meta),
        "% MARKUS_ACM_META %": _emit_acm_meta(meta),
        "% MARKUS_BODY %": body,
        "% MARKUS_BIB %": bib_block,
    }

    out = skeleton
    for key, val in replacements.items():
        out = out.replace(key, val)
    return out


def _emit_bibliography(meta: dict[str, Any], spec: TemplateSpec) -> str:
    bib = meta.get("bib") or meta.get("bibliography")
    if not bib:
        return ""
    style = _meta_str(meta, "bibstyle", spec.default_bibstyle)
    stem = Path(str(bib)).stem
    if spec.author_mode == "acm":
        return f"\\bibliographystyle{{{_escape_key(style)}}}\n\\bibliography{{{_escape_key(stem)}}}"
    return (
        f"\\bibliographystyle{{{_escape_key(style)}}}\n"
        f"\\bibliography{{{_escape_key(stem)}}}"
    )


def _meta_str(meta: dict[str, Any], key: str, default: str) -> str:
    v = meta.get(key, default)
    return str(v) if v is not None else default


def _format_authors(raw: Any, spec: TemplateSpec) -> str:
    if spec.author_mode == "ieee":
        return _format_authors_ieee(raw)
    if spec.author_mode == "acm":
        return _format_authors_acm(raw)
    return _format_authors_standard(raw)


def _format_authors_standard(raw: Any) -> str:
    if raw is None:
        return "\\author{Author}"
    if isinstance(raw, str):
        return f"\\author{{{_latex_escape(raw)}}}"
    blocks: list[str] = []
    for entry in raw:
        if isinstance(entry, str):
            blocks.append(f"\\author{{{_latex_escape(entry)}}}")
        elif isinstance(entry, dict):
            name = entry.get("name", "Author")
            affil = entry.get("affiliation") or entry.get("affil")
            email = entry.get("email")
            part = _latex_escape(str(name))
            if affil:
                part += f"\\\\\n\\textit{{{_latex_escape(str(affil))}}}"
            if email:
                part += f"\\\\\n\\texttt{{{_latex_escape(str(email))}}}"
            blocks.append(f"\\author{{{part}}}")
        else:
            blocks.append(f"\\author{{{_latex_escape(str(entry))}}}")
    return "\n".join(blocks)


def _format_authors_ieee(raw: Any) -> str:
    if raw is None:
        return (
            "\\author{\\IEEEauthorblockN{Author}\\IEEEauthorblockA{Affiliation}}"
        )
    entries: list[Any]
    if isinstance(raw, str):
        entries = [raw]
    elif isinstance(raw, list):
        entries = raw
    else:
        entries = [raw]

    blocks: list[str] = []
    for entry in entries:
        if isinstance(entry, str):
            blocks.append(
                f"\\IEEEauthorblockN{{{_latex_escape(entry)}}}"
                f"\\IEEEauthorblockA{{}}"
            )
        elif isinstance(entry, dict):
            name = _latex_escape(str(entry.get("name", "Author")))
            affil = entry.get("affiliation") or entry.get("affil") or ""
            email = entry.get("email") or ""
            dept = entry.get("department") or ""
            lines = [x for x in (dept, affil, email) if x]
            affil_tex = "\\\\\n".join(_latex_escape(str(x)) for x in lines)
            blocks.append(
                f"\\IEEEauthorblockN{{{name}}}\n\\IEEEauthorblockA{{{affil_tex}}}"
            )
        else:
            blocks.append(
                f"\\IEEEauthorblockN{{{_latex_escape(str(entry))}}}"
                f"\\IEEEauthorblockA{{}}"
            )
    inner = "\n\\and\n".join(blocks)
    return f"\\author{{\n{inner}\n}}"


def _format_authors_acm(raw: Any) -> str:
    if raw is None:
        return "\\author{Author}"
    if isinstance(raw, str):
        return f"\\author{{{_latex_escape(raw)}}}"
    blocks: list[str] = []
    for entry in raw:
        if isinstance(entry, str):
            blocks.append(f"\\author{{{_latex_escape(entry)}}}")
        elif isinstance(entry, dict):
            name = _latex_escape(str(entry.get("name", "Author")))
            affil = entry.get("affiliation") or entry.get("affil")
            email = entry.get("email")
            orcid = entry.get("orcid")
            attrs = []
            if affil:
                attrs.append(f"affiliation={{{_latex_escape(str(affil))}}}")
            if email:
                attrs.append(f"email={{{_latex_escape(str(email))}}}")
            if orcid:
                attrs.append(f"orcid={{{_latex_escape(str(orcid))}}}")
            if attrs:
                blocks.append(f"\\author[{', '.join(attrs)}]{{{name}}}")
            else:
                blocks.append(f"\\author{{{name}}}")
        else:
            blocks.append(f"\\author{{{_latex_escape(str(entry))}}}")
    return "\n".join(blocks)


def _emit_acm_meta(meta: dict[str, Any]) -> str:
    lines: list[str] = []
    for key in ("acm-journal", "acm-volume", "acm-number", "acm-article", "acm-year"):
        if key in meta:
            lines.append(f"\\{key.replace('acm-', '')}{{{_latex_escape(str(meta[key]))}}}")
    if "ccs" in meta:
        lines.append(str(meta["ccs"]))
    if "acm-subject" in meta:
        lines.append(f"\\keywords{{{_latex_escape(str(meta['acm-subject']))}}}")
    return "\n".join(lines)


def _emit_keywords_ieee(meta: dict[str, Any]) -> str:
    kw = meta.get("keywords")
    if not kw:
        return ""
    if isinstance(kw, str):
        items = [k.strip() for k in kw.split(",") if k.strip()]
    else:
        items = [str(k) for k in kw]
    if not items:
        return ""
    body = ", ".join(_latex_escape(k) for k in items)
    return f"\\begin{{IEEEkeywords}}\n{body}\n\\end{{IEEEkeywords}}\n"


def _emit_keywords_acm(meta: dict[str, Any]) -> str:
    kw = meta.get("keywords")
    if not kw:
        return ""
    if isinstance(kw, str):
        items = [k.strip() for k in kw.split(",") if k.strip()]
    else:
        items = [str(k) for k in kw]
    if not items:
        return ""
    body = ", ".join(_latex_escape(k) for k in items)
    return f"\\keywords{{{body}}}\n"


def _emit_abstract_standard(text: str) -> str:
    if not text.strip():
        return ""
    return f"\\begin{{abstract}}\n{text.strip()}\n\\end{{abstract}}\n"


def _qual_label(kind: str, label: str | None) -> str | None:
    if not label:
        return None
    if ":" in label:
        return label
    return f"{kind}:{label}"


def _sanitize_verbatim(text: str) -> str:
    repl = {
        "→": "->",
        "←": "<-",
        "—": "--",
        "–": "-",
        "…": "...",
        "\u201c": '"',
        "\u201d": '"',
        "\u2018": "'",
        "\u2019": "'",
    }
    out = text
    for src, dst in repl.items():
        out = out.replace(src, dst)
    return out


def _emit_code_block(block: CodeBlock) -> str:
    code = _sanitize_verbatim(block.code)
    lang = (block.language or "").lower()
    if lang in _LISTING_LANGS:
        return f"\\begin{{lstlisting}}[language={lang}]\n{code}\n\\end{{lstlisting}}"
    return f"\\begin{{verbatim}}\n{code}\n\\end{{verbatim}}"


def _emit_block(block: Block, spec: TemplateSpec | None = None) -> str:
    if isinstance(block, Heading):
        cmd = {1: "section", 2: "subsection", 3: "subsubsection"}.get(
            block.level, "paragraph"
        )
        out = f"\\{cmd}{{{_latex_escape(block.text)}}}"
        ql = _qual_label("sec", block.label)
        if ql:
            out += f"\n\\label{{{ql}}}"
        return out

    if isinstance(block, Paragraph):
        return _emit_inlines(block.inlines)

    if isinstance(block, MathBlock):
        out = f"\\begin{{equation}}\n{_math_latex(block.latex)}\n\\end{{equation}}"
        ql = _qual_label("eq", block.label)
        if ql:
            out += f"\n\\label{{{ql}}}"
        return out

    if isinstance(block, Figure):
        default_w = r"0.8\columnwidth" if spec and spec.columns >= 2 else r"0.8\textwidth"
        width = block.width or default_w
        if (
            not width.startswith("\\")
            and "textwidth" not in width
            and "columnwidth" not in width
            and width.replace(".", "").isdigit()
        ):
            width = f"{width}\\textwidth"
        cap = _latex_escape(block.caption) if block.caption else ""
        out = (
            "\\begin{figure}[!t]\n"
            "\\centering\n"
            f"\\includegraphics[width={width}]{{{_escape_path(block.path)}}}\n"
            f"\\caption{{{cap}}}\n"
        )
        ql = _qual_label("fig", block.label)
        if ql:
            out += f"\\label{{{ql}}}\n"
        out += "\\end{figure}"
        return out

    if isinstance(block, CodeBlock):
        return _emit_code_block(block)

    if isinstance(block, RawLatex):
        return block.content

    if isinstance(block, ListBlock):
        env = "enumerate" if block.ordered else "itemize"
        items = "\n".join(f"  \\item {_emit_inlines(item)}" for item in block.items)
        return f"\\begin{{{env}}}\n{items}\n\\end{{{env}}}"

    if isinstance(block, Table):
        cols = len(block.headers)
        align = "l" * cols
        header = " & ".join(_latex_escape(h) for h in block.headers) + r" \\"
        rows = [
            " & ".join(_latex_escape(c) for c in row) + r" \\"
            for row in block.rows
        ]
        out = (
            "\\begin{table}[!t]\n\\centering\n"
            f"\\begin{{tabular}}{{{align}}}\n\\hline\n"
            f"{header}\n\\hline\n"
            + "\n".join(rows)
            + "\n\\hline\n\\end{tabular}\n"
        )
        if block.caption:
            out += f"\\caption{{{_latex_escape(block.caption)}}}\n"
        ql = _qual_label("tbl", block.label)
        if ql:
            out += f"\\label{{{ql}}}\n"
        out += "\\end{table}"
        return out

    if isinstance(block, Environment):
        kind = block.kind.lower()
        if kind == "proof":
            title = f"[{_latex_escape(block.title)}]" if block.title else ""
            inner = "\n\n".join(_emit_block(b, spec) for b in block.blocks)
            return f"\\begin{{proof}}{title}\n{inner}\n\\end{{proof}}"

        env_name, _ = ENV_MAP.get(kind, (kind, kind.title()))
        inner = "\n\n".join(_emit_block(b, spec) for b in block.blocks)
        if block.title:
            return (
                f"\\begin{{{env_name}}}[{_latex_escape(block.title)}]\n"
                f"{inner}\n\\end{{{env_name}}}"
            )
        return f"\\begin{{{env_name}}}\n{inner}\n\\end{{{env_name}}}"

    return ""


def _emit_inlines(nodes: list[Inline]) -> str:
    parts: list[str] = []
    for n in nodes:
        if isinstance(n, Text):
            parts.append(_latex_escape(n.value))
        elif isinstance(n, Strong):
            parts.append(f"\\textbf{{{_emit_inlines(n.children)}}}")
        elif isinstance(n, Emphasis):
            parts.append(f"\\textit{{{_emit_inlines(n.children)}}}")
        elif isinstance(n, Code):
            parts.append(f"\\texttt{{{_latex_escape(n.value)}}}")
        elif isinstance(n, MathInline):
            parts.append(f"${_math_latex(n.latex)}$")
        elif isinstance(n, Cite):
            parts.append(f"\\cite{{{_escape_key(n.key)}}}")
        elif isinstance(n, Ref):
            parts.append(f"\\ref{{{n.kind}:{n.label}}}")
        elif isinstance(n, Link):
            parts.append(f"\\href{{{_latex_escape(n.url)}}}{{{_latex_escape(n.text)}}}")
    return "".join(parts)


def _latex_escape(s: str) -> str:
    repl = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    out = []
    for ch in s:
        out.append(repl.get(ch, ch))
    return "".join(out)


def _escape_path(p: str) -> str:
    return p.replace("\\", "/").replace(" ", r"\ ")


def _escape_key(k: str) -> str:
    return re.sub(r"[^\w:-]", "", k)


def write_tex(doc: Document, out_path: Path, template: str = "article") -> Path:
    tex = emit(doc, template=template)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(tex, encoding="utf-8")
    return out_path
