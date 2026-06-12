"""Regression tests for the A1–E3 audit fixes."""

from markus.ast import (
    BlockQuote,
    Cite,
    CiteGroup,
    CodeBlock,
    FootnoteRef,
    Heading,
    HorizontalRule,
    ListBlock,
    MathBlock,
    MathInline,
    Paragraph,
    RawLatex,
    Table,
    Text,
)
from markus.latex import emit
from markus.parser import parse


def _tex(src: str, template: str = "article") -> str:
    return emit(parse(src), template=template)


# --- A1: bracketed and multiple citations ---

def test_bracketed_citation_no_literal_brackets():
    tex = _tex("As shown [@smith2020].")
    assert "\\cite{smith2020}" in tex
    assert "[\\cite" not in tex


def test_multi_citation():
    tex = _tex("Prior work [@a2020; @b2021].")
    assert "\\cite{a2020,b2021}" in tex


# --- A2: emails are not citations ---

def test_email_not_cite():
    doc = parse("Mail me at help@university.edu today.")
    tex = emit(doc)
    assert "\\cite" not in tex
    assert "help@university.edu" in tex


# --- A3/A4: dollar amounts and escapes ---

def test_dollar_amounts_not_math():
    tex = _tex("Tuition is $4,500 and books cost $300 this term.")
    assert "4,500" in tex
    assert "\\$" in tex


def test_backslash_escapes():
    tex = _tex(r"literal \*star\* and \$5 and \@home")
    assert "*star*" in tex
    assert "\\$5" in tex
    assert "@home" in tex


# --- A5: fence with attributes does not destroy the document ---

def test_fence_with_attrs():
    src = "```python {.numberLines}\nx = 1\n```\n\nAfter paragraph.\n"
    doc = parse(src)
    assert isinstance(doc.blocks[0], CodeBlock)
    assert doc.blocks[0].language == "python"
    assert isinstance(doc.blocks[1], Paragraph)


def test_tilde_fence():
    doc = parse("~~~\nraw\n~~~\n")
    assert isinstance(doc.blocks[0], CodeBlock)


# --- A6: task lists ---

def test_task_list_checkboxes():
    src = "- [ ] open task\n- [x] done task\n"
    doc = parse(src)
    lst = doc.blocks[0]
    assert isinstance(lst, ListBlock)
    assert lst.items[0].checked is False
    assert lst.items[1].checked is True
    tex = emit(doc)
    assert "\\markusopenbox" in tex
    assert "\\markuscheckedbox" in tex


# --- A7/A8: nested lists and continuation lines ---

def test_nested_list():
    src = "- top\n  - inner one\n  - inner two\n- second top\n"
    doc = parse(src)
    lst = doc.blocks[0]
    assert len(lst.items) == 2
    assert lst.items[0].children
    inner = lst.items[0].children[0]
    assert isinstance(inner, ListBlock)
    assert len(inner.items) == 2


def test_list_continuation_line():
    src = "- a very long item\n  that wraps onto another line\n- second\n"
    doc = parse(src)
    lst = doc.blocks[0]
    assert len(lst.items) == 2
    joined = "".join(t.value for t in lst.items[0].inlines if isinstance(t, Text))
    assert "wraps onto" in joined


# --- A9: blockquote ---

def test_blockquote():
    doc = parse("> quoted wisdom\n> second line\n")
    assert isinstance(doc.blocks[0], BlockQuote)
    tex = emit(doc)
    assert "\\begin{quote}" in tex


# --- A10: footnotes ---

def test_footnote_inlined():
    src = "A claim[^1].\n\n[^1]: The footnote text.\n"
    doc = parse(src)
    assert "1" in doc.footnotes
    tex = emit(doc)
    assert "\\footnote{The footnote text.}" in tex


# --- A11: strikethrough ---

def test_strikethrough():
    tex = _tex("~~old~~ new")
    assert "\\sout{old}" in tex


# --- A12: inline markup in headings, captions, cells, title ---

def test_math_in_heading():
    tex = _tex("# The $O(n)$ Bound\n")
    assert "\\section{The $O(n)$ Bound}" in tex


def test_markup_in_table_cells():
    src = "| Model | Score |\n|-------|-------|\n| **Ours** | $F_1$ |\n"
    tex = _tex(src)
    assert "\\textbf{Ours}" in tex
    assert "$F_{1}$" in tex or "$F_1$" in tex


