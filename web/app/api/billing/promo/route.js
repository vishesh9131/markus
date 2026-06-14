import { auth } from "../../../../auth";
import { getAccount, redeemPromoOnce } from "../../../../lib/accounts";
import { getStore } from "../../../../lib/storage";
import { PREMIUM } from "../../../../lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Throttle wrong-code guesses per account so the promo code can't be brute-forced.
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const ATTEMPT_MAX = 5;
const attempts = new Map(); // email -> { count, resetAt }

function attemptBlocked(email) {
  const e = attempts.get(email);
  return e && Date.now() < e.resetAt && e.count >= ATTEMPT_MAX;
}
function recordFailure(email) {
  if (attempts.size > 10_000) attempts.clear();
  const now = Date.now();
  const e = attempts.get(email);
  if (!e || now > e.resetAt) attempts.set(email, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
  else e.count += 1;
}

// Redeem a promo code for premium (no payment). Validated server-side so it
// can't be bypassed from the browser. Override the code via the PROMO_CODE env.
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const email = session.user.email;
  if (attemptBlocked(email)) {
    return Response.json(
      { ok: false, error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  const { code } = await request.json().catch(() => ({}));
  const valid = process.env.PROMO_CODE || "markus@Vishesh";
  const months = Number(process.env.PROMO_MONTHS || PREMIUM.months);

  if (!code || String(code).trim() !== valid) {
    recordFailure(email);
    return Response.json({ ok: false, error: "Invalid promo code" }, { status: 400 });
  }

  const store = getStore(session);
  const result = await redeemPromoOnce(store, valid, months);
  if (result.already) {
    return Response.json(
      { ok: false, error: "This promo code is already applied to your account." },
      { status: 409 }
    );
  }
  return Response.json({
    ok: true,
    account: await getAccount(store, email),
    premiumUntil: result.until,
  });
}
