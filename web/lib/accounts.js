import { promises as fs } from "node:fs";
import path from "node:path";

// Lightweight file-backed account/subscription store.
// NOTE: for production, swap this for a real DB (Postgres, etc.) — the shape
// (keyed by email) is intentionally trivial to migrate. Subscription state must
// live server-side (not in the user's Drive) so it can't be tampered with.
const FILE = path.join(process.cwd(), ".data", "accounts.json");

async function readAll() {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeAll(data) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getAccount(email) {
  const all = await readAll();
  const a = all[email] || {};
  const active = a.premiumUntil && Date.parse(a.premiumUntil) > Date.now();
  return {
    email,
    tier: active ? "premium" : "free",
    premiumUntil: active ? a.premiumUntil : null,
  };
}

export async function grantPremium(email, months) {
  const all = await readAll();
  const cur = all[email] || {};
  // extend from the later of now / existing expiry
  const base = cur.premiumUntil && Date.parse(cur.premiumUntil) > Date.now()
    ? Date.parse(cur.premiumUntil)
    : Date.now();
  const until = new Date(base + months * 30 * 24 * 3600 * 1000).toISOString();
  all[email] = { ...cur, premiumUntil: until };
  await writeAll(all);
  return until;
}
