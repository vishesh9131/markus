"use client";

import { useEffect, useState } from "react";

// Document thumbnail. Shows the real rendered first page when we've cached one
// (per device, written by the editor on compile — see lib/pdfThumb); otherwise
// a "paper sheet" placeholder with the name + faux text lines.
const LINE_WIDTHS = [94, 80, 88, 62, 74, 52, 90, 68];

export default function DocThumb({ name = "", docId, mini = false }) {
  const [thumb, setThumb] = useState(null);
  useEffect(() => {
    if (!docId) return;
    try {
      const t = localStorage.getItem(`mks-thumb:${docId}`);
      if (t) setThumb(t);
    } catch {
      /* ignore */
    }
  }, [docId]);

  if (thumb) {
    return (
      <div className={`doc-thumb has-thumb${mini ? " mini" : ""}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb} alt="" />
      </div>
    );
  }

  const title = name.replace(/\.mks$/, "");
  const count = mini ? 4 : 7;
  return (
    <div className={`doc-thumb${mini ? " mini" : ""}`} aria-hidden="true">
      {!mini && <div className="doc-thumb-title">{title}</div>}
      <div className="doc-thumb-lines">
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} style={{ width: `${LINE_WIDTHS[i % LINE_WIDTHS.length]}%` }} />
        ))}
      </div>
    </div>
  );
}
