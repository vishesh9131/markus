"use client";

import { useEffect, useState } from "react";

// Centered mks loader, theme-aware (cream on dark, ink on light).
export default function Loader({ label = "Loading…", overlay = false }) {
  const [src, setSrc] = useState("/mks-loader.gif");
  useEffect(() => {
    setSrc(
      document.documentElement.dataset.theme === "dark"
        ? "/mks-loader-cream.gif"
        : "/mks-loader.gif"
    );
  }, []);
  return (
    <div className={overlay ? "loader-overlay" : "loader-screen"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="loader-mks" src={src} alt="" />
      {label ? <div className="loader-label">{label}</div> : null}
    </div>
  );
}
