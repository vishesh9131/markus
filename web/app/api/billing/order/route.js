import crypto from "node:crypto";
import { auth } from "../../../../auth";
import { PREMIUM } from "../../../../lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a Razorpay order for the premium upgrade (INR 9 / 2 months).
// When keys are absent we return a stub order so the upgrade flow is testable.
export async function POST() {
  const session = await auth();
  if (!session?.user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    // demo/stub: no real charge; client will call /verify with stub=true
    return Response.json({
      ok: true,
      stub: true,
      amount: PREMIUM.amountPaise,
      currency: "INR",
      months: PREMIUM.months,
    });
  }

  const Razorpay = (await import("razorpay")).default;
  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const order = await rzp.orders.create({
    amount: PREMIUM.amountPaise,
    currency: "INR",
    receipt: `markus_${crypto.randomUUID()}`,
    notes: { email: session.user.email, plan: `premium_${PREMIUM.months}m` },
  });
  return Response.json({
    ok: true,
    stub: false,
    keyId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    months: PREMIUM.months,
  });
}
