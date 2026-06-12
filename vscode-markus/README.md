# Markus VS Code / Cursor extension

## Plug and play (recommended)

1. Install **Python 3.10+** on the machine (local or SSH remote).
2. Install a **TeX** distribution with `latexmk` (MacTeX, TeX Live, or MiKTeX).
3. Build the VSIX once from this repo:

```bash
cd vscode-markus
npm run bundle          # copies the Markus compiler into bundled/
npx @vscode/vsce package
```

4. In Cursor/VS Code: **Extensions → Install from VSIX** → pick `markus-language-0.4.0.vsix`.
5. Reload the window. Open any `.mks` file → **Markus Preview**.

No `pip install markus` required — the extension ships its own compiler. You only need **Python** (to run it) and **TeX** (to make PDFs).

## Settings (optional)

| Setting | When to use |
|---------|-------------|
| `markus.cliPath` | Override bundled compiler (e.g. dev install `pip install -e .`) |
| `markus.texBinPath` | If `latexmk` is not on PATH (e.g. `/Library/TeX/texbin`) |

## Develop

```bash
npm run bundle
# F5 to launch Extension Development Host
```

`vscode:prepublish` runs `bundle` automatically when packaging with `vsce`.
