"use client";

import { markdown } from "@codemirror/lang-markdown";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_EXAMPLE, EXAMPLES, TEMPLATES } from "../lib/examples";

// PDF.js touches the DOM/worker — load it client-side only.
const PdfViewer = dynamic(() => import("../components/PdfViewer"), { ssr: false });

const DEBOUNCE_MS = 350;
const STORAGE_KEY = "markus-studio-doc";

// Manus-toned light editor theme (warm paper, near-black ink)
const markusEditorTheme = EditorView.theme(
  {
    "&": { backgroundColor: "#ffffff", color: "#1a1916" },
    ".cm-content": { caretColor: "#1a1916" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#1a1916" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "#e7e4db" },
    ".cm-gutters": {
      backgroundColor: "#faf9f5",
      color: "#bcb8ad",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#faf9f5" },
    ".cm-activeLineGutter": { backgroundColor: "#f1efe8", color: "#8a8780" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px" },
  },
  { dark: false }
);

export default function Studio() {
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

  const timer = useRef(null);
  const inflight = useRef(null);
  const sourceRef = useRef("");
  const pdfUrlRef = useRef(null);
  const dragging = useRef(false);
  const sessionRef = useRef(null);

  // boot: restore doc, session id, check CLI
  useEffect(() => {
    const saved = typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY);
    const initial = saved || EXAMPLES[DEFAULT_EXAMPLE];
    setSource(initial);
    sourceRef.current = initial;
    let sid = window.localStorage.getItem("markus-studio-session");
    if (!sid) {
      sid = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
      window.localStorage.setItem("markus-studio-session", sid);
    }
    sessionRef.current = sid;
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compile = useCallback(
    async (opts = {}) => {
      const body = {
        source: sourceRef.current,
        template: opts.template !== undefined ? opts.template : template,
        format: "pdf",
        sessionId: sessionRef.current,
        // single fast pdflatex pass while typing; full latexmk on demand
        fast: opts.fast !== false,
        reset: opts.reset === true,
      };
      if (!body.source.trim()) return;
      if (inflight.current) inflight.current.abort();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      setBusy(true);
      try {
        const res = await fetch("/api/compile", {
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

  // initial compile once the source is loaded (cold build seeds the warm cache)
  useEffect(() => {
    if (source && !pdfUrl && !busy && tex === null) compile({ fast: true, reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const onChange = useCallback(
    (value) => {
      setSource(value);
      sourceRef.current = value;
      window.localStorage.setItem(STORAGE_KEY, value);
      if (!auto) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => compile({ fast: true }), DEBOUNCE_MS);
    },
    [auto, compile]
  );

  const loadExample = (name) => {
    setExample(name);
    const doc = EXAMPLES[name];
    setSource(doc);
    sourceRef.current = doc;
    window.localStorage.setItem(STORAGE_KEY, doc);
    compile({ fast: true, reset: true });
  };

  const changeTemplate = (t) => {
    setTemplate(t);
    compile({ template: t, fast: true, reset: true });
  };

  const download = (kind) => {
    if (kind === "pdf" && pdfUrl) {
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = "document.pdf";
      a.click();
    } else if (kind === "tex" && tex) {
      const url = URL.createObjectURL(new Blob([tex], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "document.tex";
      a.click();
      URL.revokeObjectURL(url);
    } else if (kind === "mks") {
      const url = URL.createObjectURL(new Blob([sourceRef.current], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "document.mks";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // split-pane drag
  useEffect(() => {
    const move = (e) => {
      if (!dragging.current) return;
      const pct = (e.clientX / window.innerWidth) * 100;
      setSplit(Math.min(80, Math.max(20, pct)));
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
        <div className="brand">
          <span className="name">Markus</span>
          <span className="tag">studio</span>
        </div>

        <select value={example} onChange={(e) => loadExample(e.target.value)} title="Load example">
          {Object.keys(EXAMPLES).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        <select
          value={template}
          onChange={(e) => changeTemplate(e.target.value)}
          title="Template override"
        >
          {TEMPLATES.map((t) => (
            <option key={t || "auto"} value={t}>
              {t || "template: auto"}
            </option>
          ))}
        </select>

        <button className="compile" onClick={() => compile({ fast: false, reset: true })} disabled={busy} title="Full build (resolves all references)">
          {busy ? "Compiling…" : "Compile"}
        </button>

        <label className="toggle">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          auto
        </label>

        <div className="spacer" />

        <button className="ghost" onClick={() => download("mks")} title="Download .mks source">
          .mks
        </button>
        <button className="ghost" onClick={() => download("tex")} disabled={!tex} title="Download generated LaTeX">
          .tex
        </button>
        <button className="ghost" onClick={() => download("pdf")} disabled={!pdfUrl} title="Download PDF">
          .pdf
        </button>

        <div className="status">
          {busy ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="status-mks" src="/mks-loader.gif" alt="" />
          ) : (
            <span className={`dot ${statusDot}`} />
          )}
          {statusText}
          {health && !health.ok && <span style={{ color: "var(--red)" }}>· markus CLI not found</span>}
        </div>
      </div>

      <div className="main">
        <div className="pane editor-pane" style={{ flexBasis: `${split}%`, flexGrow: 0, flexShrink: 0 }}>
          <div className="pane-head">source · .mks</div>
          <div className="editor-wrap">
            <CodeMirror
              value={source}
              height="100%"
              theme="light"
              extensions={[markdown(), markusEditorTheme, EditorView.lineWrapping]}
              onChange={onChange}
              basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
            />
          </div>
        </div>

        <div
          className={`divider${dragging.current ? " dragging" : ""}`}
          onMouseDown={() => {
            dragging.current = true;
            document.body.style.cursor = "col-resize";
          }}
        />

        <div className="pane" style={{ flex: 1 }}>
          <div className="preview-tabs">
            <button className={`tab ${tab === "pdf" ? "active" : ""}`} onClick={() => setTab("pdf")}>
              PDF
            </button>
            <button className={`tab ${tab === "tex" ? "active" : ""}`} onClick={() => setTab("tex")}>
              LaTeX
            </button>
            <button
              className={`tab ${tab === "problems" ? "active" : ""}`}
              onClick={() => setTab("problems")}
            >
              Problems
              {warnings.length + (error ? 1 : 0) > 0 && (
                <span className="badge">{warnings.length + (error ? 1 : 0)}</span>
              )}
            </button>
          </div>

          <div className="preview-body">
            {tab === "pdf" &&
              (pdfData ? (
                <PdfViewer data={pdfData} fileName="document.pdf" />
              ) : (
                <div className="placeholder">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="ph-loader" src="/mks-loader.gif" alt="markus" />
                  <div>The compiled PDF will appear here.</div>
                  <div className="ph-sub">
                    Requires the markus CLI and latexmk (TeX Live / MacTeX) on this machine.
                  </div>
                </div>
              ))}

            {tab === "tex" && (
              <pre className="tex-view">{tex ?? "Generated LaTeX will appear here."}</pre>
            )}

            {tab === "problems" && (
              <div className="problems">
                {error && <div className="err">✕ {error}</div>}
                {warnings.map((w, i) => (
                  <div key={i} className="warn">
                    ⚠ {w}
                  </div>
                ))}
                {!error && warnings.length === 0 && (
                  <div className="none">No problems — clean compile.</div>
                )}
              </div>
            )}

            {busy && (
              <div className="overlay">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="loader-gif" src="/mks-loader.gif" alt="compiling" />
              </div>
            )}
          </div>

          {error && tab !== "problems" && <div className="errorbar">{error.split("\n")[0]}</div>}
        </div>
      </div>
    </div>
  );
}
