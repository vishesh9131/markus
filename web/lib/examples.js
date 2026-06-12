export const EXAMPLES = {
  "Research paper": `---
title: 'Attention Is Not All You Need: A $O(n \\log n)$ Study'
author:
  - name: Jane Doe
    affiliation: MIT
    email: jane@mit.edu
template: article
keywords: attention, complexity
bib: refs.bib
abstract: |
  We revisit the quadratic cost of attention and prove a tighter bound
  under mild assumptions.
---

# Introduction {#sec:intro}

Transformers [@vaswani2017] dominate. As shown by @vaswani2017,
attention scales as $O(n^2)$ — we do better[^1].

[^1]: Under mild sparsity assumptions.

$$
L(\\theta) = \\sum_{i=1}^N \\ell(y_i, f(x_i; \\theta))
$$ {#eq:loss}

Equation @eq:loss defines the loss. See Section @sec:intro.

| Model | Params | Score $F_1$ |
|:------|-------:|------------:|
| **Baseline** | 110M | 88.5 |
| *Ours* | 95M | **91.2** |

: Table: Results on GLUE ($\\pm$ std over 3 seeds) {#tbl:results}

Our approach improves over the baseline (@tbl:results).

::: theorem Main Result
For all $n$, the complexity is $O(n \\log n)$.
:::

::: proof
Apply @eq:loss and induction on $n$.
:::
`,

  "Lecture notes": `# Graph Traversal — Lecture 9

::: warning
Use a queue for BFS, not a stack. Classic exam mistake!
:::

## BFS

- explores level by level
- runtime $O(V + E)$
  - adjacency list assumed

\`\`\`python
from collections import deque

def bfs(g, s):
    seen, q = {s}, deque([s])
    while q:
        u = q.popleft()
        for v in g[u]:
            if v not in seen:
                seen.add(v); q.append(v)
\`\`\`

> DFS finds *a* path; BFS finds the *shortest* path. — every textbook

## Next time

- [ ] Dijkstra
- [x] BFS / DFS
`,

  "Formal letter": `---
template: letter
date: June 13, 2026
to: |
  The Registrar
  Stanford University
from: |
  Vishesh Yadav
  Hostel B-204
subject: Fee waiver request
---

Dear Sir/Madam,

I am writing to request a waiver of the $250 late fee for the spring
semester. The delay was caused by a documented bank error.

I would be grateful for your consideration.

Yours sincerely,
Vishesh Yadav
`,

  "Weekly planner": `# Week 25 ✅

## Must do

- [ ] Finish problem set 4
- [x] Read CLRS ch. 15
- [ ] Office hours @ 3pm
  - bring laptop
  - ask about DP table

## Schedule

| Day | Focus | Hours |
|:----|:------|------:|
| Mon | Algorithms | 3 |
| Tue | Writing | 2 |
| Wed | **Exam prep** | 4 |

Budget check: $40 printing, $15 coffee → still fine.
`,

  "Slides (beamer)": `---
title: Sorting Algorithms
author: Dr. Lecturer
template: beamer
bib: refs.bib
---

# Comparison sorts

## Why sorting matters

- search becomes $O(\\log n)$
- dedup becomes trivial
- it is **everywhere**

## Quicksort

Average $O(n \\log n)$, worst case $O(n^2)$.

\`\`\`python
def qs(a):
    if len(a) < 2: return a
    p, *r = a
    return qs([x for x in r if x < p]) + [p] + qs([x for x in r if x >= p])
\`\`\`

## Takeaway

> Premature optimization is the root of all evil. — Knuth [@knuth1984]
`,

  "Assignment": `---
title: Problem Set 2
author: J. Student
template: assignment
course: MATH 301
due: June 20, 2026
---

# Problem 1

Show that $\\sum_{k=1}^n k^2 = \\frac{n(n+1)(2n+1)}{6}$.

::: proof
By induction. The base case $n = 1$ gives $1 = \\frac{1 \\cdot 2 \\cdot 3}{6}$.
Assume it holds for $n$; adding $(n+1)^2$ completes the step.
:::

# Problem 2

Solve the system:

$$
2x + y &= 7 \\\\
x - y &= 2
$$
`,

  "CV / Résumé": `---
title: Vishesh Yadav
template: cv
---

# Education

**B.Tech, Computer Science** — IIT (2020–2024). GPA 9.1/10.

# Experience

**Research Intern**, BigLab (2025–present)

- built \`markus\`, a Markdown-to-LaTeX compiler
- 50-persona integration test suite, 62 unit tests

# Skills

Python, C++, PyTorch, LaTeX, TypeScript
`,
};

export const DEFAULT_EXAMPLE = "Research paper";

export const TEMPLATES = [
  "", // from front matter
  "article",
  "twocolumn",
  "notes",
  "letter",
  "report",
  "assignment",
  "beamer",
  "cv",
  "ieee",
  "ieee-journal",
  "ieee-trans",
  "acm",
  "acm-acmlarge",
  "springer",
  "nature",
  "apa",
];
