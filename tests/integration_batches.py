#!/usr/bin/env python3
"""50 persona/use-case integration batches for Markus.

Builds a real PDF per use case (student notes, mathematician, IEEE/ACM papers,
letters, CVs, slides, stress tests, ...) and verifies expected output in the
.tex and extracted PDF text.

Not collected by pytest (needs latexmk; takes ~2 min). Run directly:

    python tests/integration_batches.py

Requires `pip install pypdf` for PDF text assertions.
Batch 17 (revtex) expects a clear failure on TeX Live 2025+ — upstream REVTeX bug.
"""
from __future__ import annotations
import subprocess, sys, shutil, zlib, struct
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import os, shutil as _shutil, tempfile
ROOT = Path(os.environ.get("MARKUS_BATCH_DIR", tempfile.gettempdir())) / "markus-batches"
MARKUS = os.environ.get("MARKUS_BIN") or _shutil.which("markus") or str(
    Path(__file__).resolve().parents[1] / ".venv" / "bin" / "markus")

REFS = """@article{knuth1984, author={Donald Knuth}, title={Literate Programming},
journal={The Computer Journal}, year={1984}}
@book{lamport1994, author={Leslie Lamport}, title={LaTeX: A Document Preparation System},
publisher={Addison-Wesley}, year={1994}}
@inproceedings{vaswani2017, author={Ashish Vaswani and others}, title={Attention Is All You Need},
booktitle={NeurIPS}, year={2017}}
"""

def make_png(path: Path, rgb=(70, 120, 200), w=320, h=200):
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c))
    row = b"\x00" + bytes(rgb) * w
    data = zlib.compress(row * h)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", data) + chunk(b"IEND", b""))

# batch = (name, mks, tex_expect[list], pdf_expect[list], expect_fail, warn_expect[list])
B = []
def batch(name, mks, tex=(), pdf=(), fail=False, warn=()):
    B.append(dict(name=name, mks=mks, tex=list(tex), pdf=list(pdf), fail=fail, warn=list(warn)))

# ---------- 1-10: students / teaching ----------
batch("01-student-notes", r"""# Calc II — Week 3 ✍

Key fact: $\int u\,dv = uv - \int v\,du$

- [ ] practice problems 1–10
- [x] read section 7.2
  - focus on trig substitution

> Integration by parts is differentiation in reverse. — Prof. M

![Area under curve](fig.png){#fig:area width=0.5}

See @fig:area for the idea.
""", tex=["\\markusopenbox", "\\markuscheckedbox", "\\begin{quote}", "\\includegraphics[width=0.5\\textwidth]"], pdf=["practice"]),

batch("02-mathematician", r"""---
title: 'On $\sigma$-Algebras'
author: A. Mathematician
template: article
---

# Main Result {#sec:main}

::: definition Measurable Space
A pair $(X, \mathcal{F})$ where $\mathcal{F}$ is a $\sigma$-algebra.
:::

::: theorem Carathéodory
Every outer measure restricts to a complete measure.
:::

::: proof
Let $\mu^*$ be an outer measure. Define $\mathcal{M}$ as usual.
:::

$$
\mu\left(\bigcup_{n=1}^\infty A_n\right) = \sum_{n=1}^\infty \mu(A_n)
$$ {#eq:additivity}

Countable additivity @eq:additivity is central to @sec:main.
""", tex=["\\begin{definition}[Measurable Space]", "\\begin{theorem}[Carath", "\\begin{equation}\n\\label{eq:additivity}", "\\eqref{eq:additivity}"], pdf=["Theorem", "Definition"]),

batch("03-lecturer-slides", r"""---
title: Sorting Algorithms
author: Dr. Lecturer
template: beamer
---

# Comparison Sorts

## Quicksort

- average $O(n \log n)$
- worst case $O(n^2)$

## Partition Code

```python
def partition(a, lo, hi):
    return lo
```
""", tex=["\\begin{frame}[fragile]{Quicksort}", "\\begin{frame}[fragile]{Partition Code}", "lstlisting"], pdf=["Quicksort"]),

