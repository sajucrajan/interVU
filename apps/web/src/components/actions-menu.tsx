"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  href?: string;
  tone?: "normal" | "danger" | "primary";
  disabled?: boolean;
  /** Renders as a non-interactive heading above a group. */
  heading?: boolean;
}

/**
 * A single "Actions" control that opens a menu — replaces stacking every
 * possible action as its own button inline in a row.
 */
export function ActionsMenu({
  items,
  // A bare glyph: in a table the "Actions ▾" label ate a whole column.
  label = "⋯",
  align = "right",
}: {
  items: MenuItem[];
  label?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className="secondary menu-trigger"
        aria-label={label === "⋯" ? "Actions" : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {label !== "⋯" && <span aria-hidden> ▾</span>}
      </button>
      {open && (
        <div className={`menu ${align === "left" ? "menu-left" : ""}`} role="menu">
          {items.map((item, i) =>
            item.heading ? (
              <div className="menu-heading" key={i}>
                {item.label}
              </div>
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={`menu-item ${item.tone ?? "normal"}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Lightweight modal for actions that need input. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="secondary modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
