import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// allow the compiler to be called cross-origin (e.g. browser on Netlify -> Render)
const CORS = {
  "Access-Control-Allow-Origin": process.env.COMPILE_ALLOW_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
function json(data, init = {}) {
  return Response.json(data, { ...init, headers: { ...CORS, ...(init.headers || {}) } });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const MAX_SOURCE = 512 * 1024;
const COMPILE_TIMEOUT_MS = 90_000;
const SESSIONS_ROOT = path.join(tmpdir(), "markus-web-sessions");
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // reap idle sessions after 2h

// Untrusted-input hardening (the compiler is internet-reachable):
const MAX_OUTPUT = 16 * 1024 * 1024; // cap child stdout/stderr we buffer
const MAX_CONCURRENT = Number(process.env.COMPILE_MAX_CONCURRENT || 4); // global pdflatex cap
const RL_WINDOW_MS = 60_000;
const RL_MAX = Number(process.env.COMPILE_RATE_LIMIT || 40); // compiles / minute / IP
const LATEX_MAX_SECONDS = Math.max(10, Math.floor(COMPILE_TIMEOUT_MS / 1000) - 5); // python self-limit

let activeCompiles = 0;
const rlHits = new Map();
function clientIp(request) {
  const xff = request.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}
function rateLimited(ip) {
  const now = Date.now();
  if (rlHits.size > 10_000) rlHits.clear(); // crude prune to bound memory
  const e = rlHits.get(ip);
  if (!e || now > e.resetAt) {
    rlHits.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return false;
  }
  e.count += 1;
  return e.count > RL_MAX;
}

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
    let child;
    try {
      // detached → new process group, so a timeout can kill pdflatex (a grandchild
      // of `markus`), not just the python parent. That fixes runaway orphans.
      child = spawn(cmd, args, { ...opts, detached: true });
    } catch (error) {
      return resolve({ error, stdout: "", stderr: "" });
    }
    let stdout = "";
    let stderr = "";
    let killed = false;
    child.stdout?.on("data", (d) => { if (stdout.length < MAX_OUTPUT) stdout += d; });
    child.stderr?.on("data", (d) => { if (stderr.length < MAX_OUTPUT) stderr += d; });
    const timer = setTimeout(() => {
      killed = true;
      try {
        process.kill(-child.pid, "SIGKILL"); // whole group
      } catch {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
      }
    }, COMPILE_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ error, stdout, stderr });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let error = null;
      if (killed) {
        error = new Error("Compile timed out");
        error.killed = true;
      } else if (code !== 0) {
        error = new Error(`exited ${code}`);
        error.code = code;
      }
      resolve({ error, stdout, stderr });
    });
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
  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return json({ ok: false, error: "Too many compile requests — please slow down." }, { status: 429 });
  }
  if (activeCompiles >= MAX_CONCURRENT) {
    return json({ ok: false, error: "Compiler busy — please retry in a moment." }, { status: 503 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const source = typeof body.source === "string" ? body.source : "";
  const template = typeof body.template === "string" ? body.template.trim() : "";
  const wantPdf = body.format !== "tex";
  const fast = wantPdf && body.fast !== false;
  const reset = body.reset === true; // wipe warm cache (template/example switch)
  const sid = String(body.sessionId || "default").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "default";

  if (!source.trim()) {
    return json({ ok: false, error: "Empty document" }, { status: 400 });
  }
  if (source.length > MAX_SOURCE) {
    return json({ ok: false, error: "Document too large" }, { status: 413 });
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

    activeCompiles += 1;
    let result;
    try {
      result = await run(markus, args, {
        cwd: work,
        // MARKUS_SANDBOX locks down TeX (no shell-escape, file-I/O primitives
        // neutralised); MARKUS_MAX_SECONDS is the in-process LaTeX time limit.
        env: { ...process.env, MARKUS_SANDBOX: "1", MARKUS_MAX_SECONDS: String(LATEX_MAX_SECONDS) },
      });
    } finally {
      activeCompiles -= 1;
    }
    const { error, stderr } = result;
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
    return json({
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
