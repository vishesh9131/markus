"""Document model for Markus (.mks) sources."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Document:
    meta: dict[str, Any]
    blocks: list[Block] = field(default_factory=list)


# --- block nodes ---


@dataclass
class Heading:
    level: int
    text: str
    label: str | None = None


@dataclass
class Paragraph:
    inlines: list[Inline]


@dataclass
class MathBlock:
    latex: str
    label: str | None = None


@dataclass
class Figure:
    path: str
    caption: str
    label: str | None = None
    width: str | None = None


@dataclass
class CodeBlock:
    code: str
    language: str | None = None


@dataclass
class RawLatex:
    content: str


@dataclass
class ListBlock:
    ordered: bool
    items: list[list[Inline]]


@dataclass
class Table:
    headers: list[str]
    rows: list[list[str]]
    caption: str | None = None
    label: str | None = None


@dataclass
class Environment:
    """Theorem-like fenced blocks (::: theorem ... :::)"""

    kind: str
    title: str | None
    blocks: list[Block]


Block = (
    Heading
    | Paragraph
    | MathBlock
    | Figure
    | CodeBlock
    | RawLatex
    | ListBlock
    | Table
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
class Code:
    value: str


@dataclass
class MathInline:
    latex: str


@dataclass
class Cite:
    key: str


@dataclass
class Ref:
    kind: str  # fig, eq, sec, tbl
    label: str


@dataclass
class Link:
    text: str
    url: str


Inline = Text | Strong | Emphasis | Code | MathInline | Cite | Ref | Link
