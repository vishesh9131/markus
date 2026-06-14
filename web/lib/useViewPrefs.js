"use client";

import { useEffect, useState } from "react";

// Remembers the studio view mode (shared across pages) and a per-page sort.
// Reads from localStorage after mount so server and first client render match.
export function useViewPrefs({ sortKey, defaultView = "grid", defaultSort }) {
  const [view, setViewState] = useState(defaultView);
  const [sort, setSortState] = useState(defaultSort);

  useEffect(() => {
    try {
      const v = localStorage.getItem("markus-view");
      const s = localStorage.getItem(sortKey);
      if (v) setViewState(v);
      if (s) setSortState(s);
    } catch {
      /* ignore */
    }
  }, [sortKey]);

  const setView = (v) => {
    setViewState(v);
    try { localStorage.setItem("markus-view", v); } catch { /* ignore */ }
  };
  const setSort = (s) => {
    setSortState(s);
    try { localStorage.setItem(sortKey, s); } catch { /* ignore */ }
  };

  return { view, setView, sort, setSort };
}
