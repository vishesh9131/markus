from markus.latex import emit
from markus.parser import parse
from markus.templates_registry import list_templates, resolve_template


def test_list_templates_includes_ieee():
    ids = {t.id for t in list_templates()}
    assert "ieee" in ids
    assert "twocolumn" in ids
    assert "acm" in ids


def test_resolve_template_aliases():
    assert resolve_template("ieee-conference").id == "ieee"
    assert resolve_template("2col").id == "twocolumn"


def test_ieee_emit_includes_ieeetran_and_keywords():
    src = """---
title: Test
template: ieee
author:
  - name: Jane Doe
    affiliation: MIT
    email: j@mit.edu
abstract: Hello
keywords: [AI, Systems]
---
# Intro
Body.
"""
    doc = parse(src)
    tex = emit(doc, template="ieee")
    assert r"\documentclass[conference]{IEEEtran}" in tex
    assert "IEEEauthorblockN" in tex
    assert "IEEEkeywords" in tex
    assert "AI" in tex


def test_twocolumn_emit():
    src = """---
title: Two Col
template: twocolumn
---
# Hi
"""
    doc = parse(src)
    tex = emit(doc, template="twocolumn")
    assert r"\documentclass[11pt,twocolumn]{article}" in tex
