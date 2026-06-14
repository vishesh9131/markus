import Link from "next/link";

// Shared footer with the policy links Razorpay (and RBI rules) expect to find
// on the main site. Used on the landing page and every legal page.
export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="lp-footer">
      <span>© {year} Markus Studio</span>
      <nav className="footer-links">
        <Link href="/#pricing">Pricing</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/refunds">Refunds</Link>
        <Link href="/contact">Contact</Link>
        <a href="https://github.com/vishesh9131/markus" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </nav>
    </footer>
  );
}
