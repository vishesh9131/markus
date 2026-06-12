# Markus

Write research papers, notes, todos, lecture handouts, letters and notices in `.mks` (Markdown-like syntax) and compile to LaTeX-quality PDF.

Full documentation lives in [README.mks](README.mks).

```bash
pip install -e .
markus templates                 # article, notes, letter, report, beamer, IEEE, ACM, ...
markus build paper.mks
markus build paper.mks -t ieee   # IEEE two-column conference
markus build paper.mks -w        # watch mode: rebuild on save
markus check paper.mks           # lint refs, citations, figures
```

## Markus Studio (web editor)

An Overleaf-style live editor lives in [web/](web/): write `.mks` on the left,
watch the generated LaTeX and compiled PDF update on the right.

```bash
cd web && npm install && npm run dev   # http://localhost:4400
```
