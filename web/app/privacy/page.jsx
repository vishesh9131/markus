import LegalLayout from "../../components/LegalLayout";

export const metadata = { title: "Privacy Policy — Markus Studio" };

const UPDATED = "14 June 2026";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated={UPDATED}>
      <p>
        This Privacy Policy explains what information Markus Studio collects, how we use it, and the
        choices you have. We aim to collect as little as possible.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong> — when you sign in with Google, we receive your name,
          email address, and profile picture.
        </li>
        <li>
          <strong>Your documents</strong> — the <code>.mks</code> files you create are stored in{" "}
          <strong>your own Google Drive</strong>. We use Google’s restricted{" "}
          <code>drive.file</code> scope, which means the app can only see the files it creates — never
          the rest of your Drive.
        </li>
        <li>
          <strong>Payment information</strong> — payments are handled by Razorpay. We never see or
          store your card, UPI, or bank details. We store only your subscription status and a payment
          reference needed to confirm the purchase.
        </li>
        <li>
          <strong>Technical data</strong> — standard server logs (such as request times and error
          information) used to keep the service running.
        </li>
      </ul>

      <h2>2. How we use your information</h2>
      <ul>
        <li>to authenticate you and keep you signed in;</li>
        <li>to store and retrieve the documents you create;</li>
        <li>to provide and confirm Premium access;</li>
        <li>to respond to support requests and keep the service secure.</li>
      </ul>
      <p>We do not sell your personal information, and we do not use it for advertising.</p>

      <h2>3. Where your data lives</h2>
      <p>
        Your documents and your subscription status are stored in your Google Drive (in a folder the
        app creates). To reliably confirm payments, we also keep a minimal billing record — your
        email, the payment reference, and your Premium expiry date — on our hosting provider.
      </p>

      <h2>4. Third-party services</h2>
      <p>We rely on a small number of trusted providers:</p>
      <ul>
        <li>
          <strong>Google</strong> — sign-in and Drive storage (
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            privacy policy
          </a>
          );
        </li>
        <li>
          <strong>Razorpay</strong> — payment processing (
          <a href="https://razorpay.com/privacy/" target="_blank" rel="noreferrer">
            privacy policy
          </a>
          );
        </li>
        <li>
          <strong>Netlify and Render</strong> — hosting and compilation.
        </li>
      </ul>

      <h2>5. Cookies</h2>
      <p>
        We use a single session cookie to keep you signed in. We do not use advertising or
        third-party tracking cookies.
      </p>

      <h2>6. Retention &amp; deletion</h2>
      <p>
        You are in control of your data. You can delete your documents from your Google Drive at any
        time, and revoke the app’s access from your{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          Google account permissions
        </a>
        . To have your billing record deleted, email us and we will remove it.
      </p>

      <h2>7. Security</h2>
      <p>
        All traffic is encrypted over HTTPS, and we use Google’s restricted Drive scope so the app
        can only access files it created. No method of transmission or storage is perfectly secure,
        but we take reasonable measures to protect your information.
      </p>

      <h2>8. Children</h2>
      <p>The service is not directed to children under 18.</p>

      <h2>9. Changes to this policy</h2>
      <p>
        We may update this policy from time to time and will revise the “Last updated” date above.
      </p>

      <h2>10. Contact</h2>
      <p>
        For any privacy question, email{" "}
        <a href="mailto:sciencely98@gmail.com">sciencely98@gmail.com</a>.
      </p>
    </LegalLayout>
  );
}
