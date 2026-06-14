"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Loader from "../../components/Loader";
import GrantDrive from "../../components/GrantDrive";
import StudioSidebar from "../../components/StudioSidebar";
import DocThumb from "../../components/DocThumb";
import ViewToolbar from "../../components/ViewToolbar";
import { Btn } from "../../components/Btn";
import { useDialog } from "../../components/Dialog";
import { useViewPrefs } from "../../lib/useViewPrefs";
import { runUpgrade, redeemPromo } from "../../lib/upgrade";
import { PREMIUM } from "../../lib/quota";

const WS_SORTS = [
  { value: "modified", label: "Last modified" },
  { value: "created", label: "Date created" },
  { value: "name", label: "Name (A–Z)" },
];
function wsActivity(ws) {
  const times = (ws.docs || []).map((d) => Date.parse(d.updatedAt || "") || 0);
  return times.length ? Math.max(...times) : Date.parse(ws.createdAt || "") || 0;
}

export default function Dashboard() {
  const router = useRouter();
  const dialog = useDialog();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const { view, setView, sort, setSort } = useViewPrefs({ sortKey: "markus-sort-ws", defaultSort: "modified" });

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
      dialog.alert("Premium is active — unlimited workspaces, documents and pages. Thank you!", {
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

  if (error === "DRIVE_SCOPE") return <div className="dash"><GrantDrive /></div>;
  if (error === "RELOGIN") return <div className="dash"><GrantDrive reason="relogin" /></div>;
  if (error) return <div className="dash"><div className="dash-empty">{error}</div></div>;
  if (!data) return <div className="dash"><Loader label="Loading your workspaces…" /></div>;

  const { user, account, limits, workspaces, backend } = data;
  const free = account.tier !== "premium";
  const atLimit = free && workspaces.length >= limits.workspaces;
  const sortedWorkspaces = [...workspaces].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "created") return (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
    return wsActivity(b) - wsActivity(a);
  });

  return (
    <div className="studio-shell">
      {(busy || creating) && <Loader overlay label={creating ? "Creating workspace…" : "One moment…"} />}
      <StudioSidebar user={user} account={account} onUpgrade={upgrade} onRedeem={redeem} />

      <main className="studio-main">
        <div className="studio-head">
          <div>
            <h1>Your workspaces</h1>
            <p className="studio-sub">
              {backend === "drive" ? "Saved to your Google Drive." : "Demo mode — saved locally."}
              {free && ` · ${workspaces.length}/${limits.workspaces} used`}
            </p>
          </div>
          <Btn
            className="cta"
            busy={creating}
            disabled={atLimit}
            onClick={() => { createWorkspace(); }}
            title={atLimit ? "Free limit reached — upgrade for unlimited" : "New workspace"}
          >
            + New workspace
          </Btn>
        </div>

        {workspaces.length > 0 && (
          <ViewToolbar view={view} onView={setView} sort={sort} onSort={setSort} sorts={WS_SORTS} />
        )}

        <div className={`ws-cards view-${view}`}>
          {sortedWorkspaces.map((ws) => (
            <div className="ws-tile" key={ws.id}>
              <Link href={`/studio/${ws.id}`} className="ws-tile-thumbs" aria-label={ws.name}>
                <div className="ws-thumb-grid">
                  {ws.docs.slice(0, 4).map((d) => <DocThumb key={d.id} name={d.name} mini />)}
                  {Array.from({ length: Math.max(0, 4 - ws.docs.length) }).map((_, i) => (
                    <div className="doc-thumb empty" key={`e${i}`} aria-hidden="true" />
                  ))}
                </div>
              </Link>
              <div className="ws-tile-foot">
                <Link href={`/studio/${ws.id}`} className="ws-tile-info">
                  <span className="ws-tile-name">{ws.name}</span>
                  <span className="ws-tile-meta">
                    {ws.docs.length} {ws.docs.length === 1 ? "document" : "documents"}
                  </span>
                </Link>
                <button className="icon-del" title="Delete workspace" onClick={() => remove(ws.id, ws.name)}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 4.5h10M6.5 4.5V3.2c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7v1.3M4.3 4.5l.5 8c0 .5.4.9.9.9h4.6c.5 0 .9-.4.9-.9l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          <button className="ws-tile add-tile" onClick={atLimit ? upgrade : createWorkspace}>
            <span className="add-plus">+</span>
            <span className="add-text">{atLimit ? "Upgrade to create more" : "New workspace"}</span>
            {atLimit && (
              <span className="add-sub">Unlimited on Premium · ₹{PREMIUM.rupees} / {PREMIUM.months} mo</span>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
