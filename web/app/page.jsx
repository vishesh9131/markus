import Link from "next/link";
import { auth, AUTH_MODE } from "../auth";
import { PREMIUM, FREE_LIMITS } from "../lib/quota";
import { SignInButton } from "../components/AuthButtons";
import HeroCanvas from "../components/HeroCanvas";
import ThemeToggle from "../components/ThemeToggle";

export default async function Landing() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <div className="landing">
      <header className="lp-nav">
        <div className="brand">
          <span className="name">Markus</span>
          <span className="tag">studio</span>
        </div>
        <nav className="lp-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <ThemeToggle className="lp-theme-toggle" />
          {signedIn ? (
            <Link className="cta sm" href="/studio">Open Studio</Link>
          ) : (
            <SignInButton mode={AUTH_MODE} className="cta sm">
              Sign in
            </SignInButton>
          )}
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <p className="eyebrow">Write in Markdown. Publish in LaTeX.</p>
          <h1>
            A calmer way to write
            <br />
            <em>research, notes &amp; letters.</em>
          </h1>
          <p className="lp-sub">
            Markus turns a simple <code>.mks</code> file into LaTeX-quality PDFs — papers, theses,
            slides, CVs and more. Edit on the left, watch the PDF on the right. Everything you make is
            saved to <strong>your own Google Drive</strong>.
          </p>
          <div className="lp-actions">
            {signedIn ? (
              <Link className="cta" href="/studio">Open Studio →</Link>
            ) : (
              <SignInButton mode={AUTH_MODE} className="cta" />
            )}
            <a className="ghost-btn" href="#pricing">See pricing</a>
          </div>
          <p className="lp-fine">
            {AUTH_MODE === "google"
              ? "Sign in with Google — we only touch files this app creates in your Drive."
              : "Demo mode (no Google keys set): sign in instantly, workspaces save locally."}
          </p>
        </div>
        <div className="lp-hero-art">
          <HeroCanvas />
        </div>
      </section>

      <section id="features" className="lp-features">
        {[
          ["Markdown-simple", "Headings, math, citations, tables, theorems, footnotes — plain text that reads like notes, compiles like LaTeX."],
          ["Live PDF preview", "A real PDF.js viewer with selectable text, zoom, and page nav. Recompiles ~0.5s after you stop typing."],
          ["Your Drive, your files", "Each workspace is a folder in your Google Drive. Your work is yours — nothing locked in our servers."],
          ["12+ templates", "IEEE, ACM, Springer, APA, beamer slides, letters, CV, reports — switch with one dropdown."],
          ["Light & dark", "A refined, distraction-free workspace that follows your system theme."],
          ["Export anywhere", "Download the .mks source, the generated .tex, or the compiled .pdf at any time."],
        ].map(([title, body]) => (
          <div className="feature" key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="lp-pricing">
        <h2>Simple pricing</h2>
        <div className="plans">
          <div className="plan">
            <div className="plan-name">Free</div>
            <div className="plan-price">₹0</div>
            <ul>
              <li>{FREE_LIMITS.workspaces} workspaces</li>
              <li>{FREE_LIMITS.docsPerWorkspace} documents per workspace</li>
              <li>Up to {FREE_LIMITS.pagesPerDoc} pages per document</li>
              <li>Saved to your Google Drive</li>
              <li>All templates &amp; live preview</li>
            </ul>
            {signedIn ? (
              <Link className="ghost-btn wide" href="/studio">Open Studio</Link>
            ) : (
              <SignInButton mode={AUTH_MODE} className="ghost-btn wide">Get started</SignInButton>
            )}
          </div>

          <div className="plan featured">
            <div className="ribbon">Best value</div>
            <div className="plan-name">Premium</div>
            <div className="plan-price">
              ₹{PREMIUM.rupees}
              <span className="per"> / {PREMIUM.months} months</span>
            </div>
            <ul>
              <li><strong>Unlimited</strong> workspaces</li>
              <li><strong>Unlimited</strong> documents</li>
              <li><strong>Unlimited</strong> pages</li>
              <li>Everything in Free</li>
              <li>Support the project ♥</li>
            </ul>
            {signedIn ? (
              <Link className="cta wide" href="/studio?upgrade=1">Go Premium</Link>
            ) : (
              <SignInButton mode={AUTH_MODE} className="cta wide">Go Premium</SignInButton>
            )}
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <span>Markus — write less markup, get more done.</span>
        <a href="https://github.com/vishesh9131/markus" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
