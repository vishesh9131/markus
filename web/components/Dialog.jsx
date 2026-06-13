"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const DialogContext = createContext(null);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within <DialogProvider>");
  return ctx;
}

let idSeq = 0;

export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null); // { id, kind, title, message, ... , resolve }
  const inputRef = useRef(null);

  const close = useCallback((value) => {
    setDlg((cur) => {
      cur?.resolve?.(value);
      return null;
    });
  }, []);

  const open = useCallback(
    (kind, opts = {}) =>
      new Promise((resolve) => {
        setDlg({ id: ++idSeq, kind, resolve, defaultValue: "", ...opts });
      }),
    []
  );

  const api = useRef({
    alert: (message, opts = {}) => open("alert", { message, okText: "OK", ...opts }),
    confirm: (message, opts = {}) =>
      open("confirm", { message, okText: "OK", cancelText: "Cancel", ...opts }),
    prompt: (message, opts = {}) =>
      open("prompt", { message, okText: "OK", cancelText: "Cancel", ...opts }),
    // choose: opts.options = [{ label, value }]; resolves the chosen value or null
    choose: (message, opts = {}) =>
      open("choose", { message, options: [], cancelText: "Cancel", ...opts }),
  }).current;

  // focus input / button when a dialog opens
  useEffect(() => {
    if (dlg && inputRef.current) inputRef.current.focus();
  }, [dlg]);

  // ESC to cancel
  useEffect(() => {
    if (!dlg) return;
    const onKey = (e) => {
      if (e.key === "Escape") close(dlg.kind === "prompt" ? null : false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dlg, close]);

  const submit = () => {
    if (dlg.kind === "prompt") close(inputRef.current ? inputRef.current.value : "");
    else close(true);
  };
  const cancel = () => close(dlg.kind === "prompt" ? null : false);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dlg && (
        <div className="mk-dialog-backdrop" onMouseDown={cancel}>
          <div
            className="mk-dialog"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mk-dialog-brand">
              <span className="name">Markus</span>
            </div>
            {dlg.title && <h3 className="mk-dialog-title">{dlg.title}</h3>}
            {dlg.message && <p className="mk-dialog-msg">{dlg.message}</p>}
            {dlg.kind === "prompt" && (
              <input
                ref={inputRef}
                className="mk-dialog-input"
                defaultValue={dlg.defaultValue || ""}
                placeholder={dlg.placeholder || ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
              />
            )}
            {dlg.kind === "choose" ? (
              <div className="mk-dialog-actions">
                <button className="ghost-btn" onClick={cancel}>
                  {dlg.cancelText}
                </button>
                {dlg.options.map((o, i) => (
                  <button
                    key={o.value}
                    ref={i === 0 ? inputRef : null}
                    className={o.primary ? "cta" : "ghost-btn"}
                    onClick={() => close(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mk-dialog-actions">
                {dlg.kind !== "alert" && (
                  <button className="ghost-btn" onClick={cancel}>
                    {dlg.cancelText}
                  </button>
                )}
                <button
                  ref={dlg.kind === "alert" ? inputRef : null}
                  className={dlg.danger ? "cta danger" : "cta"}
                  onClick={submit}
                >
                  {dlg.okText}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
