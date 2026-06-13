// Subscription state is read/written through the storage backend, so it lives
// wherever the user's files live: in their Google Drive (real login) or on
// local disk (demo). That keeps premium status persistent on hosts with an
// ephemeral filesystem (e.g. Render's free tier) without a separate database.

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
