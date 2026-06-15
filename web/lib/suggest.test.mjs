// Run: node web/lib/suggest.test.mjs   (not bundled by Next)
import assert from "node:assert";
import { getHints } from "./suggest.js";

const ids = (s, o) => getHints(s, o).map((h) => h.id);

// empty doc: nudge front matter, not citation/table noise
assert.deepStrictEqual(ids(""), ["frontmatter"]);

// proper front matter present -> no frontmatter hint
assert.ok(!ids("---\ntitle: A\n---\n# Hi").includes("frontmatter"));

// citation without bib -> warn; with bib -> clear
assert.ok(ids("---\ntitle: A\n---\n\\cite{x}").includes("cite"));
assert.ok(!ids("---\ntitle: A\nbib: refs.bib\n---\n\\cite{x}").includes("cite"));

// raw latex + tabs flagged
assert.ok(ids("---\nt: a\n---\n```latex\n\\x\n```").includes("rawlatex"));
assert.ok(ids("---\nt: a\n---\n\twhoops").includes("tabs"));

// never returns more than 5
assert.ok(getHints("\t```latex x``` \\cite{a} ![x](y) |a|b|\n$$x$$ \\(z\\)").length <= 5);

console.log("suggest: all checks passed");
