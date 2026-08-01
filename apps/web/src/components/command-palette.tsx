"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface SearchHit {
  kind: "candidate" | "position" | "vendor";
  id: string;
  label: string;
  hint: string;
  href: string;
}

interface PaletteItem {
  key: string;
  kind: string;
  label: string;
  hint: string;
  run: () => void;
}

/** Static destinations and commands, each gated on the capability it needs. */
const ACTIONS: { label: string; hint: string; href?: string; needs?: string; act?: string }[] = [
  { label: "Post a new role", hint: "positions", href: "/positions/new", needs: "positions.create" },
  { label: "Resolve match reviews", hint: "identity", href: "/match-reviews", needs: "candidates.merge" },
  { label: "Open the pipeline board", hint: "pipeline", href: "/pipeline", needs: "submissions.view" },
  { label: "Review duplicate contests", hint: "pipeline", href: "/pipeline?filter=duplicates", needs: "submissions.arbitrate" },
  { label: "Open analytics", hint: "insight", href: "/analytics", needs: "positions.view" },
  { label: "Manage people & access", hint: "admin", href: "/admin/people", needs: "org.manage_users" },
  { label: "Toggle theme", hint: "appearance", act: "theme" },
];

const KIND_LABEL: Record<string, string> = {
  candidate: "Candidate",
  position: "Position",
  vendor: "Vendor",
  action: "Action",
};

/**
 * ⌘K / Ctrl-K palette (design option 1c).
 *
 * Results come from `GET /search`, which filters by capability and scope
 * server-side — a palette that fetched everything and hid rows in the client
 * would already have leaked them.
 */
export function CommandPalette({ capabilities }: { capabilities: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [rawCursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global shortcut. Also closes on a second press, which is what people expect
  // once the habit forms.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setCursor(0);
      // Focus after paint, or the first keystroke is swallowed.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced, and every in-flight response older than the current query is
  // discarded so a slow reply cannot overwrite a newer one.
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    setCursor(0);
    let live = true;
    const t = setTimeout(() => {
      api<{ hits: SearchHit[] }>(`/search?q=${encodeURIComponent(term)}`)
        .then((r) => live && setHits(r.hits))
        .catch(() => live && setHits([]));
    }, 140);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, open]);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("intervu-theme", next);
    } catch {
      // Private mode: the choice just won't survive a reload.
    }
  }, []);

  const items: PaletteItem[] = useMemo(() => {
    const term = query.trim().toLowerCase();
    const actions = ACTIONS.filter(
      (a) =>
        (!a.needs || capabilities.includes(a.needs)) &&
        (term.length === 0 || a.label.toLowerCase().includes(term)),
    ).map((a) => ({
      key: `action:${a.label}`,
      kind: "action",
      label: a.label,
      hint: a.hint,
      run: () => {
        if (a.act === "theme") toggleTheme();
        else if (a.href) router.push(a.href);
      },
    }));

    const found = hits.map((h) => ({
      key: `${h.kind}:${h.id}`,
      kind: h.kind,
      label: h.label,
      hint: h.hint,
      run: () => router.push(h.href),
    }));

    // Records first when the user has typed: they searched for a thing, not a
    // command. With an empty box only the commands are meaningful.
    return term.length === 0 ? actions : [...found, ...actions];
  }, [hits, query, capabilities, router, toggleTheme]);

  // Derived, not synced. Resetting the cursor from an effect left a frame
  // where it pointed past the end of a freshly-arrived result set, so nothing
  // was highlighted and Enter did nothing. Clamping during render means the
  // first result is always pre-selected, as the design requires.
  const cursor = Math.min(rawCursor, Math.max(0, items.length - 1));

  if (!open) return null;

  const choose = (item: PaletteItem) => {
    setOpen(false);
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && items[cursor]) {
      e.preventDefault();
      choose(items[cursor]!);
    }
  };

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-head">
          <span className="palette-icon" aria-hidden>
            ⌕
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a candidate, role, vendor, or action…"
            aria-label="Search"
            autoComplete="off"
          />
          <span className="palette-esc">ESC</span>
        </div>
        <div className="palette-results" ref={listRef}>
          {items.length === 0 ? (
            <div className="palette-empty">
              {query.trim().length < 2
                ? "Type at least two characters."
                : "Nothing matches that."}
            </div>
          ) : (
            items.map((item, i) => (
              <div
                key={item.key}
                className={`palette-row${i === cursor ? " selected" : ""}`}
                onMouseEnter={() => setCursor(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(item);
                }}
                role="option"
                aria-selected={i === cursor}
              >
                <span className="palette-kind">{KIND_LABEL[item.kind] ?? item.kind}</span>
                <span className="palette-label">{item.label}</span>
                <span className="palette-hint">{item.hint}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
