from markus.parser import parse
from markus.latex import emit
from markus.ast import Heading, MathBlock, Figure, Cite, Ref


def test_front_matter_and_heading():
    src = """---
title: Test Paper
template: article
---
# Introduction {#sec:intro}

Hello world.
"""
    doc = parse(src)
    assert doc.meta["title"] == "Test Paper"
    assert isinstance(doc.blocks[0], Heading)
    assert doc.blocks[0].label == "intro"


def test_math_and_cite():
    src = """$$
a^2 + b^2 = c^2
$$
{#eq:pythagoras}

See @eq:pythagoras and [@newton1687].
"""
    doc = parse(src)
    assert isinstance(doc.blocks[0], MathBlock)
    assert doc.blocks[0].label == "pythagoras"
    tex = emit(doc)
    assert "\\begin{equation}" in tex
    assert "\\label{eq:pythagoras}" in tex
    assert "\\cite{newton1687}" in tex
    assert "\\ref{eq:pythagoras}" in tex


def test_figure():
    src = '![Pipeline](figures/pipe.pdf){#fig:pipe width=0.9\\textwidth}\n'
    doc = parse(src)
    fig = doc.blocks[0]
    assert isinstance(fig, Figure)
    assert fig.label == "pipe"
    tex = emit(doc)
    assert "\\includegraphics" in tex
    assert "fig:pipe" in tex


def test_markdown_link():
    src = "See [Markus docs](https://example.com) for details.\n"
    doc = parse(src)
    tex = emit(doc)
    assert "\\href{https://example.com}" in tex
    assert "Markus docs" in tex


def test_theorem_environment():
    src = """::: theorem Main result
Every Markus document compiles.
:::
"""
    doc = parse(src)
    tex = emit(doc)
    assert "\\begin{theorem}" in tex
    assert "Main result" in tex
