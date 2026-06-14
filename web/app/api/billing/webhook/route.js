import crypto from "node:crypto";
import { recordPayment } from "../../../../lib/ledger";
import { PREMIUM } from "../../../../lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Razorpay webhook — the reliable, server-to-server record that money arrived.
// Configure in Razorpay Dashboard → Settings → Webhooks:
//   URL:     https://<your-site>/api/billing/webhook
//   Secret:  must equal RAZORPAY_WEBHOOK_SECRET
//   Events:  payment.captured
//
// We can't grant premium here (no user session → no Drive access), so we record
// the payment by email; lib/accounts#reconcilePending applies it on next load.

function monthsFromPlan(plan) {
  const m = /premium_(\d+)m/.exec(plan || "");
  return m ? Number(m[1]) : PREMIUM.months;
}

function safeEqual(a, b) {
  const x = Buffer.from(a || "", "utf8");
  const y = Buffer.from(b || "", "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function POST(request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: "Webhook not configured" }, { status: 503 });
  }

  // The signature is computed over the EXACT raw bytes — never re-serialize.
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") || "";
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (!safeEqual(expected, signature)) {
    return Response.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "Bad payload" }, { status: 400 });
  }

  if (event?.event === "payment.captured") {
    const p = event.payload?.payment?.entity || {};
    const email = p.notes?.email;
    if (email) {
      await recordPayment(email, { paymentId: p.id, months: monthsFromPlan(p.notes?.plan) });
    }
  }

  // 200 for every verified event (handled or ignored) so Razorpay stops retrying.
  return Response.json({ ok: true });
}
