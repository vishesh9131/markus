# Markus Studio

An Overleaf-style **live editor** for Markus. Overleaf previews LaTeX → PDF;
Markus Studio previews **`.mks` (Markdown-like) → LaTeX → PDF**, side by side.

![layout](#) Editor on the left (CodeMirror, markdown highlighting), live preview
on the right with three tabs:

- **PDF** — the compiled document rendered with a custom PDF.js canvas viewer
  (no browser chrome; clean pages on the paper background, with a minimal zoom
  control, page navigation, fit modes, rotate, download, print, and a
  selectable/copyable text layer). Auto-recompiles ~1s after you stop typing.
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

## Performance

Live editing uses a fast path so the preview keeps up with typing:

- each browser tab gets a **persistent session work dir** on the server, so
  latexmk/pdflatex builds stay *warm* (aux files are reused) instead of starting
  cold in a throwaway temp dir every keystroke
- while typing, the API runs a **single `pdflatex` pass** (`markus build --fast`)
  — about 0.5s — instead of the full multi-pass latexmk (~2s). Cross-references
  and citations come from the previous pass (one compile behind)
- structural changes (load example, switch template, first load) and the manual
  **Compile** button do a correct full build that re-seeds the warm cache
- the editor debounce is 350ms; the in-browser PDF keeps your scroll position
  across re-renders

Net effect: continuous typing previews in ~0.9s instead of ~3s.

## How it works

- `POST /api/compile` `{source, template?, format: "pdf"|"tex"}` — writes the
  document to a temp dir (with a demo `refs.bib` and `fig.png` so examples with
  citations/figures just work), runs `markus build`, and returns
  `{tex, pdf (base64), warnings, error, ms}`.
- `GET /api/health` — reports the resolved markus binary and version.

Compilation runs on the server (like Overleaf), so the browser needs no TeX.