batch("04-homework", r"""---
title: Problem Set 2
author: J. Student
template: assignment
course: MATH 301
due: June 20, 2026
---

# Problem 1

Show $\sum_{k=1}^n k^2 = \frac{n(n+1)(2n+1)}{6}$.

::: proof
By induction. Base case $n=1$: trivial.
:::
""", tex=["MATH 301", "June 20, 2026", "fancyhdr"], pdf=["Problem 1"]),

batch("05-lab-handout", r"""# Lab 4: Titration

::: warning
Wear goggles at all times.
:::

1. Fill the burette
2. Add 3 drops of indicator
   1. phenolphthalein preferred
   2. methyl orange acceptable
3. Titrate to endpoint

| Trial | Volume (mL) |
|------:|------------:|
| 1 | 24.3 |
| 2 | 24.1 |
""", tex=["\\begin{markuscallout}{Warning}", "\\begin{enumerate}", "{rr}"], pdf=["goggles"]),

batch("06-flashcard-notes", r"""# Biology flashnotes

**Mitosis** → PMAT: *prophase*, *metaphase*, *anaphase*, *telophase*

**Osmosis**: movement of H$_2$O across a membrane ✓

---

**DNA** vs **RNA**: deoxyribose vs ribose
""", tex=["\\rightarrow", "\\checkmark", "\\rule{\\linewidth}"], pdf=["Mitosis"]),

batch("07-exam-prep-todo", r"""# Finals checklist

- [ ] Linear algebra: eigenvalues
- [ ] Stats: hypothesis testing
- [x] Calculus: done!
- [ ] Office hours @ 2pm Tuesday

Budget: $40 for printing and $15 for coffee.
""", tex=["\\markusopenbox", "\\$40", "\\$15"], pdf=["checklist"]),

batch("08-thesis-chapter", r"""---
title: My Thesis
author: PhD Candidate
template: report
bib: refs.bib
---

# Introduction

Knuth pioneered literate programming [@knuth1984].

# Methods

## Data Collection

See Chapter ordering works.
""", tex=["\\chapter{Introduction}", "\\tableofcontents", "\\cite{knuth1984}"], pdf=["Contents", "Introduction"]),

batch("09-lecture-notes-callouts", r"""# Operating Systems L7

::: note
Context switches are expensive.
:::

::: tip
Use `htop` to watch the scheduler.
:::

::: important
The exam covers chapters 4–6.
:::

::: bogusenv
Unknown environments must not crash the build.
:::
""", tex=["\\begin{markuscallout}{Note}", "\\begin{markuscallout}{Tip}", "\\begin{markuscallout}{Important}", "\\begin{markuscallout}{Bogusenv}"], pdf=["Context"]),

batch("10-group-project-minutes", r"""# Sprint 12 minutes

Attendees: Alice, Bob, Chen

## Decisions

> We ship the beta on Friday.

## Actions

- [ ] Alice: fix login bug
- [ ] Bob: write docs
- [x] Chen: deploy staging
""", tex=["\\begin{quote}", "\\markuscheckedbox"], pdf=["Sprint"]),

# ---------- 11-20: researchers / venues ----------
batch("11-ieee-paper", r"""---
title: Low-Power Edge Inference
author:
  - name: R. Searcher
    affiliation: IIT Delhi
    email: rs@iitd.ac.in
template: ieee
keywords: edge, inference, power
bib: refs.bib
abstract: |
  We present a method.
---

# Introduction

Transformers [@vaswani2017] are large. Our design saves $30\%$ power.
""", tex=["IEEEauthorblockN", "IEEEkeywords", "\\cite{vaswani2017}"], pdf=["Abstract"]),

batch("12-acm-paper", r"""---
title: Systems for ML
author:
  - name: A. Author
    affiliation: ACM University
    email: a@acm.org
template: acm
keywords: systems, ml
abstract: |
  An abstract.
bib: refs.bib
---

# Introduction

We build on [@knuth1984; @lamport1994].
""", tex=["\\cite{knuth1984,lamport1994}", "\\keywords{"], pdf=[]),

