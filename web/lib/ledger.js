import { promises as fs } from "node:fs";
import path from "node:path";

// A small server-side ledger of paid upgrades, keyed by email.
//
// The Razorpay webhook records payments here because it runs server-to-server
// with no user session — and therefore no access to the buyer's Google Drive,
// where subscription state ultimately lives. On the user's next load (when their
// Drive token IS present) we reconcile: each unclaimed payment is applied to
// their Drive account, then marked claimed so it can never double-grant.
//
// Storage: Netlify Blobs in production; local disk (.data/ledger) in dev or on
// any host where Blobs isn't available. Both are best-effort and never throw to
// the caller — a billing-ledger hiccup must not block loading the studio.

const STORE_NAME = "markus-billing";

async function blobStore() {
  try {
    const { getStore } = await import("@netlify/blobs");
    // Auto-configured when running inside the Netlify runtime.
    return getStore({ name: STORE_NAME, consistency: "strong" });
  } catch {
    return null; // not on Netlify (or package unavailable) → fall back to disk
  }
}

function diskPath(email) {
  const safe = email.replace(/[^a-z0-9_.-]/gi, "_");
  return path.join(process.cwd(), ".data", "ledger", `${safe}.json`);
}

const EMPTY = { pending: [], claimed: [] };

async function readRecord(email) {
  const store = await blobStore();
  if (store) {
    const v = await store.get(email, { type: "json" });
    return v || { ...EMPTY };
  }
  try {
    return JSON.parse(await fs.readFile(diskPath(email), "utf8"));
  } catch {
    return { ...EMPTY };
  }
}

async function writeRecord(email, rec) {
  const store = await blobStore();
  if (store) {
    await store.setJSON(email, rec);
    return;
  }
  const p = diskPath(email);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(rec, null, 2));
}

// Called by the webhook on payment.captured. Idempotent: Razorpay retries
// webhooks, so a paymentId already seen (pending or claimed) is ignored.
export async function recordPayment(email, { paymentId, months }) {
  if (!email || !paymentId) return;
  const rec = await readRecord(email);
  const seen =
    (rec.claimed || []).includes(paymentId) ||
    (rec.pending || []).some((p) => p.paymentId === paymentId);
  if (seen) return;
  rec.pending = [...(rec.pending || []), { paymentId, months, at: new Date().toISOString() }];
  await writeRecord(email, rec);
}

// Unclaimed payments for this email (does not mutate).
export async function pendingPayments(email) {
  const rec = await readRecord(email);
  return rec.pending || [];
}

// Move a payment from pending → claimed, after it's been applied to the
// user's Drive account. Safe to call more than once.
export async function markClaimed(email, paymentId) {
  const rec = await readRecord(email);
  rec.pending = (rec.pending || []).filter((p) => p.paymentId !== paymentId);
  rec.claimed = Array.from(new Set([...(rec.claimed || []), paymentId]));
  await writeRecord(email, rec);
}

// Remove this email's billing record entirely (used on account deletion).
// Best-effort: never throws.
export async function clearLedger(email) {
  try {
    const store = await blobStore();
    if (store) {
      await store.delete(email);
      return;
    }
    await fs.rm(diskPath(email), { force: true });
  } catch {
    /* best-effort */
  }
}
