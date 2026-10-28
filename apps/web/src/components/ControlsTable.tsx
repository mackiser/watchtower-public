import type { IspmControl, IspmSeverity } from "@watchtower/shared";
import { Fragment, useMemo, useState } from "react";
import { csvFilename, downloadCsv } from "../lib/csv";
import { ConfirmDialog } from "./ConfirmDialog";
import { Icon } from "./Icon";
import { Button, Card, Input, Pill, Select, type PillTone } from "./ui";

const SEV_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
const SEV_TONE: Record<string, PillTone> = { High: "high", Medium: "med", Low: "low" };

type SortCol = "control" | "category" | "group" | "sevRank" | "statusRank";
const COLS: { k: SortCol; t: string }[] = [
  { k: "control", t: "Control" },
  { k: "category", t: "Category" },
  { k: "group", t: "Enforcement" },
  { k: "sevRank", t: "Severity" },
  { k: "statusRank", t: "Status" },
];

const rowKey = (c: IspmControl) => c.id ?? c.control;

interface Draft {
  control: string;
  category: string;
  group: string;
  severity: IspmSeverity;
  compliant: boolean;
}

/** Filterable, sortable ISPM control table. Pass `edit` to make it the editing surface: status
 *  pills become toggles, rows gain edit/remove, and an Add Control button appears. Every save
 *  replaces the full control set server-side (and stamps today's history point) — see
 *  useReplaceIspm. `busy` disables all edit affordances while a save is in flight, because two
 *  concurrent replace-all writes built from the same base would silently drop one edit. */