batch("13-twocolumn-paper", r"""---
title: A Two-Column Study
author: T. Writer
template: twocolumn
---

# Method

The loss is $L = \sum_i \ell_i$ over a batch.

| k | acc |
|---|-----|
| 1 | 0.9 |
""", tex=["twocolumn", "\\begin{table}[htbp]"], pdf=["Method"]),

batch("14-nature-style", r"""---
title: Signals in Noise
author: N. Scientist
template: nature
---

# Results

Effect size $d = 0.8$, $p < 0.001$.
""", tex=[], pdf=["Results"]),

batch("15-apa-manuscript", r"""---
title: Cognitive Load Study
author: P. Sychologist
template: apa
---

# Discussion

Participants ($N = 42$) showed improvement.
""", tex=[], pdf=["Discussion"]),

batch("16-springer-lncs", r"""---
title: Graph Algorithms Revisited
author: S. Pringer
template: springer
---

# Preliminaries

A graph $G = (V, E)$ with $|V| = n$.
""", tex=[], pdf=["Preliminaries"]),

batch("17-revtex-physics", r"""---
title: Quantum Decoherence Rates
author: F. Physicist
template: revtex
---

# Model

The Hamiltonian $H = H_0 + \lambda V$ with coupling $\lambda \ll 1$.
""", fail=True, warn=["upstream REVTeX bug"]),  # revtex4-2 broken on TL2025+; markus must explain this clearly

batch("18-research-log", r"""---
template: notes
bib: refs.bib
---

# 2026-06-13

Read [@vaswani2017] again. Attention scales as $O(n^2)$ — bad for long context.

Ideas:

- sparse patterns
- linear kernels
""", tex=["\\cite{vaswani2017}"], pdf=["Attention"]),

batch("19-grant-proposal", r"""---
title: Proposal — Scalable Solvers
author: P. I.
template: article
keywords: solvers, HPC
abstract: |
  We request funding for solver research.
---

# Aims

1. Build the solver
2. Evaluate at scale

| Item | Cost |
|------|-----:|
| Postdoc | $80,000 |
| Travel | $5,000 |

: Table: Budget {#tbl:budget}

Total in @tbl:budget.
""", tex=["Keywords:", "\\$80,000", "\\caption{Budget}", "\\ref{tbl:budget}"], pdf=["Budget"]),

batch("20-literature-review", r"""---
title: A Survey
author: L. Reviewer
template: article
bib: refs.bib
---

# Survey

Early work [@knuth1984] then [@lamport1994] then [@vaswani2017].
Each is cited again: @knuth1984 inline.
""", tex=["\\cite{knuth1984}"], pdf=["Survey"]),

# ---------- 21-30: professionals / letters ----------
batch("21-formal-letter", r"""---
template: letter
date: June 13, 2026
to: |
  The Dean
  Faculty of Engineering
from: |
  Vishesh Yadav
  Hostel B-204
subject: Leave application
---

Respected Sir,

I request leave from June 20–25 due to a family function.

Yours sincerely,
Vishesh Yadav
""", tex=["Subject: Leave application", "The Dean\\\\", "Vishesh Yadav\\\\"], pdf=["Respected"]),

batch("22-notice", r"""---
template: notice
date: June 13, 2026
from: The Warden
subject: Water supply interruption
---

Notice is hereby given that water supply will remain suspended
on Sunday from 9am to 1pm for tank cleaning.

All residents are requested to store water in advance.
""", tex=["Subject: Water supply"], pdf=["Notice"]),

batch("23-cv", r"""---
title: Vishesh Yadav
template: cv
---

# Education

**B.Tech CSE**, IIT — 2024. GPA 9.1/10.

# Experience

**Research Intern**, BigLab (2025): built `markus`, a LaTeX compiler.

# Skills

Python, C++, PyTorch, LaTeX
""", tex=["\\section{Education}", "\\texttt{markus}"], pdf=["Education", "Experience"]),

batch("24-cover-letter", r"""---
template: letter
date: June 13, 2026
to: |
  Hiring Manager
  DeepResearch Inc.
from: Vishesh Yadav
subject: Application for Research Engineer
---

Dear Hiring Manager,

I am writing to apply for the Research Engineer role. I built a
Markdown-to-LaTeX compiler with 55 passing tests and a VS Code extension.

Best regards,
Vishesh
""", tex=["Application for Research Engineer"], pdf=["Hiring"]),

