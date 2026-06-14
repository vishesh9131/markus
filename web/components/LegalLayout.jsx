import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import SiteFooter from "./SiteFooter";

// Shared shell for the policy pages: themed header, readable prose column, footer.
export default function LegalLayout({ title, updated, children }) {
  return (
    <div className="legal">
      <header className="legal-nav">
        <Link className="brand" href="/">
          <span className="name">Markus</span>
          <span className="tag">studio</span>
        </Link>
        <div className="spacer" />
        <ThemeToggle className="lp-theme-toggle" />
        <Link className="ghost-btn sm" href="/">← Home</Link>
      </header>
      <main className="legal-main">
        <h1>{title}</h1>
        {updated ? <p className="legal-updated">Last updated: {updated}</p> : null}
        <div className="legal-prose">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
