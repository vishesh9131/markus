"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Studio from "../../../components/Studio";
import Loader from "../../../components/Loader";
import GrantDrive from "../../../components/GrantDrive";
import StudioSidebar from "../../../components/StudioSidebar";
import DocThumb from "../../../components/DocThumb";
import ViewToolbar from "../../../components/ViewToolbar";
import { Btn } from "../../../components/Btn";
import { useDialog } from "../../../components/Dialog";
import { useViewPrefs } from "../../../lib/useViewPrefs";
import { runUpgrade } from "../../../lib/upgrade";

const DOC_SORTS = [
  { value: "modified", label: "Last modified" },
  { value: "name", label: "Name (A–Z)" },
  { value: "pages", label: "Pages" },
];

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

function flattenTree(tree) {
  const docs = [...(tree?.docs || [])];
  const images = [...(tree?.images || [])];
  for (const f of tree?.folders || []) {
    docs.push(...(f.docs || []));
    images.push(...(f.images || []));
  }
  return { docs, images };
}

function timeAgo(iso) {
  const then = Date.parse(iso || "");
  if (!then) return "recently";
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [name, secs] of units) {
    const v = Math.floor(s / secs);
    if (v >= 1) return `${v} ${name}${v > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export default function WorkspaceEditor({ params }) {
  const { ws: wsId } = use(params);
  const dialog = useDialog();
  const [state, setState] = useState({ status: "loading" });
  const [active, setActive] = useState(null); // {id, name, content}
  const [opening, setOpening] = useState(false);
  const { view, setView, sort, setSort } = useViewPrefs({ sortKey: "markus-sort-docs", defaultSort: "modified" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || !j.ok) {
        if (j?.code === "DRIVE_SCOPE") return setState({ status: "drive" });
        if (j?.code === "RELOGIN" || res.status === 401) return setState({ status: "relogin" });
        return setState({ status: "error", error: j?.error || `Couldn’t load (HTTP ${res.status})` });
      }
      const ws = j.workspaces.find((w) => w.id === wsId);
      if (!ws) return setState({ status: "error", error: "Workspace not found" });
      const tr = await fetch(`/api/workspaces/${wsId}/tree`).then((r) => r.json()).catch(() => null);
      const tree = tr?.ok ? tr.tree : { docs: ws.docs || [], images: ws.images || [], folders: [] };
      setState({ status: "ready", ws, tree, account: j.account, limits: j.limits, user: j.user });
    } catch {
      setState({ status: "error", error: "Network error — try again." });
    }
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

  const newDoc = async (folderId = null) => {
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
    // Persist the document immediately so it survives navigation even before the
    // first edit — otherwise a brand-new doc lives only in memory and is lost.
    setOpening(true);
    try {
      const res = await fetch(`/api/workspaces/${wsId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: docName, content: STARTER, pages: 0, folderId }),
      }).then((r) => r.json());
      if (!res.ok) return dialog.alert(res.error || "Couldn’t create the document.", { title: "New document" });
      setActive({ id: res.doc.id, name: res.doc.name, content: STARTER });
      load(); // refresh so the new file shows in the rail
    } catch {
      dialog.alert("Network error — please try again.", { title: "New document" });
    } finally {
      setOpening(false);
    }
  };

  // id/name come from the editor itself, so switching docs can't save content
  // to the wrong file. Docs are created server-side first, so id is always set.
  const saveDoc = useCallback(
    async ({ id, name, content, pages }) => {
      const res = await fetch(`/api/workspaces/${wsId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id || undefined, name, content, pages }),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Save failed"); // surfaces quota errors
    },
    [wsId]
  );

  const upgrade = useCallback(async () => {
    try { await runUpgrade(state.user, { confirm: dialog.confirm }); await load(); }
    catch (e) { if (e.message !== "cancelled") dialog.alert(e.message, { title: "Upgrade" }); }
  }, [state, load, dialog]);

  // ---- images: upload to Drive, and resolve referenced images to base64 so the
  // cross-origin compiler can render them (cached per name to avoid refetching).
  const imageCache = useRef({});
  const uploadImage = useCallback(async (file, folderId = null) => {
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] || "");
      r.onerror = () => rej(new Error("Could not read file"));
      r.readAsDataURL(file);
    });
    const res = await fetch(`/api/workspaces/${wsId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, mime: file.type, base64, folderId }),
    }).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || "Upload failed");
    imageCache.current[res.image.name] = base64;
    load(); // refresh so the rail shows the new image
    return res.image;
  }, [wsId, load]);

  const createFolder = useCallback(async () => {
    const raw = await dialog.prompt("Folder name", { title: "New folder", defaultValue: "Chapter 1" });
    const name = (raw || "").trim();
    if (!name) return;
    const res = await fetch(`/api/workspaces/${wsId}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => r.json());
    if (!res.ok) return dialog.alert(res.error || "Couldn’t create folder", { title: "New folder" });
    load();
  }, [wsId, load, dialog]);

  // Rename / Duplicate / Move / Delete for a tree item, via the shared dialog.
  const itemAction = useCallback(async (item) => {
    const opts = [{ label: "Rename", value: "rename" }];
    if (item.type === "doc") opts.push({ label: "Duplicate", value: "duplicate" });
    if (item.type !== "folder") opts.push({ label: "Move to…", value: "move" });
    opts.push({ label: "Delete", value: "delete" });
    const action = await dialog.choose(item.name, { title: item.type === "folder" ? "Folder" : "File", options: opts });
    if (!action) return;
    const base = `/api/workspaces/${wsId}/items/${item.id}`;
    const json = (method, body) =>
      fetch(base, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

    try {
      if (action === "rename") {
        const raw = await dialog.prompt("New name", { title: "Rename", defaultValue: item.name });
        const name = (raw || "").trim();
        if (!name || name === item.name) return;
        const r = await json("PATCH", { name });
        if (!r.ok) throw new Error(r.error);
      } else if (action === "duplicate") {
        const copyName = item.name.replace(/(\.[^.]+)?$/, (ext) => ` copy${ext || ""}`);
        const r = await json("POST", { name: copyName });
        if (!r.ok) throw new Error(r.error);
      } else if (action === "move") {
        const folders = (state.tree?.folders || []).filter((f) => f.id !== item.folderId);
        const targets = [
          ...(item.folderId ? [{ label: "Workspace root", value: "__root__" }] : []),
          ...folders.map((f) => ({ label: f.name, value: f.id })),
        ];
        if (targets.length === 0) return dialog.alert("Create a folder first to move files into.", { title: "Move" });
        const to = await dialog.choose(`Move "${item.name}" to`, { title: "Move", options: targets });
        if (!to) return;
        const r = await json("PATCH", { toFolderId: to === "__root__" ? null : to, fromFolderId: item.folderId || null });
        if (!r.ok) throw new Error(r.error);
      } else if (action === "delete") {
        const msg = item.type === "folder"
          ? `Delete folder “${item.name}” and everything inside it? This can’t be undone.`
          : `Delete “${item.name}”? This can’t be undone.`;
        const ok = await dialog.confirm(msg, { title: "Delete", okText: "Delete", danger: true });
        if (!ok) return;
        const r = await json("DELETE");
        if (!r.ok) throw new Error(r.error);
        if (active?.id === item.id) setActive(null); // deleted the open doc -> back to chooser
      }
      load();
    } catch (e) {
      dialog.alert(String(e?.message || e), { title: "Action failed" });
    }
  }, [wsId, dialog, state, active, load]);

  const resolveImages = useCallback(async (names) => {
    const list = flattenTree(state.tree).images;
    const out = [];
    for (const name of names) {
      if (imageCache.current[name]) { out.push({ name, base64: imageCache.current[name] }); continue; }
      const img = list.find((i) => i.name === name);
      if (!img) continue;
      const r = await fetch(`/api/workspaces/${wsId}/images/${img.id}`).then((x) => x.json()).catch(() => null);
      if (r?.ok) { imageCache.current[name] = r.base64; out.push({ name, base64: r.base64 }); }
    }
    return out;
  }, [wsId, state]);

  if (state.status === "loading") return <div className="dash"><Loader label="Opening workspace…" /></div>;
  if (state.status === "drive") return <div className="dash"><GrantDrive /></div>;
  if (state.status === "relogin") return <div className="dash"><GrantDrive reason="relogin" /></div>;
  if (state.status === "error") return <div className="dash"><div className="dash-empty">{state.error} · <Link href="/studio">back</Link></div></div>;

  const { ws, account } = state;

  if (active) {
    return (
      <Studio
        key={active.id}
        initialDoc={active.content}
        docName={active.name}
        docId={active.id}
        workspaceName={ws.name}
        backHref="/studio"
        plan={account.tier}
        onSaveDoc={saveDoc}
        onUpgrade={upgrade}
        tree={state.tree}
        onOpenDoc={openDoc}
        onNewDoc={newDoc}
        onUploadImage={uploadImage}
        onCreateFolder={createFolder}
        onItemAction={itemAction}
        onResolveImages={resolveImages}
      />
    );
  }

  // document chooser
  const free = account.tier !== "premium";
  const allDocs = flattenTree(state.tree).docs;
  const sortedDocs = [...allDocs].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "pages") return (b.pages || 0) - (a.pages || 0);
    return (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0);
  });
  return (
    <div className="studio-shell">
      <StudioSidebar user={state.user} account={account} onUpgrade={upgrade} />
      <main className="studio-main">
        <nav className="studio-crumbs">
          <Link href="/studio">Workspaces</Link>
          <span aria-hidden="true">/</span>
          <span className="crumb-current">{ws.name}</span>
        </nav>

        <div className="studio-head">
          <div>
            <h1>{ws.name}</h1>
            <p className="studio-sub">
              {allDocs.length} {allDocs.length === 1 ? "document" : "documents"}
              {free ? ` · free max ${state.limits.docsPerWorkspace} (×5 pages)` : ""}
            </p>
          </div>
          <div className="studio-head-actions">
            <Btn className="ghost-btn" onClick={createFolder}>+ Folder</Btn>
            <Btn className="cta" onClick={() => newDoc()}>+ New document</Btn>
          </div>
        </div>

        {allDocs.length > 0 && (
          <ViewToolbar view={view} onView={setView} sort={sort} onSort={setSort} sorts={DOC_SORTS} />
        )}

        <div className={`file-grid view-${view}`}>
          {sortedDocs.map((d) => (
            <button className="file-card" key={d.id} onClick={() => openDoc(d.id)} title={`Open ${d.name}`}>
              <div className="file-card-thumb">
                <DocThumb name={d.name} docId={d.id} />
              </div>
              <div className="file-card-foot">
                <svg className="file-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 1.6h5L12.4 5v9.4c0 .3-.2.5-.5.5H4a.5.5 0 0 1-.5-.5V2.1c0-.3.2-.5.5-.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M8.8 1.8V5h3.2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                <span className="file-card-info">
                  <span className="file-name">{d.name}</span>
                  <span className="file-meta">
                    {typeof d.pages === "number" ? `${d.pages}p · ` : ""}
                    {d.updatedAt ? `Edited ${timeAgo(d.updatedAt)}` : "—"}
                  </span>
                </span>
              </div>
            </button>
          ))}

          <button className="file-card add-file" onClick={newDoc}>
            <div className="file-card-thumb add">
              <span className="add-plus">+</span>
            </div>
            <div className="file-card-foot">
              <span className="file-name">New document</span>
            </div>
          </button>
        </div>
      </main>
      {opening && <Loader overlay label="Opening document…" />}
    </div>
  );
}
