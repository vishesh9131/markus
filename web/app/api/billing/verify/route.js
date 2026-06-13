import crypto from "node:crypto";
import { auth } from "../../../../auth";
import { grantPremium, getAccount } from "../../../../lib/accounts";
import { getStore } from "../../../../lib/storage";
import { PREMIUM } from "../../../../lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verify a Razorpay payment signature, then grant premium for PREMIUM.months.
// In stub mode (no keys) we accept the upgrade directly so the flow is testable.
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keySecret || body.stub) {
    const store = getStore(session);
    const until = await grantPremium(store, PREMIUM.months);
    return Response.json({ ok: true, stub: true, account: await getAccount(store, session.user.email), premiumUntil: until });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return Response.json({ ok: false, error: "Missing payment fields" }, { status: 400 });
  }
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (expected !== razorpay_signature) {
    return Response.json({ ok: false, error: "Signature verification failed" }, { status: 400 });
  }
  const store = getStore(session);
  const until = await grantPremium(store, PREMIUM.months);
  return Response.json({ ok: true, account: await getAccount(store, session.user.email), premiumUntil: until });
}