def test_math_in_title():
    src = "---\ntitle: 'A $O(n)$ Study'\ntemplate: article\n---\n\nBody.\n"
    tex = _tex(src)
    assert "\\title{A $O(n)$ Study}" in tex


# --- A13: unknown environments become callouts, never undefined envs ---

def test_unknown_env_is_callout():
    tex = _tex("::: warning\nDanger zone.\n:::\n")
    assert "\\begin{markuscallout}{Warning}" in tex
    assert "\\begin{warning}" not in tex


# --- A14: unicode mapped for pdflatex ---

def test_unicode_mapped():
    tex = _tex("Done ✅ and A → B\n")
    assert "\\checkmark" in tex
    assert "\\rightarrow" in tex
    assert "✅" not in tex


# --- A15: hard line breaks ---

def test_hard_break_two_spaces():
    tex = _tex("Sincerely,  \nVishesh\n")
    assert "\\\\" in tex


def test_letter_preserves_breaks():
    src = "---\ntemplate: letter\n---\n\nSincerely,\nVishesh\n"
    tex = _tex(src, template="letter")
    assert "Sincerely,\\\\" in tex.replace(" \\\\", "\\\\")


# --- A16: same-line equation labels and align ---

def test_equation_label_same_line():
    doc = parse("$$E = mc^2$$ {#eq:emc}\n")
    blk = doc.blocks[0]
    assert isinstance(blk, MathBlock) and blk.label == "emc"


def test_multiline_math_align():
    src = "$$\na &= b \\\\\nc &= d\n$$\n"
    tex = _tex(src)
    assert "\\begin{align}" in tex


# --- A17: table alignment + uneven rows ---

def test_table_alignment():
    src = "| L | C | R |\n|:--|:-:|--:|\n| a | b | c |\n"
    doc = parse(src)
    tbl = doc.blocks[0]
    assert isinstance(tbl, Table)
    assert tbl.aligns == ["l", "c", "r"]
    tex = emit(doc)
    assert "\\begin{tabular}{lcr}" in tex
    assert "\\toprule" in tex


def test_table_uneven_rows():
    src = "| A | B |\n|---|---|\n| only |\n| x | y | z |\n"
    doc = parse(src)
    tbl = doc.blocks[0]
    assert all(len(r) == 2 for r in tbl.rows)


# --- A18: comments, horizontal rules, page breaks ---

def test_html_comment_removed():
    tex = _tex("Before <!-- hidden --> after\n")
    assert "hidden" not in tex


def test_horizontal_rule():
    doc = parse("above\n\n---\n\nbelow\n")
    assert any(isinstance(b, HorizontalRule) for b in doc.blocks)


def test_pagebreak_passthrough():
    doc = parse("first\n\n\\newpage\n\nsecond\n")
    assert any(isinstance(b, RawLatex) and b.content == "\\newpage" for b in doc.blocks)


# --- B1/B2: equation labels inside env, eqref ---

def test_equation_label_inside_environment():
    tex = _tex("$$\nx = y\n$$\n{#eq:xy}\n")
    assert "\\begin{equation}\n\\label{eq:xy}" in tex
    assert "\\end{equation}\n\\label" not in tex


def test_eqref_used_for_equations():
    tex = _tex("See @eq:foo.\n")
    assert "\\eqref{eq:foo}" in tex


# --- B3: listings languages ---

def test_unknown_lst_language_falls_back():
    tex = _tex("```rust\nfn main() {}\n```\n")
    assert "language" not in tex.split("\\begin{lstlisting}")[1].split("\n")[0]


def test_py_maps_to_python():
    tex = _tex("```py\nx = 1\n```\n")
    assert "language={Python}" in tex


# --- B5: float placement ---

def test_table_float_htbp():
    tex = _tex("| A |\n|---|\n| x |\n")
    assert "\\begin{table}[htbp]" in tex


def test_notes_table_inline():
    tex = _tex("| A |\n|---|\n| x |\n", template="notes")
    assert "\\begin{table}" not in tex
    assert "\\begin{tabular}" in tex


# --- B7: smart quotes ---

