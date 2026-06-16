// Run: node web/lib/mksLint.test.mjs
import assert from "node:assert";
import { mksDiagnostics } from "./mksLint.js";

// tab flagged with the exact one-char range
let d = mksDiagnostics("a\tb");
assert.equal(d.length, 1);
assert.deepStrictEqual([d[0].from, d[0].to, d[0].severity], [1, 2, "warning"]);

// \input flagged as disabled
assert.ok(mksDiagnostics("```latex\n\\input{/etc/passwd}\n```").some((x) => x.message.includes("disabled")));

// citation without bib -> flagged; with bib -> not
assert.ok(mksDiagnostics("\\cite{x}").some((x) => x.message.includes("bib")));
assert.ok(!mksDiagnostics("bib: refs.bib\n\\cite{x}").some((x) => x.message.includes("bib")));

// wrong math delimiter -> info severity
assert.ok(mksDiagnostics("\\(x\\)").some((x) => x.severity === "info"));

console.log("mksLint: all checks passed");
