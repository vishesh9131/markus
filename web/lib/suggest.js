// Live, client-side writing hints for a .mks document. Pure function over the
// source text — no compile needed, so it updates as the user types. Each rule
// is (condition -> message); returns at most a handful so the panel stays calm.
export function getHints(source = "", { plan = "free" } = {}) {
  const s = source;
  const out = [];
  const add = (id, level, text) => out.push({ id, level, text });
  const headings = (s.match(/^#{1,6}\s/gm) || []).length;

  if (!/^\s*---\s*\r?\n[\s\S]*?\r?\n---/.test(s))
    add("frontmatter", "tip", "Start with a --- block (title, author, template) to set up the document.");
  if (headings === 0 && s.trim().length > 160)
    add("headings", "tip", "Add # headings to give the document structure and a table of contents.");
  if (/\t/.test(s))
    add("tabs", "warn", "Use spaces, not tabs — tabs can break list nesting.");
  if (/```(latex|tex)/.test(s))
    add("rawlatex", "warn", "Raw LaTeX is allowed, but \\input, \\write and shell commands are disabled in the web compiler.");
  if (/\\\(|\\\)|\\\[|\\\]/.test(s))
    add("mathdelim", "tip", "Markus uses $...$ for inline math and $$...$$ for display math.");
  if (/(\\cite|\[@\w)/.test(s) && !/^\s*bib(liography)?\s*:/m.test(s))
    add("cite", "warn", "Add 'bib: refs.bib' to the --- block so your citations resolve.");
  if (/!\[[^\]]*\]\(/.test(s))
    add("image", "tip", "Images load from your workspace folder. The demo fig.png is always available.");
  if (/^\|.*\|/m.test(s) && !/^\s*\|?[\s:-]*-{2,}[\s:|-]*$/m.test(s))
    add("table", "warn", "Tables need a |---|---| separator line under the header row.");
  if (/```mermaid/.test(s))
    add("mermaid", "tip", "Mermaid blocks render to a diagram when the server supports it, otherwise the source is shown.");
  if (plan !== "premium" && headings >= 8)
    add("pages", "tip", "Long document — the free plan renders up to 5 pages. Upgrade for unlimited.");

  return out.slice(0, 5);
}