batch("25-memo", r"""---
template: memo
---

# Memo: Server migration

Effective Monday, all builds run on `ci-2`. Update your remotes:

```bash
git remote set-url origin git@ci-2:repo.git
```
""", tex=["lstlisting"], pdf=["migration"]),

batch("26-invoice-table", r"""# Invoice #042

| Item | Qty | Price | Total |
|:-----|:---:|------:|------:|
| Consulting | 10 | $150 | $1,500 |
| Hosting | 1 | $40 | $40 |

: Table: June 2026 invoice

**Amount due: $1,540** — payable by June 30.
""", tex=["{lcrr}", "\\$1,540"], pdf=["Invoice"]),

batch("27-project-readme-manual", r"""# Widget Manual

## Install

```bash
pip install widget
```

## Usage

Run `widget --fast` for speed. See [docs](https://widget.dev/docs#install).

::: tip
Use a virtualenv.
:::
""", tex=["\\href{https://widget.dev/docs\\#install}", "markuscallout"], pdf=["Manual"]),

batch("28-recipe", r"""# Dal Tadka

Serves 4 · 30 min

## Ingredients

- 1 cup toor dal
- 2 tomatoes, chopped
- ghee, cumin, garlic

## Steps

1. Pressure-cook dal (3 whistles)
2. Fry tadka in ghee
3. Combine and simmer 5 min

::: tip
Add a pinch of hing with the cumin.
:::
""", tex=["\\begin{enumerate}"], pdf=["Ingredients"]),

batch("29-newsletter", r"""# Lab Newsletter — June

## Wins

- Paper accepted at NeurIPS 🎉
- New GPU cluster online

## Quote of the month

> Simplicity is prerequisite for reliability. — Dijkstra
""", tex=["\\begin{quote}"], pdf=["Newsletter"], warn=["U+1F389"]),

batch("30-meeting-agenda", r"""# Agenda — Q3 Planning

1. Review Q2 metrics *(15 min)*
2. Roadmap discussion *(30 min)*
3. AOB

<!-- remember to book the room -->

Pre-read: [Q2 report](https://internal/q2_report.pdf)
""", tex=["\\textit{(15 min)}"], pdf=["Agenda"]),

# ---------- 31-40: domain specialists ----------
batch("31-economist", r"""# Market note

GDP grew 3.2% while inflation hit 6.1%. The rupee traded at $1 = ₹83.
Brent at $85/bbl; gold above $2,300/oz and €2,100.

Real rate $r = i - \pi$ stays negative.
""", tex=["\\%", "Rs.~", "\\texteuro{}", "$r = i - \\pi$"], pdf=["GDP"]),

batch("32-chemist", r"""# Synthesis notes

Reaction: 2H$_2$ + O$_2$ → 2H$_2$O at 25°C, ΔH < 0.

Yield was 78% ± 3%.
""", tex=["\\rightarrow", "^{\\circ}", "\\Delta", "\\pm"], pdf=["Synthesis"]),

batch("33-biologist", r"""# Field observations

*Panthera tigris* sighted near grid B4. Population estimate: 12–15.

| Species | Count |
|---------|------:|
| *P. tigris* | 3 |
| *Axis axis* | 40 |
""", tex=["\\textit{Panthera tigris}", "\\textit{P. tigris}"], pdf=["Field"]),

batch("34-statistician", r"""# Model comparison

| Model | AIC | $R^2$ | $p$ |
|:------|----:|------:|----:|
| OLS | 412.3 | 0.81 | <0.001 |
| GLM | 398.7 | **0.86** | <0.001 |

: Table: Fit statistics {#tbl:fit}

GLM wins (@tbl:fit). Note $R^2$ renders in the header.
""", tex=["$R^2$", "\\textbf{0.86}", "\\ref{tbl:fit}"], pdf=["GLM"]),