def test_smart_quotes():
    tex = _tex('He said "hello" loudly.\n')
    assert "``hello''" in tex


# --- C1/C2: letter template and date ---

def test_letter_template_fields():
    src = (
        "---\ntemplate: letter\ndate: June 12, 2026\nto: |\n  The Registrar\n"
        "  Stanford University\nfrom: Vishesh\nsubject: Fee waiver\n---\n\nDear Sir,\n"
    )
    tex = _tex(src, template="letter")
    assert "June 12, 2026" in tex
    assert "The Registrar\\\\\nStanford University" in tex
    assert "Subject: Fee waiver" in tex


def test_date_in_article():
    src = "---\ntitle: T\ndate: 2026-01-01\ntemplate: article\n---\n\nBody.\n"
    tex = _tex(src)
    assert "\\date{2026-01-01}" in tex


# --- C3: notes template gets graphicx/theorems via injected preamble ---

def test_notes_preamble_injection():
    tex = _tex("::: theorem\nT.\n:::\n", template="notes")
    assert "\\usepackage{graphicx}" in tex
    assert "\\newtheorem{theorem}" in tex
    assert "\\begin{theorem}" in tex


# --- C4: report chapters, beamer frames ---

def test_report_chapters():
    tex = _tex("# Chapter One\n\nText.\n", template="report")
    assert "\\chapter{Chapter One}" in tex


def test_beamer_frames():
    src = "# Section\n\n## Slide One\n\n- point\n"
    tex = _tex(src, template="beamer")
    assert "\\begin{frame}[fragile]{Slide One}" in tex
    assert tex.count("\\end{frame}") >= 2  # title page + slide


# --- D2: friendly YAML errors ---

def test_yaml_error_friendly():
    import pytest
    from markus.parser import MarkusParseError

    src = '---\ntitle: "A $\\log n$ title"\n---\n\nBody.\n'
    with pytest.raises(MarkusParseError) as err:
        parse(src, path="bad.mks")
    assert "front matter" in str(err.value)
    assert "hint" in str(err.value)


# --- D3: diagnostics ---

def test_check_unknown_ref_and_cite(tmp_path):
    from markus.check import check_document

    src = "See @eq:nope and [@ghost2020].\n"
    f = tmp_path / "doc.mks"
    f.write_text(src)
    doc = parse(src)
    warnings = check_document(doc, src, f)
    assert any("eq:nope" in w for w in warnings)
    assert any("ghost2020" in w for w in warnings)


# --- batch-suite regressions (50-persona integration run) ---

def test_cases_inside_display_math_wrapped_in_equation():
    src = "$$\nf(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{else} \\end{cases}\n$$\n"
    tex = _tex(src)
    assert "\\begin{equation}" in tex
    assert "\\begin{align}" not in tex


def test_top_level_align_passthrough():
    src = "$$\n\\begin{align}\na &= b\n\\end{align}\n$$\n"
    tex = _tex(src)
    assert tex.count("\\begin{align}") == 1
    assert "\\begin{equation}" not in tex.split("\\begin{align}")[0].rsplit("\n", 3)[-1]


def test_mixed_list_types_split():
    src = "- bullet one\n- bullet two\n\n1. first\n2. second\n"
    doc = parse(src)
    lists = [b for b in doc.blocks if isinstance(b, ListBlock)]
    assert len(lists) == 2
    assert lists[0].ordered is False
    assert lists[1].ordered is True


def test_ordered_after_bullet_no_blank_line():
    src = "- bullet\n1. number\n"
    doc = parse(src)
    lists = [b for b in doc.blocks if isinstance(b, ListBlock)]
    assert len(lists) == 2


def test_acm_preamble_skips_amssymb():
    tex = _tex("Body.\n", template="acm")
    assert "ifundefined{square}" not in tex


def test_article_preamble_guards():
    tex = _tex("Body.\n", template="article")
    assert "\\@ifundefined{square}{\\usepackage{amssymb}}{}" in tex
    assert "\\@ifundefined{proof}{\\usepackage{amsthm}}{}" in tex


def test_preamble_before_title_not_after_author():
    tex = _tex("---\ntitle: T\nauthor: A\ntemplate: revtex\n---\n\nBody.\n", template="revtex")
    assert tex.index("end markus preamble") < tex.index("\\title{")
