"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Button that shows an inline spinner the instant it's clicked, for the whole
// duration of its (possibly async) onClick. Gives immediate feedback before any
// page-level mks loader appears.
export function Btn({ onClick, className = "ghost-btn", disabled, children, busy: busyProp, ...rest }) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const handle = async (e) => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await onClick?.(e);
    } finally {
      // component may unmount on navigation; guard the state set
      if (mounted.current) setBusy(false);
    }
  };
  const loading = busy || busyProp;
  return (
    <button
      className={className}
      onClick={onClick ? handle : undefined}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="btn-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

// Link that shows an inline spinner while it navigates (the destination then
// renders its own mks loader).
export function LinkBtn({ href, className = "ghost-btn", children, ...rest }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = () => {
    if (busy) return;
    setBusy(true);
    router.push(href);
  };
  return (
    <button className={className} onClick={go} disabled={busy} {...rest}>
      {busy && <span className="btn-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