batch("35-engineer-codes", r"""# Snippets

```c
int main(void) { return 0; }
```

```rust
fn main() { println!("ok"); }
```

```go
func main() {}
```

```javascript
const x = () => 1;
```

```sql
SELECT * FROM t WHERE id = 1;
```
""", tex=["language={C}", "language={Go}", "language={SQL}"], pdf=["Snippets"]),

batch("36-physicist-units", r"""# Measurements

Speed of light $c = 3 \times 10^8$ m/s. Planck $h \approx 6.6 \times 10^{-34}$ J·s.

Energy levels: $E_n = -13.6/n^2$ eV for $n = 1, 2, \ldots$
""", tex=["10^8", "10^{-34}"], pdf=["Measurements"]),

batch("37-linguist-multilingual", r"""# Loanwords

French: café, naïveté, déjà vu. German: Müller, Größe.
Spanish: mañana, niño. Norwegian: smørbrød.

The word "schadenfreude" entered English unchanged.
""", tex=["café", "Müller", "``schadenfreude''"], pdf=["Loanwords"]),

batch("38-historian-footnotes", r"""# The Treaty

The treaty was signed in 1648[^a], ending the war[^b].

[^a]: The Peace of Westphalia, October 1648.
[^b]: The Thirty Years' War, 1618–1648.

Both dates are disputed by some scholars[^a].
""", tex=["\\footnote{The Peace of Westphalia"], pdf=["Treaty"]),

batch("39-essayist", r"""# On Brevity

"Brevity," she said, "is the soul of wit." Yet we ramble — endlessly,
needlessly — past the point.

> The present letter is a very long one, simply because I had no
> leisure to make it shorter. — Pascal

It's true; one's drafts grow.
""", tex=["``Brevity,''", "\\begin{quote}"], pdf=["Brevity"]),

batch("40-novelist", r"""# Chapter One

The rain had not stopped for three days.\\
Neither had the phone.

---

She opened the letter slowly. *Finally*, she thought.

---

Morning came gray and quiet.
""", tex=["\\\\", "\\rule{\\linewidth}", "\\textit{Finally}"], pdf=["rain"]),

# ---------- 41-50: stress / edge cases ----------
batch("41-escape-stress", r"""# Escapes

Literal: \$ \* \_ \# \@ \~ \[ \] \! \- \. \( \)

Price \$5 stays; \*not bold\*; user\@host stays.
""", tex=["\\$5", "*not bold*"], pdf=["Escapes"]),

batch("42-math-stress", r"""# Math

Inline $a_ij$ and $x^10$ normalize. Sum $\sum_{i=1}^{n} i$.

$$
f(x) = \begin{cases} 1 & x > 0 \\ 0 & \text{else} \end{cases}
$$

$$
a &= b + c \\
d &= e
$$ {#eq:sys}

Gather form:

$$
p = q \\
r = s
$$
""", tex=["a_{ij}", "x^{10}", "\\begin{cases}", "\\begin{align}", "\\begin{gather}"], pdf=["Math"]),

batch("43-yaml-error", r"""---
title: "Bad \log escape"
---

Body.
""", fail=True, warn=["front matter"]),

batch("44-empty-and-minimal", "Just one paragraph, nothing else.\n", tex=["Just one paragraph"], pdf=["paragraph"]),

batch("45-table-stress", r"""# Tables

| A | B |
|---|---|
| pipe \| inside | ok |
| short |
| x | y | extra merges |

| Right | Center |
|------:|:------:|
| 1 | 2 |
""", tex=["pipe | inside".replace("|", "\\textbar") if False else "pipe", "{rc}"], pdf=["Tables"]),

batch("46-links-urls", r"""# Links

Plain: [site](https://example.com/a_b~c#frag?x=1&y=2)
Self: [https://example.com](https://example.com)
Email-like text with @ stays: contact admin@example.com.
""", tex=["\\href{https://example.com/a_b~c\\#frag?x=1&y=2}", "\\url{https://example.com}", "admin@example.com"], pdf=["Links"]),

batch("47-deep-nesting", r"""# Nesting

- level 1
  - level 2
    - level 3
      - level 4
- back to 1

1. first
   - mixed bullet
2. second
""", tex=["\\begin{itemize}", "\\begin{enumerate}"], pdf=["Nesting"]),

