import LegalLayout from "../../components/LegalLayout";

export const metadata = { title: "Documentation — Markus Studio" };

export default function HelpPage() {
  return (
    <LegalLayout title="Markus documentation">
      <p>
        Markus is a Markdown-like language (<code>.mks</code>) that compiles to LaTeX-quality PDFs.
        Write plain text on the left, watch the PDF on the right. This is the syntax reference.
      </p>

      <h2>Front matter</h2>
      <p>Start every document with a <code>---</code> block that sets the title, author, template, and optional bibliography:</p>
      <pre>{`---
title: My Paper
author: Ada Lovelace
template: article
bib: refs.bib
---`}</pre>
      <p>Wrap a value in single quotes if it contains a colon or special characters.</p>

      <h2>Headings</h2>
      <pre>{`# Section
## Subsection
### Sub-subsection`}</pre>

      <h2>Emphasis</h2>
      <pre>{`**bold**   *italic*   ~~strikethrough~~   \`inline code\``}</pre>

      <h2>Lists</h2>
      <pre>{`- bullet one
- bullet two
  - nested (indent by two spaces)

1. first
2. second`}</pre>

      <h2>Math</h2>
      <p>Inline math uses <code>$...$</code>; display math uses <code>$$...$$</code>. Label a display equation and reference it:</p>
      <pre>{`Euler: $e^{i\\pi} + 1 = 0$.

$$
E = mc^2
$$ {#mass-energy}

See equation [@eq:mass-energy].`}</pre>

      <h2>Tables</h2>
      <pre>{`| Name  | Score |
|-------|-------|
| Ada   | 99    |
| Alan  | 97    |`}</pre>

      <h2>Links and images</h2>
      <pre>{`[Markus on GitHub](https://github.com/vishesh9131/markus)

![A caption](fig.png)`}</pre>
      <p>Images load from your workspace folder. A demo <code>fig.png</code> is always available for trying things out.</p>

      <h2>Citations</h2>
      <p>Add <code>bib: refs.bib</code> to the front matter, then cite by key. A demo <code>refs.bib</code> (knuth1984, lamport1994, vaswani2017) is available:</p>
      <pre>{`As shown in [@vaswani2017], attention works well.`}</pre>

      <h2>Callouts</h2>
      <pre>{`> [!note] This is a note.
> [!warning] Be careful here.
> [!tip] A helpful tip.`}</pre>

      <h2>Theorems</h2>
      <pre>{`::: theorem
Every bounded sequence has a convergent subsequence.
:::

::: proof
Left as an exercise.
:::`}</pre>

      <h2>Code blocks</h2>
      <pre>{"```python\ndef hello():\n    print(\"hi\")\n```"}</pre>

      <h2>Colours</h2>
      <pre>{`[red text]{color=red}   [highlighted]{bg=yellow}`}</pre>

      <h2>Diagrams (Mermaid)</h2>
      <pre>{"```mermaid\nflowchart LR\n  A --> B --> C\n```"}</pre>
      <p>Renders to a diagram when the server supports it; otherwise the source is shown so the build never fails.</p>

      <h2>Raw LaTeX</h2>
      <p>For anything Markus does not cover, drop into LaTeX:</p>
      <pre>{"```latex\n\\begin{center}\\Large Custom LaTeX\\end{center}\n```"}</pre>
      <p>
        Note: in the web compiler, file and shell commands (<code>{`\\input`}</code>, <code>{`\\write`}</code>,{" "}
        <code>{`\\write18`}</code>, …) are disabled for security. They still work in the local CLI.
      </p>

      <h2>Page breaks</h2>
      <pre>{`\\newpage`}</pre>

      <h2>Templates</h2>
      <p>
        Set <code>template:</code> in the front matter or switch with the dropdown. Available: article,
        report, book, beamer (slides), letter, cv, ieee, acm, springer-lncs (llncs), apa, nature, and more.
      </p>

      <h2>Exporting</h2>
      <p>Use the toolbar to download the <code>.mks</code> source, the generated <code>.tex</code>, or the compiled <code>.pdf</code> at any time. Everything is saved to your Google Drive automatically as you type.</p>
    </LegalLayout>
  );
}
