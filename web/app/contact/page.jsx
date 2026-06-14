import LegalLayout from "../../components/LegalLayout";

export const metadata = { title: "Contact Us — Markus Studio" };

export default function ContactPage() {
  return (
    <LegalLayout title="Contact Us">
      <p>
        We’d love to hear from you — whether it’s a question, a bug, a billing issue, or feedback on
        Markus Studio.
      </p>

      <h2>Email</h2>
      <p>
        <a href="mailto:sciencely98@gmail.com">sciencely98@gmail.com</a>
        <br />
        We usually reply within <strong>2–3 business days</strong>.
      </p>

      <h2>What to reach out about</h2>
      <ul>
        <li>Help using the editor or templates</li>
        <li>Account, Premium, and billing questions</li>
        <li>Refund requests (see our <a href="/refunds">Refund &amp; Cancellation Policy</a>)</li>
        <li>Privacy questions (see our <a href="/privacy">Privacy Policy</a>)</li>
      </ul>

      <h2>Business details</h2>
      <p>
        Markus Studio
        <br />
        Operated from India
      </p>
    </LegalLayout>
  );
}
