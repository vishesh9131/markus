"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./AuthButtons";
import { Btn } from "./Btn";
import { PREMIUM } from "../lib/quota";

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.8 13.5c0-2.5 2.3-4.2 5.2-4.2s5.2 1.7 5.2 4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// Shared left navigation for the studio dashboard + workspace views. Theme-aware
// (uses the paper/ink palette), and collapses to a top strip on small screens.
export default function StudioSidebar({ user, account, onUpgrade, onRedeem }) {
  const pathname = usePathname();
  const premium = account?.tier === "premium";
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  const onWorkspaces = pathname === "/studio" || pathname?.startsWith("/studio/") && pathname !== "/studio/account";
  const onAccount = pathname === "/studio/account";

  return (
    <aside className="studio-side">
      <Link className="brand side-brand" href="/">
        <span className="name">Markus</span>
        <span className="tag">studio</span>
      </Link>

      <Link className="side-account" href="/studio/account" title={`${user?.email || ""} · Account`}>
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="side-avatar" src={user.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="side-avatar side-avatar-fallback">{initial}</span>
        )}
        <span className="side-account-text">
          <span className="side-name">{user?.name || "Markus user"}</span>
          <span className={`plan-badge ${account?.tier || "free"}`}>{premium ? "Premium" : "Free"}</span>
        </span>
      </Link>

      <nav className="side-nav">
        <Link className={`side-link${onWorkspaces ? " active" : ""}`} href="/studio">
          <IconGrid /> Workspaces
        </Link>
        <Link className={`side-link${onAccount ? " active" : ""}`} href="/studio/account">
          <IconUser /> Account
        </Link>
      </nav>

      <div className="side-foot">
        {!premium && onUpgrade && (
          <div className="side-upgrade">
            <p>Unlimited workspaces, documents &amp; pages.</p>
            <Btn className="cta wide" onClick={() => { onUpgrade(); }}>
              Upgrade — ₹{PREMIUM.rupees} / {PREMIUM.months} mo
            </Btn>
            {onRedeem && (
              <Btn className="ghost-btn wide" onClick={() => { onRedeem(); }}>Redeem code</Btn>
            )}
          </div>
        )}
        <SignOutButton className="ghost-btn wide" />
      </div>
    </aside>
  );
}
