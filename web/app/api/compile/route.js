import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SOURCE = 512 * 1024;
const COMPILE_TIMEOUT_MS = 90_000;

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

// 1x1 blue PNG so examples can use ![..](fig.png) without a real asset
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
  return "markus"; // hope it's on PATH
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
  if (!source.trim()) {
    return Response.json({ ok: false, error: "Empty document" }, { status: 400 });
  }
  if (source.length > MAX_SOURCE) {
    return Response.json({ ok: false, error: "Document too large" }, { status: 413 });
  }

  const markus = findMarkus();
  const work = await mkdtemp(path.join(tmpdir(), "markus-web-"));
  const t0 = Date.now();
  try {
    const src = path.join(work, "doc.mks");
    await writeFile(src, source, "utf8");
    await writeFile(path.join(work, "refs.bib"), DEMO_BIB, "utf8");
    await writeFile(path.join(work, "fig.png"), DEMO_PNG);
    const outDir = path.join(work, "out");

    const args = ["build", src, "-o", outDir];
    if (template) args.push("-t", template);
    if (!wantPdf) args.push("--tex-only");

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

    const failed = Boolean(error);
    return Response.json({
      ok: !failed,
      tex,
      pdf,
      warnings,
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
  } finally {
    rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
