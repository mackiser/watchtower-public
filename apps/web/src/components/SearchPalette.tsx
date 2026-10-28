import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearch } from "../api/hooks";
import { Icon } from "./Icon";
import { Input, Modal, Pill } from "./ui";

interface Row {
  key: string;
  group: "Clients" | "Tasks" | "ISPM controls";
  label: string;
  context?: string;
  pill?: { tone: "pass" | "fail" | "neutral"; text: string };
  to: string;
  tab?: "tasks" | "ispm";
}

/**
 * Ctrl+K command palette — one box that jumps to any client, task, or ISPM control.
 * Grouped results, arrow-key navigation, Enter to go. The Modal shell supplies the focus
 * trap/Escape handling; the list is a listbox for a11y with the active row tracked manually.
 */
export function SearchPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [q, setQ] = useState(""); // debounced
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(input), 200);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isFetching } = useSearch(q);

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    return [
      ...data.clients.map((c) => ({
        key: `c-${c.id}`,
        group: "Clients" as const,
        label: c.name,
        to: `/clients/${c.id}`,
      })),
      ...data.tasks.map((t) => ({
        key: `t-${t.id}`,
        group: "Tasks" as const,
        label: t.title,
        context: t.clientName,
        pill: t.done ? { tone: "pass" as const, text: "Done" } : { tone: "neutral" as const, text: "Open" },
        to: `/clients/${t.clientId}`,
        tab: "tasks" as const,
      })),
      ...data.controls.map((c) => ({
        key: `i-${c.id}`,
        group: "ISPM controls" as const,
        label: c.control,
        context: c.clientName,
        pill: c.compliant
          ? { tone: "pass" as const, text: "Compliant" }
          : { tone: "fail" as const, text: "Not compliant" },
        to: `/clients/${c.clientId}`,
        tab: "ispm" as const,
      })),
    ];
  }, [data]);

  // Clamp the highlight when a new result set is shorter than the old index.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  function go(row: Row) {
    onClose();
    navigate(row.to, row.tab ? { state: { tab: row.tab } } : undefined);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      const next = e.key === "ArrowDown" ? Math.min(active + 1, rows.length - 1) : Math.max(active - 1, 0);
      setActive(next);
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && rows[active]) {
      e.preventDefault();
      go(rows[active]!);
    }
  }

  const showEmpty = q.trim().length >= 2 && !isFetching && rows.length === 0;

  return (
    <Modal title="Search" onClose={onClose} maxWidth={560} bodyClassName="!p-0">
      {/* One keydown handler on the wrapper drives the list while focus stays in the input. */}
      <div onKeyDown={onKeyDown}>
        <div className="border-b border-line px-4 py-3">
          <Input
            type="search"
            autoFocus
            placeholder="Search clients, tasks, ISPM controls…"
            aria-label="Search clients, tasks, and ISPM controls"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="palette-results"
          />
        </div>
        <div ref={listRef} id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto py-1.5">
          {q.trim().length < 2 ? (
            <p className="px-4 py-3 text-2xs text-ink-faint">
              Type at least 2 characters — results cover client names, task titles and notes, and ISPM control
              names.
            </p>
          ) : showEmpty ? (
            <p className="px-4 py-3 text-2xs text-ink-faint">No matches for &ldquo;{q.trim()}&rdquo;.</p>
          ) : (
            rows.map((row, i) => (
              <div key={row.key}>
                {(i === 0 || rows[i - 1]!.group !== row.group) && (
                  <div className="px-4 pb-1 pt-2.5 font-mono text-3xs uppercase tracking-[1px] text-ink-faint">
                    {row.group}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`flex w-full cursor-pointer items-center gap-2.5 border-none px-4 py-2 text-left text-xs ${
                    i === active ? "bg-signal-soft text-ink" : "bg-transparent text-ink-dim"
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(row)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{row.label}</span>
                  {row.pill && (
                    <Pill round tone={row.pill.tone}>
                      {row.pill.text}
                    </Pill>
                  )}
                  {row.context && (
                    <span className="max-w-[160px] flex-shrink-0 truncate font-mono text-3xs text-ink-faint">
                      {row.context}
                    </span>
                  )}
                  <Icon name="chevron-forward" size={12} className="flex-shrink-0 text-ink-faint" />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-line-soft px-4 py-2 font-mono text-3xs text-ink-faint">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </Modal>
  );
}
