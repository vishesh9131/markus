"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import Studio from "../../../components/Studio";
import Loader from "../../../components/Loader";
import { useDialog } from "../../../components/Dialog";
import { runUpgrade } from "../../../lib/upgrade";

const STARTER = `---
title: "Untitled"
author: Your Name
template: article
---

# Introduction

Start writing here. Inline math like $E = mc^2$, **bold**, and lists:

- first point
- second point
`;

export default function WorkspaceEditor({ params }) {
  const { ws: wsId } = use(params);
  const dialog = useDialog();
  const [state, setState] = useState({ status: "loading" });
  const [active, setActive] = useState(null); // {id, name, content}
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/workspaces").then((r) => r.json());
    if (!res.ok) return setState({ status: "error", error: res.error });
    const ws = res.workspaces.find((w) => w.id === wsId);
    if (!ws) return setState({ status: "error", error: "Workspace not found" });
    setState({ status: "ready", ws, account: res.account, limits: res.limits, user: res.user });
  }, [wsId]);

  useEffect(() => {
    const t = localStorage.getItem("markus-studio-theme");
    if (t) document.documentElement.dataset.theme = t;
    load();
  }, [load]);

  const openDoc = async (docId) => {
    setOpening(true);
    try {
      const res = await fetch(`/api/workspaces/${wsId}/docs/${docId}`).then((r) => r.json());
      if (!res.ok) return dialog.alert(res.error, { title: "Couldn’t open document" });
      setActive({ id: res.doc.id, name: res.doc.name, content: res.doc.content });
    } finally {
      setOpening(false);
    }
  };

  const newDoc = async () => {
    const { ws, account, limits } = state;
    if (account.tier !== "premium" && ws.docs.length >= limits.docsPerWorkspace) {
      const go = await dialog.confirm(
        `Free plan allows ${limits.docsPerWorkspace} documents per workspace.\n\nUpgrade for unlimited?`,
        { title: "Document limit reached", okText: "Upgrade" }
      );
      if (go) {
        try { await runUpgrade(state.user, { confirm: dialog.confirm }); await load(); }
        catch (e) { if (e.message !== "cancelled") dialog.alert(e.message, { title: "Upgrade" }); }
      }
      return;
    }
    const raw = await dialog.prompt("Document name", { title: "New document", defaultValue: "untitled.mks" });
    const name = (raw || "").trim();
    if (!name) return;
    const docName = name.endsWith(".mks") ? name : `${name}.mks`;
    setActive({ id: null, name: docName, content: STARTER });
  };

  const saveDoc = useCallback(
    async ({ content, pages }) => {
      const res = await fetch(`/api/workspaces/${wsId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: active?.id || undefined, name: active?.name, content, pages }),
      }).then((r) => r.json());
      if (!res.ok) {
        // surface quota errors clearly
        throw new Error(res.error || "Save failed");
      }
      // capture server id for new docs so future saves update in place
      setActive((a) => (a ? { ...a, id: res.doc.id } : a));
    },
    [wsId, active]
  );

  const upgrade = useCallback(async () => {
    try { await runUpgrade(state.user, { confirm: dialog.confirm }); await load(); }
    catch (e) { if (e.message !== "cancelled") dialog.alert(e.message, { title: "Upgrade" }); }
  }, [state, load, dialog]);

  if (state.status === "loading") return <div className="dash"><Loader label="Opening workspace…" /></div>;
  if (state.status === "error") return <div className="dash"><div className="dash-empty">{state.error} · <Link href="/studio">back</Link></div></div>;

  const { ws, account } = state;

  if (active) {
    return (
      <Studio
        initialDoc={active.content}
        docName={active.name}
        workspaceName={ws.name}
        backHref="/studio"
        plan={account.tier}
        onSaveDoc={saveDoc}
        onUpgrade={upgrade}
      />
    );
  }

  // document chooser
  const free = account.tier !== "premium";
  return (
    <div className="dash">
      <header className="dash-nav">
        <Link className="brand" href="/studio"><span className="name">Markus</span><span className="tag">studio</span></Link>
        <div className="spacer" />
        <span className={`plan-badge ${account.tier}`}>{account.tier === "premium" ? "Premium" : "Free"}</span>
        <Link className="ghost-btn" href="/studio">← Workspaces</Link>
      </header>
      <main className="dash-main">
        <div className="dash-head">
          <div>
            <h1>{ws.name}</h1>
            <p className="dash-sub">
              {ws.docs.length} {ws.docs.length === 1 ? "document" : "documents"}
              {free ? ` · free plan max ${state.limits.docsPerWorkspace} (×5 pages)` : ""}
            </p>
          </div>
          <button className="cta" onClick={newDoc}>+ New document</button>
        </div>

        {ws.docs.length === 0 ? (
          <div className="dash-empty">No documents yet. Create your first <code>.mks</code>.</div>
        ) : (
          <div className="ws-grid">
            {ws.docs.map((d) => (
              <button className="ws-card doc-card" key={d.id} onClick={() => openDoc(d.id)}>
                <div className="ws-card-body">
                  <h3>{d.name}</h3>
                  <p className="ws-meta">
                    {typeof d.pages === "number" ? `${d.pages} ${d.pages === 1 ? "page" : "pages"}` : "—"}
                    {d.updatedAt ? ` · ${new Date(d.updatedAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <span className="ghost-btn sm">Open editor</span>
              </button>
            ))}
          </div>
        )}
      </main>
      {opening && <Loader overlay label="Opening document…" />}
    </div>
  );
}
