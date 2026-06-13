"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";

// Worker is emitted as a static asset by the bundler.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

export default function PdfViewer({ data, fileName = "document.pdf" }) {
  const scrollRef = useRef(null);
  const hostRef = useRef(null);
  const canvasesRef = useRef([]);
  const lastScaleRef = useRef(1);
  const blobUrlRef = useRef(null);

  const [doc, setDoc] = useState(null);
  const [pages, setPages] = useState(0);
  const [current, setCurrent] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [rotation, setRotation] = useState(0);
  const [mode, setMode] = useState("width"); // 'width' | 'page' | 'custom'
  const [customScale, setCustomScale] = useState(1);
  const [pct, setPct] = useState(100);

  // a blob URL for download / print
  useEffect(() => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([b64ToBytes(data)], { type: "application/pdf" }));
    blobUrlRef.current = url;
    return () => URL.revokeObjectURL(url);
  }, [data]);

  // track the viewport size
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width) setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // load the document
  useEffect(() => {
    if (!data) {
      setDoc(null);
      return;
    }
    let cancelled = false;
    const task = pdfjs.getDocument({ data: b64ToBytes(data) });
    task.promise
      .then((pdf) => {
        if (cancelled) {
          pdf.destroy();
          return;
        }
        setDoc(pdf);
        setPages(pdf.numPages);
        setCurrent(1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      task.destroy().catch(() => {});
    };
  }, [data]);

  // render all pages
  useEffect(() => {
    const host = hostRef.current;
    if (!doc || !host || !box.w) return;
    let cancelled = false;
    const tasks = [];

    (async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pad = 56;
      const wraps = [];
      for (let n = 1; n <= doc.numPages; n++) {
        if (cancelled) return;
        const page = await doc.getPage(n);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1, rotation });
        let scale;
        if (mode === "page") {
          scale = Math.min((box.w - pad) / base.width, (box.h - pad) / base.height);
        } else if (mode === "custom") {
          scale = customScale;
        } else {
          scale = (box.w - pad) / base.width;
        }
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
        if (n === 1) {
          lastScaleRef.current = scale;
          setPct(Math.round(scale * 100));
        }

        const cssVp = page.getViewport({ scale, rotation });
        const renderVp = page.getViewport({ scale: scale * dpr, rotation });
        const cssW = Math.floor(cssVp.width);
        const cssH = Math.floor(cssVp.height);

        const wrap = document.createElement("div");
        wrap.className = "pdf-page-wrap";
        wrap.style.width = `${cssW}px`;
        wrap.style.height = `${cssH}px`;
        wrap.style.setProperty("--scale-factor", String(scale));
        wrap.style.setProperty("--total-scale-factor", String(scale));

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page";
        canvas.width = Math.floor(renderVp.width);
        canvas.height = Math.floor(renderVp.height);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        wrap.appendChild(canvas);

        const ctx = canvas.getContext("2d");
        const task = page.render({ canvasContext: ctx, viewport: renderVp });
        tasks.push(task);
        await task.promise.catch(() => {});
        if (cancelled) return;

        // selectable / copyable text overlay
        const tl = document.createElement("div");
        tl.className = "textLayer";
        wrap.appendChild(tl);
        try {
          const textLayer = new pdfjs.TextLayer({
            textContentSource: page.streamTextContent(),
            container: tl,
            viewport: cssVp,
          });
          await textLayer.render();
        } catch {
          /* text layer is best-effort; canvas still shows the page */
        }

        wraps.push(wrap);
      }
      if (cancelled) return;
      // keep the reader's place across live re-renders
      const sc = scrollRef.current;
      const ratio = sc && sc.scrollHeight ? sc.scrollTop / sc.scrollHeight : 0;
      host.replaceChildren(...wraps);
      canvasesRef.current = wraps;
      if (sc && ratio) sc.scrollTop = ratio * sc.scrollHeight;
    })();

    return () => {
      cancelled = true;
      tasks.forEach((t) => t.cancel?.());
    };
  }, [doc, box.w, box.h, mode, customScale, rotation]);

  // track current page on scroll
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const onScroll = () => {
      const mid = sc.scrollTop + sc.clientHeight / 2;
      const cs = canvasesRef.current;
      let best = 1;
      for (let i = 0; i < cs.length; i++) {
        if (cs[i].offsetTop <= mid) best = i + 1;
      }
      setCurrent(best);
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => sc.removeEventListener("scroll", onScroll);
  }, [doc]);

  const goToPage = useCallback((n) => {
    const cs = canvasesRef.current;
    const idx = Math.max(1, Math.min(cs.length, n)) - 1;
    const canvas = cs[idx];
    if (canvas) scrollRef.current.scrollTo({ top: canvas.offsetTop - 16, behavior: "smooth" });
  }, []);

  const zoomBy = useCallback((factor) => {
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, lastScaleRef.current * factor));
    setMode("custom");
    setCustomScale(next);
  }, []);

  const download = useCallback(() => {
    if (!blobUrlRef.current) return;
    const a = document.createElement("a");
    a.href = blobUrlRef.current;
    a.download = fileName;
    a.click();
  }, [fileName]);

  const print = useCallback(() => {
    if (!blobUrlRef.current) return;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    f.src = blobUrlRef.current;
    f.onload = () => {
      try {
        f.contentWindow.focus();
        f.contentWindow.print();
      } catch {
        window.open(blobUrlRef.current, "_blank");
      }
    };
    document.body.appendChild(f);
  }, []);

  return (
    <div className="pdf-root">
      <div className="pdf-toolbar">
        <div className="grp">
          <button onClick={() => goToPage(current - 1)} disabled={current <= 1} title="Previous page">
            ‹
          </button>
          <span className="pageno">
            <input
              type="text"
              value={current}
              onChange={(e) => {
                const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                if (!Number.isNaN(v)) setCurrent(v);
              }}
              onKeyDown={(e) => e.key === "Enter" && goToPage(current)}
              onBlur={() => goToPage(current)}
              aria-label="Page number"
            />
            <span className="sep">/</span>
            <span className="total">{pages || "–"}</span>
          </span>
          <button
            onClick={() => goToPage(current + 1)}
            disabled={current >= pages}
            title="Next page"
          >
            ›
          </button>
        </div>

        <div className="grp">
          <button onClick={() => zoomBy(1 / 1.15)} disabled={pct <= MIN_SCALE * 100} title="Zoom out">
            −
          </button>
          <span className="pct" onClick={() => setMode("width")} role="button" title="Reset to fit width">
            {pct}%
          </span>
          <button onClick={() => zoomBy(1.15)} disabled={pct >= MAX_SCALE * 100} title="Zoom in">
            +
          </button>
        </div>

        <div className="grp">
          <button
            className={mode === "width" ? "on" : ""}
            onClick={() => setMode("width")}
            title="Fit width"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M2 8h12M2 8l2.5-2.5M2 8l2.5 2.5M14 8l-2.5-2.5M14 8l-2.5 2.5"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            className={mode === "page" ? "on" : ""}
            onClick={() => setMode("page")}
            title="Fit page"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <rect x="3.5" y="2" width="9" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
          <button onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M12.5 6A5 5 0 1 0 13 9" stroke="currentColor" strokeWidth="1.3"
                strokeLinecap="round" fill="none" />
              <path d="M12.8 2.6V6H9.4" stroke="currentColor" strokeWidth="1.3"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="grp right">
          <button onClick={download} title="Download PDF">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.3"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button onClick={print} title="Print">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M4 6V2.5h8V6M4 12H2.5V6.5h11V12H12M4.5 9.5h7V14h-7z"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="pdf-scroll" ref={scrollRef}>
        <div className="pdf-host" ref={hostRef} />
      </div>
    </div>
  );
}
