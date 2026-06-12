"""Built-in Markus manuscript templates (venue / layout styles)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TemplateSpec:
    id: str
    label: str
    description: str
    columns: int
    author_mode: str  # standard | ieee | acm
    default_bibstyle: str
    aliases: tuple[str, ...] = ()
    floats: bool = True  # False → tables/figures placed inline (notes, letters)
    chapters: bool = False  # True → level-1 headings become \chapter
    kind: str = "standard"  # standard | letter | beamer


TEMPLATES: dict[str, TemplateSpec] = {}


def _reg(spec: TemplateSpec) -> None:
    TEMPLATES[spec.id] = spec
    for alias in spec.aliases:
        TEMPLATES[alias] = spec


_reg(
    TemplateSpec(
        id="notes",
        label="Notes",
        description="No title page — just body text (lazy notes, minutes, handouts)",
        columns=1,
        author_mode="standard",
        default_bibstyle="plain",
        aliases=("informal", "memo", "minutes"),
        floats=False,
    )
)
_reg(
    TemplateSpec(
        id="letter",
        label="Letter",
        description="Formal letter / notice (to, from, date, subject in front matter)",
        columns=1,
        author_mode="standard",
        default_bibstyle="plain",
        aliases=("notice", "formal-letter"),
        floats=False,
        kind="letter",
    )
)
_reg(
    TemplateSpec(
        id="report",
        label="Report",
        description="Multi-chapter report/thesis (level-1 headings become chapters)",
        columns=1,
        author_mode="standard",
        default_bibstyle="plainnat",
        aliases=("thesis", "book"),
        chapters=True,
    )
)
_reg(
    TemplateSpec(
        id="assignment",
        label="Assignment",
        description="Homework/assignment with course + due date in the page header",
        columns=1,
        author_mode="standard",
        default_bibstyle="plain",
        aliases=("homework", "problem-set"),
    )
)
_reg(
    TemplateSpec(
        id="beamer",
        label="Slides (Beamer)",
        description="Presentation slides — '##' headings start new frames",
        columns=1,
        author_mode="standard",
        default_bibstyle="plain",
        aliases=("slides", "presentation"),
        kind="beamer",
    )
)
_reg(
    TemplateSpec(
        id="cv",
        label="CV / Résumé",
        description="Compact curriculum vitae layout",
        columns=1,
        author_mode="standard",
        default_bibstyle="plain",
        aliases=("resume",),
        floats=False,
    )
)
_reg(
    TemplateSpec(
        id="article",
        label="Article",
        description="Single-column article (default)",
        columns=1,
        author_mode="standard",
        default_bibstyle="plainnat",
    )
)
_reg(
    TemplateSpec(
        id="twocolumn",
        label="Two-column article",
        description="Standard article class, two columns",
        columns=2,
        author_mode="standard",
        default_bibstyle="plainnat",
        aliases=("two-column", "2col"),
    )
)
_reg(
    TemplateSpec(
        id="ieee",
        label="IEEE Conference",
        description="IEEEtran conference proceedings (two-column)",
        columns=2,
        author_mode="ieee",
        default_bibstyle="IEEEtran",
        aliases=("ieee-conference", "ieeeconf"),
    )
)
_reg(
    TemplateSpec(
        id="ieee-journal",
        label="IEEE Journal",
        description="IEEEtran journal style (two-column)",
        columns=2,
        author_mode="ieee",
        default_bibstyle="IEEEtran",
        aliases=("ieee-journal", "ieeetran"),
    )
)
_reg(
    TemplateSpec(
        id="ieee-trans",
        label="IEEE Transactions",
        description="IEEEtran transaction style (two-column)",
        columns=2,
        author_mode="ieee",
        default_bibstyle="IEEEtran",
        aliases=("ieee-transaction",),
    )
)
_reg(
    TemplateSpec(
        id="acm",
        label="ACM SIGCONF",
        description="ACM conference (acmart sigconf, two-column)",
        columns=2,
        author_mode="acm",
        default_bibstyle="ACM-Reference-Format",
        aliases=("acm-sigconf", "sigconf"),
    )
)
_reg(
    TemplateSpec(
        id="acm-acmlarge",
        label="ACM acmlarge",
        description="ACM large single-column journal-style",
        columns=1,
        author_mode="acm",
        default_bibstyle="ACM-Reference-Format",
    )
)
_reg(
    TemplateSpec(
        id="springer",
        label="Springer LNCS",
        description="Springer Lecture Notes in Computer Science",
        columns=1,
        author_mode="standard",
        default_bibstyle="splncs04",
        aliases=("lncs", "springer-lncs"),
    )
)
_reg(
    TemplateSpec(
        id="nature",
        label="Nature-style",
        description="Compact two-column layout (article + geometry)",
        columns=2,
        author_mode="standard",
        default_bibstyle="plainnat",
    )
)
_reg(
    TemplateSpec(
        id="revtex",
        label="APS / REVTeX",
        description="Physical Review style (REVTeX, two-column)",
        columns=2,
        author_mode="standard",
        default_bibstyle="apsrev4-2",
        aliases=("aps", "prl"),
    )
)
_reg(
    TemplateSpec(
        id="apa",
        label="APA manuscript",
        description="APA 7th edition style (single column)",
        columns=1,
        author_mode="standard",
        default_bibstyle="apalike",
    )
)


def resolve_template(name: str) -> TemplateSpec:
    key = name.strip().lower()
    if key not in TEMPLATES:
        known = sorted({t.id for t in TEMPLATES.values()})
        raise ValueError(f"Unknown template '{name}'. Choose from: {', '.join(known)}")
    return TEMPLATES[key]


def list_templates() -> list[TemplateSpec]:
    seen: set[str] = set()
    out: list[TemplateSpec] = []
    for spec in TEMPLATES.values():
        if spec.id in seen:
            continue
        seen.add(spec.id)
        out.append(spec)
    return sorted(out, key=lambda s: s.id)
