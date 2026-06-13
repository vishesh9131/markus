import { auth } from "../../../../auth";
import { grantPremium, getAccount } from "../../../../lib/accounts";
import { getStore } from "../../../../lib/storage";
import { PREMIUM } from "../../../../lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Redeem a promo code for premium (no payment). Validated server-side so it
// can't be bypassed from the browser. Override the code via the PROMO_CODE env.
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const { code } = await request.json().catch(() => ({}));
  const valid = process.env.PROMO_CODE || "markus@Vishesh";
  const months = Number(process.env.PROMO_MONTHS || PREMIUM.months);

  if (!code || String(code).trim() !== valid) {
    return Response.json({ ok: false, error: "Invalid promo code" }, { status: 400 });
  }

  const store = getStore(session);
  const until = await grantPremium(store, months);
  return Response.json({
    ok: true,
    account: await getAccount(store, session.user.email),
    premiumUntil: until,
  });
}
