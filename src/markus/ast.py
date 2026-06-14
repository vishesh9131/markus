"""Document model for Markus (.mks) sources."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Document:
    meta: dict[str, Any]
    blocks: list[Block] = field(default_factory=list)
    footnotes: dict[str, list[Inline]] = field(default_factory=dict)


# --- block nodes ---


@dataclass
class Heading:
    level: int
    text: str
    label: str | None = None
    line: int | None = None


@dataclass
class Paragraph:
    inlines: list[Inline]
    line: int | None = None


@dataclass
class MathBlock:
    latex: str
    label: str | None = None
    line: int | None = None


@dataclass
class Figure:
    path: str
    caption: str
    label: str | None = None
    width: str | None = None
    line: int | None = None


@dataclass
class CodeBlock:
    code: str
    language: str | None = None
    line: int | None = None


@dataclass
class RawLatex:
    content: str
    line: int | None = None


@dataclass
class ListItem:
    inlines: list[Inline]
    checked: bool | None = None  # None = plain item, True/False = task checkbox
    children: list[Block] = field(default_factory=list)  # nested lists


@dataclass
class ListBlock:
    ordered: bool
    items: list[ListItem]
    line: int | None = None


@dataclass
class Table:
    headers: list[list[Inline]]
    rows: list[list[list[Inline]]]
    aligns: list[str] = field(default_factory=list)  # 'l' | 'c' | 'r' per column
    caption: str | None = None
    label: str | None = None
    line: int | None = None


@dataclass
class BlockQuote:
    blocks: list[Block]
    line: int | None = None


@dataclass
class HorizontalRule:
    line: int | None = None
    color: str | None = None


@dataclass
class MermaidBlock:
    code: str
    label: str | None = None
    caption: str | None = None
    line: int | None = None
    image: str | None = None  # set by the CLI after rendering with mermaid-cli


@dataclass
class FootnoteDef:
    key: str
    inlines: list[Inline]
    line: int | None = None


@dataclass
class Environment:
    """Theorem-like / callout fenced blocks (::: theorem ... :::)"""

    kind: str
    title: str | None
    blocks: list[Block]
    line: int | None = None


Block = (
    Heading
    | Paragraph
    | MathBlock
    | Figure
    | CodeBlock
    | RawLatex
    | ListBlock
    | Table
    | BlockQuote
    | HorizontalRule
    | MermaidBlock
    | FootnoteDef
    | Environment
)


# --- inline nodes ---


@dataclass
class Text:
    value: str


@dataclass
class Strong:
    children: list[Inline]


@dataclass
class Emphasis:
    children: list[Inline]


@dataclass
class Strikeout:
    children: list[Inline]


@dataclass
class Span:
    """Inline run with a text colour and/or background (highlight)."""

    children: list[Inline]
    color: str | None = None
    bg: str | None = None


@dataclass
class Code:
    value: str


@dataclass
class MathInline:
    latex: str


@dataclass
class Cite:
    key: str


@dataclass
class CiteGroup:
    keys: list[str]


@dataclass
class Ref:
    kind: str  # fig, eq, sec, tbl
    label: str


@dataclass
class FootnoteRef:
    key: str


@dataclass
class LineBreak:
    pass


@dataclass
class Link:
    text: str
    url: str


Inline = (
    Text
    | Strong
    | Emphasis
    | Strikeout
    | Span
    | Code
    | MathInline
    | Cite
    | CiteGroup
    | Ref
    | FootnoteRef
    | LineBreak
    | Link
)
