import LegalLayout from "../../components/LegalLayout";

export const metadata = { title: "Refund & Cancellation Policy — Markus Studio" };

const UPDATED = "14 June 2026";

export default function RefundsPage() {
  return (
    <LegalLayout title="Refund & Cancellation Policy" updated={UPDATED}>
      <p>
        This policy applies to the Markus Studio <strong>Premium</strong> plan
        (<strong>₹9 for 2 months</strong>).
      </p>

      <h2>1. Digital service, delivered instantly</h2>
      <p>
        Premium is a digital subscription. Access is unlocked immediately after a successful payment,
        so the service is considered delivered as soon as your account is upgraded.
      </p>

      <h2>2. Refunds</h2>
      <p>
        Because Premium is a low-cost digital subscription that is delivered instantly, payments are{" "}
        <strong>non-refundable once Premium has been activated</strong>, except in the cases below.
      </p>

      <h2>3. When we do refund</h2>
      <ul>
        <li>
          <strong>Duplicate charge</strong> — if you were charged more than once for the same
          upgrade, we refund the extra charge(s) in full.
        </li>
        <li>
          <strong>Failed activation</strong> — if you were charged but Premium was not unlocked and
          we cannot resolve it, we refund the payment in full.
        </li>
      </ul>
      <p>
        To request a refund under these cases, email{" "}
        <a href="mailto:sciencely98@gmail.com">sciencely98@gmail.com</a> within{" "}
        <strong>7 days</strong> of the charge with your payment reference (Razorpay payment ID).
      </p>

      <h2>4. How refunds are processed</h2>
      <p>
        Approved refunds are returned to your original payment method through Razorpay, typically
        within <strong>5–7 business days</strong>, depending on your bank or provider.
      </p>

      <h2>5. Cancellation</h2>
      <p>
        Premium is a one-time purchase for a 2-month period — it does <strong>not auto-renew</strong>
        , so there is nothing to cancel to avoid future charges. You can stop using Premium at any
        time; your access remains active until the end of the paid period, after which your account
        returns to the free tier.
      </p>

      <h2>6. Contact</h2>
      <p>
        Questions about billing or refunds? Email{" "}
        <a href="mailto:sciencely98@gmail.com">sciencely98@gmail.com</a>.
      </p>
    </LegalLayout>
  );
}
