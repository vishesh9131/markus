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

export async function runUpgrade(user) {
  const orderRes = await fetch("/api/billing/order", { method: "POST" }).then((r) => r.json());
  if (!orderRes.ok) throw new Error(orderRes.error || "Could not start checkout");

  // stub mode (no Razorpay keys): confirm + grant directly
  if (orderRes.stub) {
    if (!window.confirm(`Demo checkout: upgrade to Premium for ₹${(orderRes.amount / 100).toFixed(0)} / ${orderRes.months} months?\n(No real charge — Razorpay keys not configured.)`)) {
      throw new Error("cancelled");
    }
    const v = await fetch("/api/billing/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stub: true }),
    }).then((r) => r.json());
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
        const v = await fetch("/api/billing/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resp),
        }).then((r) => r.json());
        if (!v.ok) return reject(new Error(v.error || "Verification failed"));
        resolve(v.account);
      },
      modal: { ondismiss: () => reject(new Error("cancelled")) },
    });
    rzp.open();
  });
}
