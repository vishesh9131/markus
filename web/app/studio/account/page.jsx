"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SignOutButton } from "../../../components/AuthButtons";
import Loader from "../../../components/Loader";
import { Btn } from "../../../components/Btn";
import GrantDrive from "../../../components/GrantDrive";
import { useDialog } from "../../../components/Dialog";
import { runUpgrade, redeemPromo } from "../../../lib/upgrade";

export default function AccountPage() {
  const dialog = useDialog();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || !j.ok) {
        if (j?.code === "DRIVE_SCOPE") return setError("DRIVE_SCOPE");
        if (j?.code === "RELOGIN" || res.status === 401) return setError("RELOGIN");
        return setError(j?.error || `Couldn’t load (HTTP ${res.status})`);
      }
      setData(j);
    } catch {
      setError("Network error — check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("markus-studio-theme");
    if (t) document.documentElement.dataset.theme = t;
    load();
  }, [load]);

  const upgrade = useCallback(async () => {
    try {
      setBusy(true);
      await runUpgrade(data?.user, { confirm: dialog.confirm });
      await load();
      dialog.alert("Premium is active — thank you for supporting Markus!", {
        title: "Payment successful 🎉",
      });
    } catch (e) {
      if (e.message !== "cancelled") dialog.alert(e.message, { title: "Payment not completed" });
    } finally {
      setBusy(false);
    }
  }, [data, load, dialog]);

  const redeem = useCallback(async () => {
    const code = await dialog.prompt("Enter your promo code", {
      title: "Redeem code",
      placeholder: "promo code",
    });
    if (!code) return;
    try {
      setBusy(true);
      await redeemPromo(code.trim());
      await load();
      dialog.alert("You're Premium now — enjoy unlimited everything.", { title: "Promo applied 🎉" });
    } catch (e) {
      dialog.alert(e.message, { title: "Redeem code" });
    } finally {
      setBusy(false);
    }
  }, [load, dialog]);

  if (error === "DRIVE_SCOPE") return <div className="dash"><GrantDrive /></div>;
  if (error === "RELOGIN") return <div className="dash"><GrantDrive reason="relogin" /></div>;
  if (error) return <div className="dash"><div className="dash-empty">{error}</div></div>;
  if (!data) return <div className="dash"><Loader label="Loading your account…" /></div>;

  const { user, account, limits, workspaces, backend } = data;
  const premium = account.tier === "premium";
  const docCount = workspaces.reduce((n, w) => n + w.docs.length, 0);
  const wsLimit = Number.isFinite(limits.workspaces) ? limits.workspaces : "∞";
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
  const renews = account.premiumUntil
    ? new Date(account.premiumUntil).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="dash">
      {busy && <Loader overlay label="One moment…" />}
      <header className="dash-nav">
        <Link className="brand" href="/studio"><span className="name">Markus</span><span className="tag">studio</span></Link>
        <div className="spacer" />
        <Link className="ghost-btn" href="/studio">← Workspaces</Link>
        <SignOutButton />
      </header>

      <main className="dash-main acct">
        <h1>Account</h1>

        <section className="acct-card acct-profile">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="acct-avatar" src={user.image} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className="acct-avatar acct-avatar-fallback">{initial}</div>
          )}
          <div>
            <div className="acct-name">{user.name || "Markus user"}</div>
            <div className="acct-email">{user.email}</div>
          </div>
          <span className={`plan-badge ${account.tier}`} style={{ marginLeft: "auto" }}>
            {premium ? "Premium" : "Free"}
          </span>
        </section>

        <div className="acct-grid">
          <section className="acct-card">
            <h2>Plan</h2>
            {premium ? (
              <>
                <p className="acct-big">Premium</p>
                <p className="acct-sub">{renews ? `Active until ${renews}` : "Active"} · unlimited workspaces, documents &amp; pages.</p>
                <div className="acct-actions">
                  <Btn className="ghost-btn" busy={busy} onClick={() => { redeem(); }}>Apply another code</Btn>
                </div>
              </>
            ) : (
              <>
                <p className="acct-big">Free</p>
                <p className="acct-sub">
                  {limits.workspaces} workspaces · {limits.docsPerWorkspace} docs each · up to {limits.pagesPerDoc} pages.
                </p>
                <div className="acct-actions">
                  <Btn className="cta" busy={busy} onClick={() => { upgrade(); }}>Upgrade — ₹9 / 2 months</Btn>
                  <Btn className="ghost-btn" busy={busy} onClick={() => { redeem(); }}>Redeem code</Btn>
                </div>
              </>
            )}
          </section>

          <section className="acct-card">
            <h2>Usage</h2>
            <ul className="acct-stats">
              <li><span>Workspaces</span><strong>{workspaces.length} / {wsLimit}</strong></li>
              <li><span>Documents</span><strong>{docCount}</strong></li>
              <li><span>Storage</span><strong>{backend === "drive" ? "Google Drive" : "Local (demo)"}</strong></li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
