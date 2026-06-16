// Positional diagnostics for inline CodeMirror markers (squiggle + gutter +
// hover). Kept free of CodeMirror imports so it's pure/testable; Studio wraps
// it in @codemirror/lint's linter(). Doc-level tips (no position) stay in the
// Suggestions panel — see lib/suggest.
export function mksDiagnostics(text = "") {
  const d = [];
  const push = (from, to, severity, message) => d.push({ from, to, severity, message });
  let m;

  const tab = /\t/g;
  while ((m = tab.exec(text)))
    push(m.index, m.index + 1, "warning", "Use spaces, not tabs — tabs can break list nesting.");

  // file/shell primitives are neutralised by the web compiler
  const danger = /\\(input|include|write18|write|openin|openout|read|usepackage|catcode)\b/g;
  while ((m = danger.exec(text)))
    push(m.index, m.index + m[0].length, "warning", `\\${m[1]} is disabled in the web compiler for security.`);

  // wrong math delimiters
  const delim = /\\[()[\]]/g;
  while ((m = delim.exec(text)))
    push(m.index, m.index + m[0].length, "info", "Markus uses $...$ for inline math and $$...$$ for display.");

  // citations with no bibliography declared
  if (!/^\s*bib(liography)?\s*:/m.test(text)) {
    const cite = /\\cite\{[^}]*\}|\[@[\w:.-]+\]/g;
    while ((m = cite.exec(text)))
      push(m.index, m.index + m[0].length, "warning", "Add 'bib: refs.bib' to the front matter so this citation resolves.");
  }

  return d.slice(0, 100);
}
