"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SignOutButton } from "../../components/AuthButtons";
import Loader from "../../components/Loader";
import { useDialog } from "../../components/Dialog";
import { runUpgrade, redeemPromo } from "../../lib/upgrade";

export default function Dashboard() {
  const router = useRouter();
  const dialog = useDialog();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/workspaces").then((r) => r.json());
    if (!res.ok) return setError(res.error || "Failed to load");
    setData(res);
  }, []);

  useEffect(() => {
    // theme from storage
    const t = localStorage.getItem("markus-studio-theme");
    if (t) document.documentElement.dataset.theme = t;
    load();
  }, [load]);

  const upgrade = useCallback(async () => {
    try {
      setBusy(true);
      await runUpgrade(data?.user, { confirm: dialog.confirm });
      await load();
    } catch (e) {
      if (e.message !== "cancelled") dialog.alert(e.message, { title: "Upgrade" });
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
      dialog.alert("You're Premium now — enjoy unlimited workspaces, documents and pages.", {
        title: "Promo applied 🎉",
      });
    } catch (e) {
      dialog.alert(e.message, { title: "Redeem code" });
    } finally {
      setBusy(false);
    }
  }, [load, dialog]);

  // auto-open upgrade if redirected with ?upgrade=1
  useEffect(() => {
    const wantsUpgrade =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("upgrade") === "1";
    if (data && wantsUpgrade && data.account.tier !== "premium") {
      upgrade();
      router.replace("/studio");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const createWorkspace = async () => {
    const name = await dialog.prompt("Name your workspace", {
      title: "New workspace",
      defaultValue: "My workspace",
    });
    if (!name) return;
    setCreating(true);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => r.json());
    setCreating(false);
    if (!res.ok) {
      if (res.code === "WORKSPACE_LIMIT") {
        const go = await dialog.confirm(`${res.error}\n\nUpgrade now?`, {
          title: "Free limit reached",
          okText: "Upgrade",
        });
        if (go) upgrade();
      } else {
        dialog.alert(res.error, { title: "Couldn’t create workspace" });
      }
      return;
    }
    router.push(`/studio/${res.workspace.id}`);
  };

  const remove = async (id, name) => {
    const ok = await dialog.confirm(
      `Delete “${name}” and all its documents? This can’t be undone.`,
      { title: "Delete workspace", okText: "Delete", danger: true }
    );
    if (!ok) return;
    await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    load();
  };

  if (error) return <div className="dash"><div className="dash-empty">{error}</div></div>;
  if (!data) return <div className="dash"><Loader label="Loading your workspaces…" /></div>;

  const { user, account, limits, workspaces, backend } = data;
  const free = account.tier !== "premium";
  const atLimit = free && workspaces.length >= limits.workspaces;

  return (
    <div className="dash">
      {(busy || creating) && <Loader overlay label={creating ? "Creating workspace…" : "One moment…"} />}
      <header className="dash-nav">
        <Link className="brand" href="/">
          <span className="name">Markus</span>
          <span className="tag">studio</span>
        </Link>
        <div className="spacer" />
        <span className={`plan-badge ${account.tier}`}>
          {account.tier === "premium" ? "Premium" : "Free"}
        </span>
        {free && (
          <>
            <button className="ghost-btn" onClick={redeem} disabled={busy}>
              Redeem code
            </button>
            <button className="ghost-btn" onClick={upgrade} disabled={busy}>
              Upgrade ₹9
            </button>
          </>
        )}
        <span className="dash-user" title={user.email}>{user.email}</span>
        <SignOutButton />
      </header>

      <main className="dash-main">
        <div className="dash-head">
          <div>
            <h1>Your workspaces</h1>
            <p className="dash-sub">
              {backend === "drive" ? "Saved to your Google Drive." : "Demo mode — saved locally on this machine."}
              {free && ` Free plan: ${workspaces.length}/${limits.workspaces} workspaces.`}
            </p>
          </div>
          <button className="cta" onClick={createWorkspace} disabled={creating || atLimit} title={atLimit ? "Free limit reached — upgrade for unlimited" : "New workspace"}>
            {creating ? "Creating…" : "+ New workspace"}
          </button>
        </div>

        {workspaces.length === 0 ? (
          <div className="dash-empty">No workspaces yet. Create your first one to start writing.</div>
        ) : (
          <div className="ws-grid">
            {workspaces.map((ws) => (
              <div className="ws-card" key={ws.id}>
                <Link href={`/studio/${ws.id}`} className="ws-card-body">
                  <h3>{ws.name}</h3>
                  <p className="ws-meta">
                    {ws.docs.length} {ws.docs.length === 1 ? "document" : "documents"}
                    {free ? ` · max ${limits.docsPerWorkspace}` : ""}
                  </p>
                  <ul className="ws-docs">
                    {ws.docs.slice(0, 3).map((d) => (
                      <li key={d.id}>{d.name}{typeof d.pages === "number" ? ` · ${d.pages}p` : ""}</li>
                    ))}
                    {ws.docs.length === 0 && <li className="muted">empty</li>}
                  </ul>
                </Link>
                <div className="ws-card-foot">
                  <Link className="ghost-btn sm" href={`/studio/${ws.id}`}>Open</Link>
                  <button className="ghost-btn sm danger" onClick={() => remove(ws.id, ws.name)}>Delete</button>
                </div>
              </div>
            ))}

            {atLimit && (
              <button className="ws-card upgrade-card" onClick={upgrade}>
                <div>
                  <h3>Need more?</h3>
                  <p>Go Premium for unlimited workspaces, documents and pages — ₹9 / 2 months.</p>
                  <span className="cta sm">Upgrade</span>
                </div>
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