batch("48-env-with-content", r"""# Rich environments

::: theorem Master
For $T(n) = aT(n/b) + f(n)$:

1. case one
2. case two

With a table:

| a | b |
|---|---|
| 1 | 2 |
:::

After the theorem.
""", tex=["\\begin{theorem}[Master]", "\\begin{enumerate}"], pdf=["Master"]),

batch("49-comments-and-breaks", r"""# Doc

Visible one. <!-- invisible -->

<!--
A whole hidden block
spanning lines
-->

Visible two.

\newpage

Visible three on page 2.
""", tex=["\\newpage"], pdf=["Visible two", "Visible three"]),

batch("50-kitchen-sink", r"""---
title: 'Kitchen Sink: $E = mc^2$ Edition'
author:
  - name: Max Imal
    affiliation: Everything U
date: June 13, 2026
keywords: all, the, things
abstract: |
  One document, every feature.
template: article
bib: refs.bib
---

# Everything {#sec:all}

**Bold**, *italic*, ~~struck~~, `code`, $\pi r^2$, [@knuth1984; @vaswani2017],
a link [here](https://example.com), footnote[^z], and @sec:all.

[^z]: Tiny footnote.

$$
e^{i\pi} + 1 = 0
$$ {#eq:euler}

- [ ] task
  - nested
- [x] done

> A quote with "smart quotes" and an em—dash.

| L | C | R |
|:--|:-:|--:|
| **a** | $x$ | 1 |

: Table: Everything table {#tbl:all}

![A figure](fig.png){#fig:all width=0.4}

::: warning
Mind the gap between @eq:euler, @tbl:all and @fig:all.
:::

```python
print("done")
```
""", tex=["\\sout{struck}", "\\cite{knuth1984,vaswani2017}", "\\footnote{Tiny footnote.}",
          "\\label{eq:euler}", "\\markusopenbox", "{lcr}", "\\eqref{eq:euler}"], pdf=["Everything"]),

assert_count = len(B)

def run_one(b):
    d = ROOT / b["name"]
    shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True)
    (d / "refs.bib").write_text(REFS)
    make_png(d / "fig.png")
    src = d / "doc.mks"
    src.write_text(b["mks"])
    r = subprocess.run([MARKUS, "build", str(src), "-o", str(d / "out")],
                       capture_output=True, text=True, timeout=240)
    issues = []
    stderr = r.stderr or ""
    if b["fail"]:
        if r.returncode == 0:
            issues.append("expected failure but build succeeded")
        for w in b["warn"]:
            if w not in stderr:
                issues.append(f"expected error text {w!r} missing")
        return b["name"], issues, stderr
    if r.returncode != 0:
        issues.append("BUILD FAILED:\n" + "\n".join(stderr.strip().splitlines()[:8]))
        return b["name"], issues, stderr
    tex = (d / "out" / "doc.tex").read_text()
    for t in b["tex"]:
        if t not in tex:
            issues.append(f"tex missing {t!r}")
    pdfp = d / "out" / "doc.pdf"
    if not pdfp.exists():
        issues.append("pdf not produced")
    elif b["pdf"]:
        from pypdf import PdfReader
        text = "".join(p.extract_text() or "" for p in PdfReader(str(pdfp)).pages)
        squashed = text.replace(" ", "").replace("\n", "")
        for t in b["pdf"]:
            if t not in text and t.replace(" ", "") not in squashed:
                issues.append(f"pdf text missing {t!r}")
    for w in b["warn"]:
        if w not in stderr:
            issues.append(f"expected warning {w!r} missing")
    return b["name"], issues, stderr

def main():
    print(f"{assert_count} batches")
    results = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        for name, issues, stderr in ex.map(run_one, B):
            status = "PASS" if not issues else "FAIL"
            results.append((name, issues))
            print(f"{status}  {name}" + ("" if not issues else "\n      " + "\n      ".join(issues)))
    fails = [r for r in results if r[1]]
    print(f"\n{len(results) - len(fails)}/{len(results)} passed")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
