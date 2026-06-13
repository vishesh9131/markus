"use client";

import { markdown } from "@codemirror/lang-markdown";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_EXAMPLE, EXAMPLES, TEMPLATES } from "../lib/examples";
import { useDialog } from "./Dialog";
import { exportPdfWithPreference } from "../lib/pdfExport";

const PdfViewer = dynamic(() => import("./PdfViewer"), { ssr: false });

const DEBOUNCE_MS = 350;
const STORAGE_KEY = "markus-studio-doc";
// when the compiler runs on a separate host (e.g. Render), point the browser at
// it directly; empty string = same-origin (single-host / local dev)
const COMPILE_BASE = process.env.NEXT_PUBLIC_COMPILE_URL || "";

const markusEditorTheme = EditorView.theme(
  {
    "&": { backgroundColor: "#ffffff", color: "#1a1916" },
    ".cm-content": { caretColor: "#1a1916" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#1a1916" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "#e7e4db" },
    ".cm-gutters": { backgroundColor: "#faf9f5", color: "#bcb8ad", border: "none" },
    ".cm-activeLine": { backgroundColor: "#faf9f5" },
    ".cm-activeLineGutter": { backgroundColor: "#f1efe8", color: "#8a8780" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px" },
  },
  { dark: false }
);

const markusEditorThemeDark = EditorView.theme(
  {
    "&": { backgroundColor: "#1b1f25", color: "#dfe4ea" },
    ".cm-content": { caretColor: "#dfe4ea" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#dfe4ea" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "#2f3742" },
    ".cm-gutters": { backgroundColor: "#21262e", color: "#5a626d", border: "none" },
    ".cm-activeLine": { backgroundColor: "#21262e" },
    ".cm-activeLineGutter": { backgroundColor: "#272d36", color: "#8a93a0" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px" },
  },
  { dark: true }
);

export default function Studio({
  initialDoc = null,
  docName = null,
  workspaceName = null,
  backHref = null,
  plan = "free",
  onSaveDoc = null,
  onUpgrade = null,
}) {
  const persistent = Boolean(onSaveDoc);
  const [source, setSource] = useState("");
  const [example, setExample] = useState(DEFAULT_EXAMPLE);
  const [template, setTemplate] = useState("");
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tex, setTex] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfData, setPdfData] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState(null);
  const [ms, setMs] = useState(null);
  const [tab, setTab] = useState("pdf");
  const [split, setSplit] = useState(50);
  const [health, setHealth] = useState(null);
  const [theme, setTheme] = useState("light");
  const dialog = useDialog();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [dirty, setDirty] = useState(false);

  const timer = useRef(null);
  const inflight = useRef(null);
  const sourceRef = useRef("");
  const pdfUrlRef = useRef(null);
  const dragging = useRef(false);
  const sessionRef = useRef(null);
  const pagesRef = useRef(0);

  useEffect(() => {
    const start =
      initialDoc != null
        ? initialDoc
        : window.localStorage.getItem(STORAGE_KEY) || EXAMPLES[DEFAULT_EXAMPLE];
    setSource(start);
    sourceRef.current = start;
    let sid = window.localStorage.getItem("markus-studio-session");
    if (!sid) {
      sid = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
      window.localStorage.setItem("markus-studio-session", sid);
    }
    // per-doc session dir keeps server builds warm without colliding across docs
    sessionRef.current = persistent && docName ? `${sid}_${hash(workspaceName + docName)}` : sid;
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    fetch(`${COMPILE_BASE}/api/health`).then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem("markus-studio-theme", next);
      window.dispatchEvent(new CustomEvent("markus-theme", { detail: next }));
      return next;
    });
  }, []);

  const loaderSrc = theme === "dark" ? "/mks-loader-cream.gif" : "/mks-loader.gif";

  const compile = useCallback(
    async (opts = {}) => {
      const body = {
        source: sourceRef.current,
        template: opts.template !== undefined ? opts.template : template,
        format: "pdf",
        sessionId: sessionRef.current,
        fast: opts.fast !== false,
        reset: opts.reset === true,
      };
      if (!body.source.trim()) return;
      if (inflight.current) inflight.current.abort();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      setBusy(true);
      try {
        const res = await fetch(`${COMPILE_BASE}/api/compile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (ctrl.signal.aborted) return;
        setTex(data.tex ?? null);
        setWarnings(data.warnings ?? []);
        setError(data.error ?? null);
        setMs(data.ms ?? null);
        if (data.pdf) {
          setPdfData(data.pdf);
          const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
          pdfUrlRef.current = url;
          setPdfUrl(url);
        }
      } catch (e) {
        if (e.name !== "AbortError") setError(String(e.message || e));
      } finally {
        if (inflight.current === ctrl) {
          inflight.current = null;
          setBusy(false);
        }
      }
    },
    [template]
  );

  useEffect(() => {
    if (source && !pdfUrl && !busy && tex === null) compile({ fast: true, reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const onChange = useCallback(
    (value) => {
      setSource(value);
      sourceRef.current = value;
      if (persistent) setDirty(true);
      else window.localStorage.setItem(STORAGE_KEY, value);
      if (!auto) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => compile({ fast: true }), DEBOUNCE_MS);
    },
    [auto, compile, persistent]
  );

  const save = useCallback(async () => {
    if (!onSaveDoc || saving) return;
    setSaving(true);
    try {
      await onSaveDoc({ content: sourceRef.current, pages: pagesRef.current });
      setSavedAt(Date.now());
      setDirty(false);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }, [onSaveDoc, saving]);

  // Cmd/Ctrl+S to save
  useEffect(() => {
    if (!persistent) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [persistent, save]);

  const loadExample = (name) => {
    setExample(name);
    const doc = EXAMPLES[name];
    setSource(doc);
    sourceRef.current = doc;
    if (persistent) setDirty(true);
    else window.localStorage.setItem(STORAGE_KEY, doc);
    compile({ fast: true, reset: true });
  };

  const changeTemplate = (t) => {
    setTemplate(t);
    compile({ template: t, fast: true, reset: true });
  };

  const download = (kind) => {
    if (kind === "pdf" && pdfData) {
      const base = (docName || "document").replace(/\.mks$/, "");
      exportPdfWithPreference(dialog, pdfData, `${base}.pdf`, theme === "dark" ? "dark" : "light").catch(
        (e) => dialog.alert(String(e?.message || e), { title: "Export failed" })
      );
    } else if (kind === "tex" && tex) {
      const url = URL.createObjectURL(new Blob([tex], { type: "text/plain" }));
      trigger(url, "document.tex");
      URL.revokeObjectURL(url);
    } else if (kind === "mks") {
      const url = URL.createObjectURL(new Blob([sourceRef.current], { type: "text/plain" }));
      trigger(url, (docName || "document").replace(/\.mks$/, "") + ".mks");
      URL.revokeObjectURL(url);
    }
  };

  useEffect(() => {
    const move = (e) => {
      if (!dragging.current) return;
      setSplit(Math.min(80, Math.max(20, (e.clientX / window.innerWidth) * 100)));
    };
    const up = () => {
      dragging.current = false;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  const pageOver = plan !== "premium" && pagesRef.current > 5;
  const statusDot = busy ? "busy" : error ? "err" : pdfUrl ? "ok" : "";
  const statusText = busy
    ? "Compiling…"
    : error
      ? "Build failed"
      : pdfUrl
        ? `Compiled${ms != null ? ` in ${(ms / 1000).toFixed(1)}s` : ""}`
        : "Ready";

  return (
    <div className="app">
      <div className="topbar">
        {backHref ? (
          <Link className="brand brand-link" href={backHref}>
            <span className="name">Markus</span>
            <span className="tag">studio</span>
          </Link>
        ) : (
          <div className="brand">
            <span className="name">Markus</span>
            <span className="tag">studio</span>
          </div>
        )}

        {persistent && (
          <span className="doc-chip" title={`${workspaceName || ""} / ${docName || ""}`}>
            {workspaceName ? <span className="ws">{workspaceName}</span> : null}
            <span className="sep">/</span>
            <span className="dn">{docName || "Untitled.mks"}</span>
          </span>
        )}

        <select value={example} onChange={(e) => loadExample(e.target.value)} title="Load example">
          {Object.keys(EXAMPLES).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>

        <select value={template} onChange={(e) => changeTemplate(e.target.value)} title="Template override">
          {TEMPLATES.map((t) => (
            <option key={t || "auto"} value={t}>{t || "template: auto"}</option>
          ))}
        </select>

        <button className="compile" onClick={() => compile({ fast: false, reset: true })} disabled={busy} title="Full build (resolves all references)">
          {busy ? "Compiling…" : "Compile"}
        </button>

        {persistent && (
          <button className="save-btn" onClick={save} disabled={saving} title="Save to your Drive (⌘S)">
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        )}

        <label className="toggle">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          auto
        </label>

        <div className="spacer" />

        {persistent && (
          <span className={`plan-badge ${plan}`} title={plan === "premium" ? "Premium" : "Free plan"}>
            {plan === "premium" ? "Premium" : "Free"}
          </span>
        )}
        {persistent && plan !== "premium" && onUpgrade && (
          <button className="ghost" onClick={onUpgrade}>Upgrade</button>
        )}

        <button className="ghost" onClick={() => download("mks")} title="Download .mks source">.mks</button>
        <button className="ghost" onClick={() => download("tex")} disabled={!tex} title="Download generated LaTeX">.tex</button>
        <button className="ghost" onClick={() => download("pdf")} disabled={!pdfData} title="Download PDF">.pdf</button>

        <div className="status">
          {busy ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="status-mks" src={loaderSrc} alt="" />
          ) : (
            <span className={`dot ${statusDot}`} />
          )}
          {statusText}
          {pageOver && <span style={{ color: "var(--amber)" }}>· {pagesRef.current}p &gt; 5 (free)</span>}
          {health && !health.ok && <span style={{ color: "var(--red)" }}>· markus CLI not found</span>}
        </div>

        <button className="icon-btn" onClick={toggleTheme} title={theme === "dark" ? "Switch to light" : "Switch to dark"} aria-label="Toggle theme">
          {theme === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      <div className="main">
        <div className="pane editor-pane" style={{ flexBasis: `${split}%`, flexGrow: 0, flexShrink: 0 }}>
          <div className="pane-head">source · .mks</div>
          <div className="editor-wrap">
            <CodeMirror
              value={source}
              height="100%"
              theme={theme === "dark" ? "dark" : "light"}
              extensions={[markdown(), theme === "dark" ? markusEditorThemeDark : markusEditorTheme, EditorView.lineWrapping]}
              onChange={onChange}
              basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
            />
          </div>
        </div>

        <div className={`divider${dragging.current ? " dragging" : ""}`} onMouseDown={() => { dragging.current = true; document.body.style.cursor = "col-resize"; }} />

        <div className="pane" style={{ flex: 1 }}>
          <div className="preview-tabs">
            <button className={`tab ${tab === "pdf" ? "active" : ""}`} onClick={() => setTab("pdf")}>PDF</button>
            <button className={`tab ${tab === "tex" ? "active" : ""}`} onClick={() => setTab("tex")}>LaTeX</button>
            <button className={`tab ${tab === "problems" ? "active" : ""}`} onClick={() => setTab("problems")}>
              Problems
              {warnings.length + (error ? 1 : 0) > 0 && (
                <span className="badge">{warnings.length + (error ? 1 : 0)}</span>
              )}
            </button>
          </div>

          <div className="preview-body">
            {tab === "pdf" &&
              (pdfData ? (
                <PdfViewer data={pdfData} fileName="document.pdf" onPages={(n) => { pagesRef.current = n; }} />
              ) : (
                <div className="placeholder">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="ph-loader" src={loaderSrc} alt="markus" />
                  <div>The compiled PDF will appear here.</div>
                  <div className="ph-sub">Requires the markus CLI and latexmk (TeX Live / MacTeX) on this machine.</div>
                </div>
              ))}

            {tab === "tex" && <pre className="tex-view">{tex ?? "Generated LaTeX will appear here."}</pre>}

            {tab === "problems" && (
              <div className="problems">
                {error && <div className="err">✕ {error}</div>}
                {warnings.map((w, i) => (<div key={i} className="warn">⚠ {w}</div>))}
                {!error && warnings.length === 0 && <div className="none">No problems — clean compile.</div>}
              </div>
            )}

            {busy && pdfData && (
              <div className="overlay">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="loader-gif" src={loaderSrc} alt="compiling" />
              </div>
            )}
          </div>

          {error && tab !== "problems" && <div className="errorbar">{error.split("\n")[0]}</div>}
        </div>
      </div>
    </div>
  );
}

function trigger(href, name) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
