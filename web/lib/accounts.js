// Subscription state is read/written through the storage backend, so it lives
// wherever the user's files live: in their Google Drive (real login) or on
// local disk (demo). That keeps premium status persistent on hosts with an
// ephemeral filesystem (e.g. Render's free tier) without a separate database.

import { pendingPayments, markClaimed } from "./ledger";

export async function getAccount(store, email) {
  const a = (await store.readAccount()) || {};
  const active = a.premiumUntil && Date.parse(a.premiumUntil) > Date.now();
  return {
    email,
    tier: active ? "premium" : "free",
    premiumUntil: active ? a.premiumUntil : null,
  };
}

export async function grantPremium(store, months) {
  const a = (await store.readAccount()) || {};
  const base =
    a.premiumUntil && Date.parse(a.premiumUntil) > Date.now()
      ? Date.parse(a.premiumUntil)
      : Date.now();
  const until = new Date(base + months * 30 * 24 * 3600 * 1000).toISOString();
  await store.writeAccount({ ...a, premiumUntil: until });
  return until;
}

// Apply any webhook-recorded payments (see lib/ledger) to the user's account.
// The webhook can't reach the user's Drive, so it parks payments by email; here
// — with the user's session/Drive token available — we grant and mark claimed.
// Idempotent and best-effort: any failure is swallowed so it never blocks load.
export async function reconcilePending(store, email) {
  try {
    const pend = await pendingPayments(email);
    for (const p of pend) {
      if (p.months > 0) await grantPremium(store, p.months);
      await markClaimed(email, p.paymentId);
    }
    return pend.length > 0;
  } catch {
    return false;
  }
}
