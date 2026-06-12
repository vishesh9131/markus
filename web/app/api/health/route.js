import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET() {
  const markus = findMarkus();
  const version = await new Promise((resolve) => {
    execFile(markus, ["--version"], { timeout: 10_000 }, (err, stdout) =>
      resolve(err ? null : (stdout || "").trim())
    );
  });
  return Response.json({ ok: Boolean(version), markus: version, bin: markus });
}
