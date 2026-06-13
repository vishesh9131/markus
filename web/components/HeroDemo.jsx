"use client";

import { useEffect, useState } from "react";

// A calm, looping product demo: a .mks source "types" on the left and the
// compiled page builds on the right — exactly what Markus does. Pure CSS/React
// (no WebGL), automatically theme-aware through the CSS variables.
const CODE = [
  "# Attention",
  "",
  "We study **transformers**",
  "and their $O(n^2)$ cost.",
  "",
  "- linear kernels",
  "- sparse patterns",
];

export default function HeroDemo() {
  const [tick, setTick] = useState(0);
  const cycle = CODE.length + 6; // type lines, then hold the rendered page

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % cycle), 620);
    return () => clearInterval(id);
  }, [cycle]);

  const shown = Math.min(tick, CODE.length);
  const rendered = tick >= CODE.length;

  return (
    <div className="hero-demo" aria-hidden="true">
      <div className="hd-window">
        <div className="hd-bar">
          <span className="hd-dot" />
          <span className="hd-dot" />
          <span className="hd-dot" />
          <span className="hd-file">paper.mks</span>
        </div>
        <div className="hd-body">
          {/* editor */}
          <div className="hd-editor">
            {CODE.map((line, i) => (
              <div key={i} className={`hd-line ${i < shown ? "on" : ""}`}>
                {line || " "}
                {!rendered && i === shown - 1 && <span className="hd-caret" />}
              </div>
            ))}
          </div>
          {/* compiled page */}
          <div className={`hd-paper ${rendered ? "rendered" : ""}`}>
            <h4 className="hd-h">Attention</h4>
            <p className="hd-p">
              We study <b>transformers</b> and their <span className="hd-math">O(n²)</span> cost.
            </p>
            <ul className="hd-ul">
              <li>linear kernels</li>
              <li>sparse patterns</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="hd-caption">
        <span className="hd-badge">.mks</span>
        <svg width="22" height="12" viewBox="0 0 22 12" fill="none" className="hd-flow">
          <path d="M0 6h19M15 2l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hd-badge solid">PDF</span>
      </div>
    </div>
  );
}
