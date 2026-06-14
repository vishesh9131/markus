"""Emit LaTeX from a Markus document AST."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

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
    MathBlock,
    MathInline,
    MermaidBlock,
    Paragraph,
    RawLatex,
    Ref,
    Span,
    Strikeout,
    Strong,
    Table,
    Text,
)
from markus.parser import parse_inlines
from markus.templates_registry import TemplateSpec, resolve_template

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

# Languages the LaTeX `listings` package actually knows, keyed by common fence names.
_LST_LANG_MAP = {
    "python": "Python",
    "py": "Python",
    "java": "Java",
    "c": "C",
    "cpp": "C++",
    "c++": "C++",
    "csharp": "[Sharp]C",
    "c#": "[Sharp]C",
    "sql": "SQL",
    "r": "R",
    "matlab": "Matlab",
    "octave": "Octave",
    "go": "Go",
    "bash": "bash",
    "sh": "sh",
    "zsh": "bash",
    "shell": "bash",
    "ruby": "Ruby",
    "perl": "Perl",
    "php": "PHP",
    "haskell": "Haskell",
    "fortran": "Fortran",
    "pascal": "Pascal",
    "html": "HTML",
    "xml": "XML",
    "latex": "[LaTeX]TeX",
    "tex": "TeX",
    "awk": "Awk",
    "make": "make",
    "makefile": "make",
    "lisp": "Lisp",
    "prolog": "Prolog",
    "scala": "Scala",
    "erlang": "erlang",
    "vhdl": "VHDL",
    "verilog": "Verilog",
    "ada": "Ada",
}

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


# File-I/O, shell, and obfuscation primitives that have no place in untrusted
# math or raw-LaTeX blocks. Neutralised (→ \relax) only when MARKUS_SANDBOX=1,
# so the public web compiler can't be used to read server files (\input{...}),
# spawn shells, or build those commands dynamically (\csname/\catcode).
_SANDBOX_IO_RE = re.compile(
    r"\\(input|include|subfile|subimport|import|includeonly|InputIfFileExists"
    r"|IfFileExists|openin|openout|read|readline|write|closein|closeout"
    r"|immediate|write18|special|directlua|ShellEscape|RequirePackage|usepackage"
    r"|lstinputlisting|verbatiminput|scantokens|endinput|csname|catcode)"
    r"(?![a-zA-Z@])"
)


def _sandbox_guard(s: str) -> str:
    """Strip dangerous primitives from verbatim passthrough under sandbox mode."""
    if os.environ.get("MARKUS_SANDBOX") == "1":
        return _SANDBOX_IO_RE.sub(r"\\relax ", s)
    return s


def _math_latex(latex: str) -> str:
    return _normalize_math_scripts(_sandbox_guard(latex.strip()))


ENV_MAP = {
    "theorem": "theorem",
    "lemma": "lemma",
    "definition": "definition",
    "remark": "remark",
    "example": "example",
    "corollary": "corollary",
    "proposition": "proposition",
}

# Callout boxes for informal writing; anything unknown also falls back to a callout
# so the build never hits an undefined LaTeX environment.
CALLOUT_TITLES = {
    "note": "Note",
    "warning": "Warning",
    "tip": "Tip",
    "info": "Info",
    "important": "Important",
    "caution": "Caution",
    "danger": "Danger",
    "todo": "TODO",
}

# Plain LaTeX environments that are safe to pass through verbatim.
SAFE_PASSTHROUGH_ENVS = frozenset(
    {"center", "flushleft", "flushright", "quote", "quotation", "verse"}
)


def emit(doc: Document, template: str = "article") -> str:
    spec = resolve_template(template)
    tpl_path = TEMPLATES_DIR / spec.id / "document.tex"
    if not tpl_path.exists():
        raise FileNotFoundError(f"Template '{spec.id}' is missing {tpl_path}")

    skeleton = tpl_path.read_text(encoding="utf-8")
    meta = doc.meta
    em = _Emitter(spec=spec, footnotes=doc.footnotes)

    title = _meta_str(meta, "title", "Untitled")
    authors = _format_authors(meta.get("author", meta.get("authors", "Author")), spec)
    abstract_raw = _meta_str(meta, "abstract", "").strip()
    if spec.kind == "beamer":
        body = _emit_body_beamer(doc.blocks, em)
    else:
        body = "\n\n".join(em.block(b) for b in doc.blocks)
        body = re.sub(r"\n{3,}", "\n\n", body).strip()

    bib_block = _emit_bibliography(meta, spec)
    date = meta.get("date")
    date_tex = em.inline_text(str(date)) if date else r"\today"

    replacements = {
        "% MARKUS_TITLE %": em.inline_text(title),
        "% MARKUS_AUTHORS %": authors,
        "% MARKUS_ABSTRACT %": _emit_abstract_standard(abstract_raw, em),
        "% MARKUS_ABSTRACT_RAW %": em.inline_text(abstract_raw) if abstract_raw else "",
        "% MARKUS_KEYWORDS %": _emit_keywords_ieee(meta),
        "% MARKUS_KEYWORDS_ACM %": _emit_keywords_acm(meta),
        "% MARKUS_KEYWORDS_STANDARD %": _emit_keywords_standard(meta),
        "% MARKUS_ACM_META %": _emit_acm_meta(meta),
        "% MARKUS_DATE %": date_tex,
        "% MARKUS_FROM_BLOCK %": _emit_letter_from(meta, em),
        "% MARKUS_TO_BLOCK %": _emit_letter_to(meta, em),
        "% MARKUS_SUBJECT_LINE %": _emit_letter_subject(meta, em),
        "% MARKUS_COURSE %": em.inline_text(_meta_str(meta, "course", "")),
        "% MARKUS_DUE %": em.inline_text(_meta_str(meta, "due", "")),
        "% MARKUS_BODY %": body,
        "% MARKUS_BIB %": bib_block,
    }

    out = skeleton
    preamble = _markus_preamble(spec)
    if "% MARKUS_PREAMBLE %" in out:
        out = out.replace("% MARKUS_PREAMBLE %", preamble)
    else:
        out = out.replace("\\begin{document}", preamble + "\n\\begin{document}", 1)
    # legacy templates hardcode \date{\today}
    if date and "% MARKUS_DATE %" not in skeleton:
        out = out.replace("\\date{\\today}", f"\\date{{{date_tex}}}", 1)
    for key, val in replacements.items():
        out = out.replace(key, val)
    return out


def _markus_preamble(spec: TemplateSpec) -> str:
    """Definitions every generated document relies on, injected into all templates."""
    lines = [
        "% --- injected by markus ---",
        "\\makeatletter",
        "\\usepackage{graphicx}",
        # acmart sets up its own math fonts (newtxmath defines \Bbbk, \square,
        # ...) late in the preamble, so loading amssymb here would clash
        *([] if spec.author_mode == "acm" else ["\\@ifundefined{square}{\\usepackage{amssymb}}{}"]),
        "\\usepackage{textcomp}",
        "\\usepackage[normalem]{ulem}",
        "\\makeatother",
        "\\providecommand{\\markusopenbox}{\\mbox{$\\square$}}",
        "\\providecommand{\\markuscheckedbox}{\\mbox{\\rlap{\\hspace{0.14em}"
        "\\raisebox{0.12ex}{\\scriptsize$\\checkmark$}}$\\square$}}",
        "\\newenvironment{markuscallout}[1]"
        "{\\par\\medskip\\begin{quote}\\noindent\\textbf{#1:}\\space}"
        "{\\end{quote}\\medskip}",
    ]
    if spec.kind != "beamer":
        # theorem environments for templates that don't define their own;
        # amsthm clashes with classes that define \proof (llncs), so guard it
        lines += [
            "\\makeatletter",
            "\\@ifundefined{proof}{\\usepackage{amsthm}}{}",
            "\\@ifundefined{theorem}{\\newtheorem{theorem}{Theorem}}{}",
            "\\@ifundefined{lemma}{\\newtheorem{lemma}[theorem]{Lemma}}{}",
            "\\@ifundefined{definition}{\\newtheorem{definition}[theorem]{Definition}}{}",
            "\\@ifundefined{remark}{\\newtheorem{remark}[theorem]{Remark}}{}",
            "\\@ifundefined{example}{\\newtheorem{example}[theorem]{Example}}{}",
            "\\@ifundefined{corollary}{\\newtheorem{corollary}[theorem]{Corollary}}{}",
            "\\@ifundefined{proposition}{\\newtheorem{proposition}[theorem]{Proposition}}{}",
            "\\makeatother",
        ]
    if not spec.floats:
        lines.append("\\usepackage{caption}")
    lines.append("% --- end markus preamble ---")
    return "\n".join(lines)


def _emit_body_beamer(blocks: list[Block], em: _Emitter) -> str:
    out: list[str] = []
    open_frame = False
    for b in blocks:
        if isinstance(b, Heading) and b.level == 1:
            if open_frame:
                out.append("\\end{frame}")
                open_frame = False
            out.append(f"\\section{{{em.inline_text(b.text)}}}")
            continue
        if isinstance(b, Heading) and b.level == 2:
            if open_frame:
                out.append("\\end{frame}")
            out.append(f"\\begin{{frame}}[fragile]{{{em.inline_text(b.text)}}}")
            open_frame = True
            continue
        if not open_frame:
            out.append("\\begin{frame}[fragile]")
            open_frame = True
        out.append(em.block(b))
    if open_frame:
        out.append("\\end{frame}")
    return "\n\n".join(out)


def _emit_bibliography(meta: dict[str, Any], spec: TemplateSpec) -> str:
    bib = meta.get("bib") or meta.get("bibliography")
    if not bib:
        return ""
    style = _meta_str(meta, "bibstyle", spec.default_bibstyle)
    stem = Path(str(bib)).stem
    return (
        f"\\bibliographystyle{{{_escape_key(style)}}}\n"
        f"\\bibliography{{{_escape_key(stem)}}}"
    )


def _meta_str(meta: dict[str, Any], key: str, default: str) -> str:
    v = meta.get(key, default)
    return str(v) if v is not None else default


def _meta_lines(meta: dict[str, Any], *keys: str) -> list[str]:
    for key in keys:
        v = meta.get(key)
        if v:
            return [ln.strip() for ln in str(v).splitlines() if ln.strip()]
    return []


def _emit_letter_from(meta: dict[str, Any], em: _Emitter) -> str:
    lines = _meta_lines(meta, "from", "sender")
    if not lines:
        return ""
    return "\\\\\n".join(em.inline_text(ln) for ln in lines) + "\\\\[0.6em]"


def _emit_letter_to(meta: dict[str, Any], em: _Emitter) -> str:
    lines = _meta_lines(meta, "to", "recipient")
    if not lines:
        return ""
    return "\\\\\n".join(em.inline_text(ln) for ln in lines)


def _emit_letter_subject(meta: dict[str, Any], em: _Emitter) -> str:
    subject = meta.get("subject")
    if not subject:
        return ""
    return f"\\noindent\\textbf{{Subject: {em.inline_text(str(subject))}}}\\par\\medskip"


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
                part += f"\\\\\n\\texttt{{{_latex_escape(str(email), quotes=False)}}}"
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
            affil_tex = "\\\\\n".join(_latex_escape(str(x), quotes=False) for x in lines)
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
                attrs.append(f"email={{{_latex_escape(str(email), quotes=False)}}}")
            if orcid:
                attrs.append(f"orcid={{{_latex_escape(str(orcid), quotes=False)}}}")
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


def _keyword_items(meta: dict[str, Any]) -> list[str]:
    kw = meta.get("keywords")
    if not kw:
        return []
    if isinstance(kw, str):
        return [k.strip() for k in kw.split(",") if k.strip()]
    return [str(k) for k in kw]


def _emit_keywords_ieee(meta: dict[str, Any]) -> str:
    items = _keyword_items(meta)
    if not items:
        return ""
    body = ", ".join(_latex_escape(k) for k in items)
    return f"\\begin{{IEEEkeywords}}\n{body}\n\\end{{IEEEkeywords}}\n"


def _emit_keywords_acm(meta: dict[str, Any]) -> str:
    items = _keyword_items(meta)
    if not items:
        return ""
    body = ", ".join(_latex_escape(k) for k in items)
    return f"\\keywords{{{body}}}\n"


def _emit_keywords_standard(meta: dict[str, Any]) -> str:
    items = _keyword_items(meta)
    if not items:
        return ""
    body = ", ".join(_latex_escape(k) for k in items)
    return f"\\par\\medskip\\noindent\\textbf{{Keywords:}} {body}\\par\n"


def _emit_abstract_standard(text: str, em: _Emitter) -> str:
    if not text.strip():
        return ""
    return f"\\begin{{abstract}}\n{em.inline_text(text.strip())}\n\\end{{abstract}}\n"


def _qual_label(kind: str, label: str | None) -> str | None:
    if not label:
        return None
    if ":" in label:
        return label
    return f"{kind}:{label}"


_VERBATIM_MAP = {
    "→": "->",
    "⇒": "=>",
    "←": "<-",
    "⇐": "<=",
    "—": "--",
    "–": "-",
    "…": "...",
    "✓": "[x]",
    "✔": "[x]",
    "✅": "[x]",
    "✗": "[ ]",
    "✘": "[ ]",
    "❌": "[ ]",
    "•": "*",
    "“": '"',
    "”": '"',
    "‘": "'",
    "’": "'",
    " ": " ",
}


def _sanitize_verbatim(text: str) -> str:
    out = []
    for ch in text:
        if ch in _VERBATIM_MAP:
            out.append(_VERBATIM_MAP[ch])
        elif ord(ch) >= 0x2000:
            out.append("?")
        else:
            out.append(ch)
    return "".join(out)


# Unicode prose characters pdflatex cannot digest, mapped to LaTeX equivalents.
UNICODE_MAP = {
    "→": r"$\rightarrow$",
    "⇒": r"$\Rightarrow$",
    "←": r"$\leftarrow$",
    "⇐": r"$\Leftarrow$",
    "↔": r"$\leftrightarrow$",
    "↑": r"$\uparrow$",
    "↓": r"$\downarrow$",
    "✓": r"$\checkmark$",
    "✔": r"$\checkmark$",
    "✅": r"$\checkmark$",
    "✗": r"$\times$",
    "✘": r"$\times$",
    "❌": r"$\times$",
    "•": r"\textbullet{}",
    "·": r"$\cdot$",
    "±": r"$\pm$",
    "×": r"$\times$",
    "÷": r"$\div$",
    "≤": r"$\leq$",
    "≥": r"$\geq$",
    "≠": r"$\neq$",
    "≈": r"$\approx$",
    "∈": r"$\in$",
    "∞": r"$\infty$",
    "°": r"$^{\circ}$",
    "µ": r"$\mu$",
    "α": r"$\alpha$",
    "β": r"$\beta$",
    "γ": r"$\gamma$",
    "δ": r"$\delta$",
    "ε": r"$\varepsilon$",
    "θ": r"$\theta$",
    "λ": r"$\lambda$",
    "π": r"$\pi$",
    "σ": r"$\sigma$",
    "τ": r"$\tau$",
    "φ": r"$\varphi$",
    "ω": r"$\omega$",
    "Δ": r"$\Delta$",
    "Σ": r"$\Sigma$",
    "Ω": r"$\Omega$",
    "™": r"\texttrademark{}",
    "©": r"\textcopyright{}",
    "®": r"\textregistered{}",
    "€": r"\texteuro{}",
    "£": r"\pounds{}",
    "₹": "Rs.~",
    "…": r"\ldots{}",
    "—": "---",
    "–": "--",
    "“": "``",
    "”": "''",
    "‘": "`",
    "’": "'",
    " ": "~",
}

_ESCAPE_MAP = {
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


def _smart_quotes(s: str) -> str:
    s = re.sub(r'(^|[\s(\[{])"', r"\1``", s)
    s = s.replace('"', "''")
    s = re.sub(r"(^|[\s(\[{])'", r"\1`", s)
    return s


def _latex_escape(s: str, quotes: bool = True) -> str:
    out = []
    for ch in s:
        if ch in _ESCAPE_MAP:
            out.append(_ESCAPE_MAP[ch])
        elif ch in UNICODE_MAP:
            out.append(UNICODE_MAP[ch])
        elif ord(ch) >= 0x2000:
            # unsupported symbol/emoji: drop it (markus check reports these)
            continue
        else:
            out.append(ch)
    text = "".join(out)
    if quotes:
        text = _smart_quotes(text)
    return text


def _escape_url(url: str) -> str:
    # \href reads its argument almost verbatim; only % and # need help
    return url.replace("%", r"\%").replace("#", r"\#")


def _escape_path(p: str) -> str:
    return p.replace("\\", "/")


def _escape_key(k: str) -> str:
    return re.sub(r"[^\w:,-]", "", k)


def _color_cmd(cmd: str, color: str, inner: str) -> str:
    """\\textcolor / \\colorbox with named ('red') or hex ('#ff8800') colours."""
    c = color.strip()
    if c.startswith("#") and re.fullmatch(r"#[0-9A-Fa-f]{6}", c):
        return f"{cmd}[HTML]{{{c[1:].upper()}}}{{{inner}}}"
    safe = re.sub(r"[^A-Za-z]", "", c) or "black"
    return f"{cmd}{{{safe}}}{{{inner}}}"


def _emit_code_block(block: CodeBlock) -> str:
    code = _sanitize_verbatim(block.code)
    lang = (block.language or "").lower()
    lst = _LST_LANG_MAP.get(lang)
    if lst:
        return f"\\begin{{lstlisting}}[language={{{lst}}}]\n{code}\n\\end{{lstlisting}}"
    return f"\\begin{{lstlisting}}\n{code}\n\\end{{lstlisting}}"


class _Emitter:
    def __init__(self, spec: TemplateSpec, footnotes: dict[str, list[Inline]]):
        self.spec = spec
        self.footnotes = footnotes

    # --- helpers ---

    def inline_text(self, raw: str) -> str:
        """Parse a raw string (heading, caption, title) as Markus inline markup."""
        return self.inlines(parse_inlines(raw))

    def heading_cmd(self, level: int) -> str:
        if self.spec.chapters:
            return {
                1: "chapter",
                2: "section",
                3: "subsection",
                4: "subsubsection",
                5: "paragraph",
            }.get(level, "subparagraph")
        return {
            1: "section",
            2: "subsection",
            3: "subsubsection",
            4: "paragraph",
        }.get(level, "subparagraph")

    # --- blocks ---

    def block(self, block: Block) -> str:
        if isinstance(block, Heading):
            out = f"\\{self.heading_cmd(block.level)}{{{self.inline_text(block.text)}}}"
            ql = _qual_label("sec", block.label)
            if ql:
                out += f"\n\\label{{{ql}}}"
            return out

        if isinstance(block, Paragraph):
            return self.inlines(block.inlines)

        if isinstance(block, MathBlock):
            return self.math_block(block)

        if isinstance(block, Figure):
            return self.figure(block)

        if isinstance(block, CodeBlock):
            return _emit_code_block(block)

        if isinstance(block, RawLatex):
            return _sandbox_guard(block.content)

        if isinstance(block, ListBlock):
            return self.list_block(block)

        if isinstance(block, Table):
            return self.table(block)

        if isinstance(block, BlockQuote):
            inner = "\n\n".join(self.block(b) for b in block.blocks)
            return f"\\begin{{quote}}\n{inner}\n\\end{{quote}}"

        if isinstance(block, HorizontalRule):
            rule = "\\rule{\\linewidth}{0.4pt}"
            if block.color:
                rule = _color_cmd("\\textcolor", block.color, rule)
            return f"\\par\\medskip\\noindent{rule}\\par\\medskip"

        if isinstance(block, MermaidBlock):
            return self.mermaid(block)

        if isinstance(block, FootnoteDef):
            return ""  # inlined at the reference site

        if isinstance(block, Environment):
            return self.environment(block)

        return ""

    _TOP_MATH_ENV_RE = re.compile(
        r"^\\begin\{(equation|align|gather|multline|alignat|flalign|eqnarray|displaymath|math)\*?\}"
    )
    # inner building blocks that may contain \\ and & without being multi-equation
    _INNER_MATH_ENV_RE = re.compile(
        r"\\begin\{(cases|[pbBvV]?matrix|smallmatrix|array|aligned|split|gathered|alignedat)\*?\}"
        r".*?\\end\{\1\*?\}",
        re.DOTALL,
    )

    def math_block(self, block: MathBlock) -> str:
        latex = _math_latex(block.latex)
        ql = _qual_label("eq", block.label)
        label_tex = f"\\label{{{ql}}}\n" if ql else ""
        if self._TOP_MATH_ENV_RE.match(latex):
            # user provided a complete display environment — pass through
            return latex
        # decide layout from structure outside inner envs like cases/matrix
        skeleton = self._INNER_MATH_ENV_RE.sub("", latex)
        if "\\\\" in skeleton:
            env = "align" if "&" in skeleton else "gather"
            return f"\\begin{{{env}}}\n{label_tex}{latex}\n\\end{{{env}}}"
        return f"\\begin{{equation}}\n{label_tex}{latex}\n\\end{{equation}}"

    def figure(self, block: Figure) -> str:
        spec = self.spec
        default_w = r"0.8\columnwidth" if spec.columns >= 2 else r"0.8\textwidth"
        width = block.width or default_w
        if (
            not width.startswith("\\")
            and "textwidth" not in width
            and "columnwidth" not in width
            and width.replace(".", "").isdigit()
        ):
            width = f"{width}\\textwidth"
        cap = self.inline_text(block.caption) if block.caption else ""
        graphic = f"\\includegraphics[width={width}]{{{_escape_path(block.path)}}}"
        ql = _qual_label("fig", block.label)
        if not spec.floats:
            out = "\\begin{center}\n" + graphic + "\n"
            if cap:
                out += f"\\captionof{{figure}}{{{cap}}}\n"
            if ql:
                out += f"\\label{{{ql}}}\n"
            out += "\\end{center}"
            return out
        out = (
            "\\begin{figure}[htbp]\n"
            "\\centering\n"
            f"{graphic}\n"
            f"\\caption{{{cap}}}\n"
        )
        if ql:
            out += f"\\label{{{ql}}}\n"
        out += "\\end{figure}"
        return out

    def mermaid(self, block: MermaidBlock) -> str:
        # rendered to an image by the CLI; otherwise show the source as a fallback
        if block.image:
            graphic = f"\\includegraphics[width=\\linewidth,keepaspectratio]{{{_escape_path(block.image)}}}"
            cap = self.inline_text(block.caption) if block.caption else ""
            ql = _qual_label("fig", block.label)
            if not self.spec.floats:
                out = "\\begin{center}\n" + graphic + "\n"
                if cap:
                    out += f"\\captionof{{figure}}{{{cap}}}\n"
                if ql:
                    out += f"\\label{{{ql}}}\n"
                return out + "\\end{center}"
            out = "\\begin{figure}[htbp]\n\\centering\n" + graphic + "\n"
            if cap:
                out += f"\\caption{{{cap}}}\n"
            if ql:
                out += f"\\label{{{ql}}}\n"
            return out + "\\end{figure}"
        # fallback: mermaid renderer unavailable
        code = _sanitize_verbatim(block.code)
        return (
            "\\begin{quote}\\small\\itshape mermaid diagram "
            "(renderer not available)\\end{quote}\n"
            f"\\begin{{lstlisting}}\n{code}\n\\end{{lstlisting}}"
        )

    def list_block(self, block: ListBlock) -> str:
        env = "enumerate" if block.ordered else "itemize"
        lines = [f"\\begin{{{env}}}"]
        for item in block.items:
            if item.checked is None:
                prefix = "\\item"
            elif item.checked:
                prefix = "\\item[\\markuscheckedbox]"
            else:
                prefix = "\\item[\\markusopenbox]"
            text = self.inlines(item.inlines)
            lines.append(f"  {prefix} {text}".rstrip())
            for child in item.children:
                child_tex = self.block(child)
                lines.append("\n".join("  " + ln for ln in child_tex.splitlines()))
        lines.append(f"\\end{{{env}}}")
        return "\n".join(lines)

    def table(self, block: Table) -> str:
        ncols = len(block.headers)
        aligns = block.aligns or ["l"] * ncols
        align = "".join(aligns[:ncols]) or "l" * ncols
        header = " & ".join(self.inlines(h) for h in block.headers) + r" \\"
        rows = [
            " & ".join(self.inlines(c) for c in row) + r" \\"
            for row in block.rows
        ]
        cap = self.inline_text(block.caption) if block.caption else ""
        ql = _qual_label("tbl", block.label)
        tabular = (
            f"\\begin{{tabular}}{{{align}}}\n\\toprule\n"
            f"{header}\n\\midrule\n"
            + "\n".join(rows)
            + "\n\\bottomrule\n\\end{tabular}"
        )
        if not self.spec.floats:
            out = "\\begin{center}\n"
            if cap:
                out += f"\\captionof{{table}}{{{cap}}}\n"
            if ql:
                out += f"\\label{{{ql}}}\n"
            out += tabular + "\n\\end{center}"
            return out
        out = "\\begin{table}[htbp]\n\\centering\n"
        if cap:
            out += f"\\caption{{{cap}}}\n"
        if ql:
            out += f"\\label{{{ql}}}\n"
        out += tabular + "\n\\end{table}"
        return out

    def environment(self, block: Environment) -> str:
        kind = block.kind.lower()
        inner = "\n\n".join(self.block(b) for b in block.blocks)

        if kind == "proof":
            title = f"[{self.inline_text(block.title)}]" if block.title else ""
            return f"\\begin{{proof}}{title}\n{inner}\n\\end{{proof}}"

        if kind in ENV_MAP:
            env_name = ENV_MAP[kind]
            if block.title:
                return (
                    f"\\begin{{{env_name}}}[{self.inline_text(block.title)}]\n"
                    f"{inner}\n\\end{{{env_name}}}"
                )
            return f"\\begin{{{env_name}}}\n{inner}\n\\end{{{env_name}}}"

        if kind in SAFE_PASSTHROUGH_ENVS:
            return f"\\begin{{{kind}}}\n{inner}\n\\end{{{kind}}}"

        # callouts and anything unknown → built-in box, never an undefined env
        title = (
            self.inline_text(block.title)
            if block.title
            else CALLOUT_TITLES.get(kind, kind.title())
        )
        return f"\\begin{{markuscallout}}{{{title}}}\n{inner}\n\\end{{markuscallout}}"

    # --- inlines ---

    def inlines(self, nodes: list[Inline]) -> str:
        parts: list[str] = []
        for n in nodes:
            if isinstance(n, Text):
                parts.append(_latex_escape(n.value))
            elif isinstance(n, Strong):
                parts.append(f"\\textbf{{{self.inlines(n.children)}}}")
            elif isinstance(n, Emphasis):
                parts.append(f"\\textit{{{self.inlines(n.children)}}}")
            elif isinstance(n, Strikeout):
                parts.append(f"\\sout{{{self.inlines(n.children)}}}")
            elif isinstance(n, Span):
                inner = self.inlines(n.children)
                if n.color:
                    inner = _color_cmd("\\textcolor", n.color, inner)
                if n.bg:
                    inner = _color_cmd("\\colorbox", n.bg, inner)
                parts.append(inner)
            elif isinstance(n, Code):
                parts.append(f"\\texttt{{{_latex_escape(n.value, quotes=False)}}}")
            elif isinstance(n, MathInline):
                parts.append(f"${_math_latex(n.latex)}$")
            elif isinstance(n, Cite):
                parts.append(f"\\cite{{{_escape_key(n.key)}}}")
            elif isinstance(n, CiteGroup):
                keys = ",".join(_escape_key(k) for k in n.keys)
                parts.append(f"\\cite{{{keys}}}")
            elif isinstance(n, Ref):
                target = f"{n.kind}:{n.label}"
                if n.kind == "eq":
                    parts.append(f"\\eqref{{{target}}}")
                else:
                    parts.append(f"\\ref{{{target}}}")
            elif isinstance(n, FootnoteRef):
                content = self.footnotes.get(n.key)
                if content is None:
                    parts.append("\\footnote{??}")
                else:
                    parts.append(f"\\footnote{{{self.inlines(content)}}}")
            elif isinstance(n, LineBreak):
                parts.append("\\\\\n")
            elif isinstance(n, Link):
                if n.text.strip() == n.url.strip():
                    parts.append(f"\\url{{{_escape_url(n.url)}}}")
                else:
                    parts.append(
                        f"\\href{{{_escape_url(n.url)}}}{{{_latex_escape(n.text)}}}"
                    )
        out = "".join(parts)
        # a trailing forced break crashes LaTeX at paragraph end
        return out.rstrip("\n").removesuffix("\\\\").rstrip()


def write_tex(doc: Document, out_path: Path, template: str = "article") -> Path:
    tex = emit(doc, template=template)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(tex, encoding="utf-8")
    return out_path
