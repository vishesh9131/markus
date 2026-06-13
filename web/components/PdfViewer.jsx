"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";

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

export default function PdfViewer({ data }) {
  const scrollRef = useRef(null);
  const hostRef = useRef(null);
  const [doc, setDoc] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState(0);

  // track available width
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // load document when the pdf data changes
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
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      task.destroy().catch(() => {});
    };
  }, [data]);

  // render all pages to canvases
  useEffect(() => {
    const host = hostRef.current;
    if (!doc || !host || !width) return;
    let cancelled = false;
    const tasks = [];

    (async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(120, (width - 56) * zoom);
      const frag = [];
      for (let n = 1; n <= doc.numPages; n++) {
        if (cancelled) return;
        const page = await doc.getPage(n);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = (targetW / base.width) * dpr;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page";
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = `${vp.width / dpr}px`;
        canvas.style.height = `${vp.height / dpr}px`;
        frag.push(canvas);
        const ctx = canvas.getContext("2d");
        const task = page.render({ canvasContext: ctx, viewport: vp });
        tasks.push(task);
        await task.promise.catch(() => {});
      }
      if (cancelled) return;
      host.replaceChildren(...frag);
    })();

    return () => {
      cancelled = true;
      tasks.forEach((t) => t.cancel?.());
    };
  }, [doc, width, zoom]);

  const pct = Math.round(zoom * 100);

  return (
    <div className="pdf-root">
      <div className="pdf-scroll" ref={scrollRef}>
        <div className="pdf-host" ref={hostRef} />
      </div>
      <div className="pdf-zoom">
        <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} title="Zoom out">
          −
        </button>
        <span className="pct" onClick={() => setZoom(1)} title="Reset zoom" role="button">
          {pct}%
        </span>
        <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2)))} title="Zoom in">
          +
        </button>
        {pages > 0 && <span className="pages">{pages}p</span>}
      </div>
    </div>
  );
}
