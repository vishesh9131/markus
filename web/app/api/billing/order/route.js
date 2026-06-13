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

  // Call Razorpay's REST API directly (no SDK — avoids serverless bundling issues)
  try {
    const basic = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${basic}` },
      body: JSON.stringify({
        amount: PREMIUM.amountPaise,
        currency: "INR",
        receipt: `markus_${crypto.randomUUID()}`,
        notes: { email: session.user.email, plan: `premium_${PREMIUM.months}m` },
      }),
    });
    const order = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = order?.error?.description || `Razorpay error (${r.status})`;
      return Response.json({ ok: false, error: msg }, { status: 502 });
    }
    return Response.json({
      ok: true,
      stub: false,
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      months: PREMIUM.months,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: `Could not reach Razorpay: ${e?.message || String(e)}` },
      { status: 502 }
    );
  }
}
