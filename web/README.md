# Markus Studio

An Overleaf-style **live editor** for Markus. Overleaf previews LaTeX → PDF;
Markus Studio previews **`.mks` (Markdown-like) → LaTeX → PDF**, side by side.

![layout](#) Editor on the left (CodeMirror, markdown highlighting), live preview
on the right with three tabs:

- **PDF** — the compiled document rendered with a custom PDF.js canvas viewer
  (no browser chrome; clean pages on the paper background, with a minimal zoom
  control). Auto-recompiles ~1s after you stop typing.
- **LaTeX** — the generated `.tex`, so you can see exactly what Markus emits
- **Problems** — `markus check` diagnostics with `.mks` line numbers, plus LaTeX errors

Also: example gallery (paper, lecture notes, letter, planner, beamer slides,
assignment, CV), template override dropdown, draggable split, download buttons
for `.mks` / `.tex` / `.pdf`, and the document persists in localStorage.

## Run it

Requires the markus CLI (repo root: `pip install -e .`) and TeX Live / MacTeX
with `latexmk` for PDF output.

```bash
cd web
npm install
npm run dev        # http://localhost:4400
```

Production:

```bash
npm run build && npm run start
```

If the CLI isn't auto-detected (`../.venv/bin/markus`, PATH), point at it:

```bash
MARKUS_BIN=/path/to/markus npm run dev
```

## How it works

- `POST /api/compile` `{source, template?, format: "pdf"|"tex"}` — writes the
  document to a temp dir (with a demo `refs.bib` and `fig.png` so examples with
  citations/figures just work), runs `markus build`, and returns
  `{tex, pdf (base64), warnings, error, ms}`.
- `GET /api/health` — reports the resolved markus binary and version.

Compilation runs on the server (like Overleaf), so the browser needs no TeX.
