import LegalLayout from "../../components/LegalLayout";

export const metadata = { title: "Terms & Conditions — Markus Studio" };

const UPDATED = "14 June 2026";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions" updated={UPDATED}>
      <p>
        These Terms &amp; Conditions (“Terms”) govern your use of Markus Studio (“Markus Studio”,
        “we”, “us”, “our”), available at{" "}
        <a href="https://markus-studio.netlify.app">markus-studio.netlify.app</a>. By creating an
        account or using the service, you agree to these Terms. If you do not agree, please do not
        use the service.
      </p>

      <h2>1. The service</h2>
      <p>
        Markus Studio is a web application that lets you write documents in a Markdown-like format
        (<code>.mks</code>) and compile them into LaTeX-quality PDFs. The service is provided on an
        “as is” and “as available” basis. We may add, change, or remove features at any time.
      </p>

      <h2>2. Your account</h2>
      <p>
        You sign in with your Google account. You are responsible for the activity that happens under
        your account and for keeping your login secure. You agree to provide accurate information and
        to be at least 18 years old (or to use the service under the supervision of a parent or
        guardian).
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the service for any unlawful purpose or to create unlawful content;</li>
        <li>attempt to disrupt, overload, or gain unauthorised access to the service or its systems;</li>
        <li>resell or commercially exploit the service without our written permission.</li>
      </ul>

      <h2>4. Your content</h2>
      <p>
        You retain full ownership of the documents you create. Your files are stored in{" "}
        <strong>your own Google Drive</strong>, not on our servers — we never claim ownership of your
        work. You are responsible for the content you create and for keeping your own backups.
      </p>

      <h2>5. Plans &amp; payments</h2>
      <p>
        Markus Studio offers a free tier with usage limits and a paid <strong>Premium</strong> plan
        priced at <strong>₹9 for 2 months</strong>. Prices are in Indian Rupees and include
        applicable taxes unless stated otherwise. Payments are processed securely by our payment
        partner, Razorpay. Premium access is granted immediately after a successful payment. Refunds
        and cancellations are governed by our{" "}
        <a href="/refunds">Refund &amp; Cancellation Policy</a>.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        The Markus compiler is open-source software available on{" "}
        <a href="https://github.com/vishesh9131/markus" target="_blank" rel="noreferrer">
          GitHub
        </a>
        . The “Markus” and “Markus Studio” names and branding belong to us. Nothing in these Terms
        transfers our intellectual property to you except the limited right to use the service.
      </p>

      <h2>7. Disclaimer &amp; limitation of liability</h2>
      <p>
        We do our best to keep the service reliable, but we make no warranties that it will be
        uninterrupted, error-free, or that compiled output will meet every requirement. To the
        maximum extent permitted by law, Markus Studio will not be liable for any indirect or
        consequential loss, or for loss of data. Our total liability for any claim is limited to the
        amount you paid us in the two months before the claim arose.
      </p>

      <h2>8. Termination</h2>
      <p>
        You may stop using the service at any time. We may suspend or terminate access if you breach
        these Terms. You can remove our access to your Google Drive at any time from your{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          Google account permissions
        </a>
        .
      </p>

      <h2>9. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. We will revise the “Last updated” date above,
        and your continued use of the service after changes means you accept the updated Terms.
      </p>

      <h2>10. Governing law</h2>
      <p>These Terms are governed by the laws of India.</p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms? Email us at{" "}
        <a href="mailto:sciencely98@gmail.com">sciencely98@gmail.com</a> or see our{" "}
        <a href="/contact">Contact page</a>.
      </p>
    </LegalLayout>
  );
}
