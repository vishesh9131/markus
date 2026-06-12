# Markus

Write academic manuscripts in `.mks` (Markdown-like syntax) and compile to LaTeX-quality PDF.

Full documentation lives in [README.mks](README.mks).

```bash
pip install -e .
markus templates          # list IEEE, ACM, two-column, etc.
markus build paper.mks
markus build paper.mks -t ieee   # IEEE two-column conference
```
