import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SOURCE = 512 * 1024;
const COMPILE_TIMEOUT_MS = 90_000;
const SESSIONS_ROOT = path.join(tmpdir(), "markus-web-sessions");
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // reap idle sessions after 2h

// demo bibliography available to every web document as `bib: refs.bib`
const DEMO_BIB = `@article{knuth1984, author={Donald Knuth}, title={Literate Programming},
journal={The Computer Journal}, year={1984}}
@book{lamport1994, author={Leslie Lamport}, title={LaTeX: A Document Preparation System},
publisher={Addison-Wesley}, year={1994}}
@inproceedings{vaswani2017, author={Ashish Vaswani and others},
title={Attention Is All You Need}, booktitle={NeurIPS}, year={2017}}
@misc{markus2026, author={Vishesh Yadav}, title={Markus: Markdown-like manuscripts},
howpublished={\\url{https://github.com/vishesh9131/markus}}, year={2026}}
`;

// small blue PNG so examples can use ![..](fig.png) without a real asset
const DEMO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAUAAAADICAIAAAAWZq/8AAACYElEQVR4nO3TQQ0AIBDAsFOHJiQi" +
    "Cw98yJImFbDPZu0DRM33AuCZgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwM" +
    "YQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczA" +
    "EGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIM" +
    "DGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHM" +
    "wBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjC" +
    "DAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEh" +
    "zMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkY" +
    "wgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iB" +
    "IczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZ" +
    "GMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OY" +
    "gSHMwBBmYAgzMIQZGMIMDGEXBA/yRVX+kewAAAAASUVORK5CYII=",
  "base64"
);

// serialize compiles per session so two pdflatex runs never share a dir at once
const chains = new Map();
function withLock(key, fn) {
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  chains.set(
    key,
    run.then(
      () => {},
      () => {}
    )
  );
  return run;
}

function findMarkus() {
  if (process.env.MARKUS_BIN && existsSync(process.env.MARKUS_BIN)) {
    return process.env.MARKUS_BIN;
  }
  const candidates = [
    path.resolve(process.cwd(), "../.venv/bin/markus"),
    path.resolve(process.cwd(), ".venv/bin/markus"),
    "/opt/homebrew/bin/markus",
    "/usr/local/bin/markus",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "markus";
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: COMPILE_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, ...opts },
      (error, stdout, stderr) => resolve({ error, stdout: stdout ?? "", stderr: stderr ?? "" })
    );
  });
}

function splitStderr(stderr) {
  const warnings = [];
  const errors = [];
  for (const line of stderr.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("warning:")) warnings.push(t.replace(/^warning:\s*/, ""));
    else errors.push(t);
  }
  return { warnings, errors };
}

async function reapOldSessions() {
  try {
    const entries = await readdir(SESSIONS_ROOT);
    const now = Date.now();
    await Promise.all(
      entries.map(async (name) => {
        const p = path.join(SESSIONS_ROOT, name);
        try {
          const s = await stat(p);
          if (now - s.mtimeMs > SESSION_TTL_MS) await rm(p, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      })
    );
  } catch {
    /* no sessions yet */
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const source = typeof body.source === "string" ? body.source : "";
  const template = typeof body.template === "string" ? body.template.trim() : "";
  const wantPdf = body.format !== "tex";
  const fast = wantPdf && body.fast !== false;
  const reset = body.reset === true; // wipe warm cache (template/example switch)
  const sid = String(body.sessionId || "default").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "default";

  if (!source.trim()) {
    return Response.json({ ok: false, error: "Empty document" }, { status: 400 });
  }
  if (source.length > MAX_SOURCE) {
    return Response.json({ ok: false, error: "Document too large" }, { status: 413 });
  }

  const markus = findMarkus();
  const work = path.join(SESSIONS_ROOT, sid);
  const outDir = path.join(work, "out");

  return withLock(sid, async () => {
    const t0 = Date.now();
    if (reset) await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    const src = path.join(work, "doc.mks");
    await writeFile(src, source, "utf8");
    // static assets: write once so their mtime stays stable (keeps builds warm)
    for (const [name, content] of [["refs.bib", DEMO_BIB], ["fig.png", DEMO_PNG]]) {
      const p = path.join(work, name);
      if (!existsSync(p)) await writeFile(p, content);
    }

    const args = ["build", src, "-o", outDir];
    if (template) args.push("-t", template);
    if (!wantPdf) args.push("--tex-only");
    if (fast) args.push("--fast");

    const { error, stderr } = await run(markus, args, { cwd: work });
    const { warnings, errors } = splitStderr(stderr);

    let tex = null;
    try {
      tex = await readFile(path.join(outDir, "doc.tex"), "utf8");
    } catch {
      /* parse failed before tex was written */
    }
    let pdf = null;
    if (wantPdf) {
      try {
        pdf = (await readFile(path.join(outDir, "doc.pdf"))).toString("base64");
      } catch {
        /* no pdf produced */
      }
    }

    reapOldSessions(); // fire-and-forget

    const failed = Boolean(error);
    return Response.json({
      ok: !failed,
      tex,
      pdf,
      warnings,
      fast,
      error: failed
        ? errors.join("\n") ||
          (error.code === "ENOENT"
            ? `markus CLI not found (looked at ${markus}). pip install -e . in the repo, or set MARKUS_BIN.`
            : error.killed
              ? "Compile timed out"
              : String(error.message || error))
        : null,
      ms: Date.now() - t0,
    });
  });
}
