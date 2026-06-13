// Client helper: run the premium upgrade (Razorpay checkout, or stub when no keys).
// Returns the updated account on success, throws on failure/cancel.

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(s);
  });
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({ ok: false, error: `Server error (${r.status})` }));
  return data;
}

export async function runUpgrade(user) {
  const orderRes = await postJson("/api/billing/order");
  if (!orderRes.ok) throw new Error(orderRes.error || "Could not start checkout");

  // stub mode (no Razorpay keys): confirm + grant directly
  if (orderRes.stub) {
    if (!window.confirm(`Demo checkout: upgrade to Premium for ₹${(orderRes.amount / 100).toFixed(0)} / ${orderRes.months} months?\n(No real charge — Razorpay keys not configured.)`)) {
      throw new Error("cancelled");
    }
    const v = await postJson("/api/billing/verify", { stub: true });
    if (!v.ok) throw new Error(v.error || "Upgrade failed");
    return v.account;
  }

  // real Razorpay checkout
  await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: orderRes.keyId,
      order_id: orderRes.orderId,
      amount: orderRes.amount,
      currency: orderRes.currency,
      name: "Markus Studio",
      description: `Premium · ${orderRes.months} months`,
      prefill: { email: user?.email, name: user?.name },
      theme: { color: "#1a1916" },
      handler: async (resp) => {
        const v = await postJson("/api/billing/verify", resp);
        if (!v.ok) return reject(new Error(v.error || "Verification failed"));
        resolve(v.account);
      },
      modal: { ondismiss: () => reject(new Error("cancelled")) },
    });
    rzp.open();
  });
}
