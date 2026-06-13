"use client";

import { signIn } from "next-auth/react";

// Shown when a user signed in but didn't tick the Google Drive permission.
// Re-runs Google sign-in (consent screen) so they can grant it.
export default function GrantDrive() {
  return (
    <div className="grant-drive">
      <div className="grant-card">
        <div className="grant-icon" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <path d="M7.7 3.5h8.6l4.2 7.3-4.3 7.4H7.8L3.5 10.8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M3.6 10.8h16.8M8 18.2l4.2-7.4M16 3.6l-4.2 7.3" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </div>
        <h2>One more step</h2>
        <p>
          Markus saves every workspace to <strong>your</strong> Google Drive — so you own your files.
          It looks like Drive access wasn’t granted at sign-in.
        </p>
        <p className="grant-hint">
          On the next screen, please <strong>check the Google&nbsp;Drive box</strong> so Markus can
          create and open your documents (it only touches files it creates).
        </p>
        <button className="cta" onClick={() => signIn("google", { callbackUrl: "/studio" })}>
          Grant Google Drive access
        </button>
      </div>
    </div>
  );
}