export function ControlsTable({
  controls,
  edit,
}: {
  controls: IspmControl[];
  edit?: { save: (next: IspmControl[]) => void; busy: boolean };
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [group, setGroup] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: "sevRank", dir: -1 });
  // `original: null` = adding a new control (editor renders as a pinned first row).
  const [editing, setEditing] = useState<{ originalKey: string | null; draft: Draft } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<IspmControl | null>(null);

  const categories = useMemo(() => [...new Set(controls.map((c) => c.category))].sort(), [controls]);
  const groups = useMemo(() => [...new Set(controls.map((c) => c.group))].sort(), [controls]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = controls.filter((r) => {
      if (q && !r.control.toLowerCase().includes(q)) return false;
      if (category && r.category !== category) return false;
      if (group && r.group !== group) return false;
      if (severity && r.severity !== severity) return false;
      if (status === "compliant" && !r.compliant) return false;
      if (status === "notcompliant" && r.compliant) return false;
      return true;
    });
    const withRank = filtered.map((r) => ({
      ...r,
      sevRank: SEV_RANK[r.severity] ?? 0,
      statusRank: r.compliant ? 1 : 0,
    }));
    withRank.sort((a, b) => {
      const x = a[sort.col];
      const y = b[sort.col];
      if (typeof x === "string" && typeof y === "string") return x.localeCompare(y) * sort.dir;
      return (((x as number) || 0) - ((y as number) || 0)) * sort.dir;
    });
    return withRank;
  }, [controls, search, category, group, severity, status, sort]);

  function onSort(col: SortCol) {
    setSort((s) => (s.col === col ? { col, dir: (s.dir * -1) as 1 | -1 } : { col, dir: col === "sevRank" || col === "statusRank" ? -1 : 1 }));
  }

  function toggleCompliant(key: string) {
    edit?.save(controls.map((c) => (rowKey(c) === key ? { ...c, compliant: !c.compliant } : c)));
  }

  function startAdd() {
    setEditing({ originalKey: null, draft: { control: "", category: "", group: "", severity: "Medium", compliant: false } });
  }

  function startEdit(c: IspmControl) {
    setEditing({
      originalKey: rowKey(c),
      draft: { control: c.control, category: c.category, group: c.group, severity: c.severity, compliant: c.compliant },
    });
  }

  function saveEditor() {
    if (!edit || !editing || !editing.draft.control.trim()) return;
    const d = { ...editing.draft, control: editing.draft.control.trim() };
    const next =
      editing.originalKey == null
        ? [...controls, d]
        : controls.map((c) => (rowKey(c) === editing.originalKey ? { ...c, ...d } : c));
    // Close before saving — the response re-keys every row (server regenerates ids), so a still-
    // open editor would be orphaned.
    setEditing(null);
    edit.save(next);
  }

  function editorKeys(e: React.KeyboardEvent) {
    if (e.key === "Escape") setEditing(null);
    if (e.key === "Enter") {
      e.preventDefault();
      saveEditor();
    }
  }

  const colCount = edit ? 6 : 5;

  function editorRow() {
    if (!editing) return null;
    const d = editing.draft;
    const patch = (p: Partial<Draft>) => setEditing((s) => (s ? { ...s, draft: { ...s.draft, ...p } } : s));
    return (
      <tr>
        <td className="max-w-[440px]">
          <Input
            autoFocus
            value={d.control}
            placeholder="Control name"
            aria-label="Control name"
            onChange={(e) => patch({ control: e.target.value })}
            onKeyDown={editorKeys}
          />
        </td>
        <td>
          <Input
            value={d.category}
            placeholder="Uncategorized"
            aria-label="Category"
            onChange={(e) => patch({ category: e.target.value })}
            onKeyDown={editorKeys}
          />
        </td>
        <td>
          <Input
            value={d.group}
            placeholder="N/A"
            aria-label="Enforcement group"
            onChange={(e) => patch({ group: e.target.value })}
            onKeyDown={editorKeys}
          />
        </td>
        <td>
          <Select value={d.severity} aria-label="Severity" onChange={(e) => patch({ severity: e.target.value as IspmSeverity })}>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </Select>
        </td>
        <td>
          <Select
            value={d.compliant ? "1" : "0"}
            aria-label="Status"
            onChange={(e) => patch({ compliant: e.target.value === "1" })}
          >
            <option value="1">Compliant</option>
            <option value="0">Not Compliant</option>
          </Select>
        </td>
        <td>
          <div className="flex justify-end gap-2 whitespace-nowrap">
            <Button size="sm" variant="primary" disabled={!d.control.trim() || edit!.busy} onClick={saveEditor}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <Card
      title="Controls"
      hint={
        edit ? (
          <>
            {rows.length} of {controls.length} shown &middot; click a status to toggle compliance
          </>
        ) : (
          <>
            {rows.length} of {controls.length} shown &middot; click a header to sort
          </>
        )
      }
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            icon="arrow-down-outline"
            disabled={!rows.length}
            title="Download the current view (filtered and sorted) as CSV"
            onClick={() =>
              downloadCsv(
                csvFilename("watchtower-ispm-controls"),
                ["Control", "Category", "Enforcement", "Severity", "Status"],
                rows.map((r) => [r.control, r.category, r.group, r.severity, r.compliant ? "Compliant" : "Not compliant"])
              )
            }
          >
            Export CSV
          </Button>
          {edit && (
            <Button size="sm" icon="add-outline" disabled={edit.busy || !!editing} onClick={startAdd}>
              Add control
            </Button>
          )}
        </div>
      }
    >
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <Input
          type="text"
          aria-label="Search control name"
          placeholder="Search control name…"
          className="min-w-[180px] flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select className="w-auto" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </Select>
        <Select className="w-auto" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </Select>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="compliant">Compliant</option>
          <option value="notcompliant">Not Compliant</option>
        </Select>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.k} aria-sort={sort.col === c.k ? (sort.dir > 0 ? "ascending" : "descending") : undefined}>
                  <button type="button" className="th-sort" onClick={() => onSort(c.k)}>
                    {c.t}{" "}
                    <span className="arrow">
                      {sort.col === c.k ? <Icon name={sort.dir > 0 ? "caret-up" : "caret-down"} /> : ""}
                    </span>
                  </button>
                </th>
              ))}
              {edit && <th />}
            </tr>
          </thead>
          <tbody>
            {editing?.originalKey == null && editorRow()}
            {rows.length
              ? rows.map((r) => {
                  const key = rowKey(r);
                  if (editing?.originalKey === key) return <Fragment key={key}>{editorRow()}</Fragment>;
                  return (
                    <tr key={key}>
                      <td className="max-w-[440px]" data-label="Control">{r.control}</td>
                      <td data-label="Category">
                        <Pill>{r.category}</Pill>
                      </td>
                      <td data-label="Enforcement">{r.group}</td>
                      <td data-label="Severity">
                        <Pill tone={SEV_TONE[r.severity] ?? "neutral"}>{r.severity}</Pill>
                      </td>
                      <td data-label="Status">
                        {edit ? (
                          <button
                            type="button"
                            className="cursor-pointer rounded disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                            title="Toggle compliance"
                            aria-label={`Mark "${r.control}" ${r.compliant ? "not compliant" : "compliant"}`}
                            disabled={edit.busy}
                            onClick={() => toggleCompliant(key)}
                          >
                            {r.compliant ? <Pill tone="pass">Compliant</Pill> : <Pill tone="fail">Not Compliant</Pill>}
                          </button>
                        ) : r.compliant ? (
                          <Pill tone="pass">Compliant</Pill>
                        ) : (
                          <Pill tone="fail">Not Compliant</Pill>
                        )}
                      </td>
                      {edit && (
                        <td>
                          <div className="flex justify-end gap-1 whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="ghost"
                              icon="create-outline"
                              aria-label={`Edit "${r.control}"`}
                              disabled={edit.busy || !!editing}
                              onClick={() => startEdit(r)}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              icon="trash-outline"
                              aria-label={`Remove "${r.control}"`}
                              disabled={edit.busy || !!editing}
                              onClick={() => setPendingRemove(r)}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              : !editing && (
                  <tr>
                    <td colSpan={colCount} className="py-2 text-center text-xs text-ink-faint">
                      {controls.length
                        ? "No controls match these filters."
                        : "No ISPM controls yet — add the first control to start tracking compliance."}
                    </td>
                  </tr>
                )}
          </tbody>
        </table>
      </div>
      {pendingRemove && edit && (
        <ConfirmDialog
          title="Remove this control?"
          body={`"${pendingRemove.control}" will be removed from this client's ISPM list and today's history point restamped without it.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => {
            const key = rowKey(pendingRemove);
            setPendingRemove(null);
            edit.save(controls.filter((c) => rowKey(c) !== key));
          }}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </Card>
  );
}
