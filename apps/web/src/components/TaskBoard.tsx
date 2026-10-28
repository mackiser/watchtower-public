import type { IspmControl, Task, TaskPriority, TaskStatus } from "@watchtower/shared";
import { useEffect, useState } from "react";
import { useDeleteTask, useUpdateTask, useUserOptions } from "../api/hooks";
import { fmtShort } from "../lib/format";
import { qualysLinkLabel } from "../lib/qualysLink";
import { ConfirmDialog } from "./ConfirmDialog";
import { Icon } from "./Icon";
import { TaskEditorModal } from "./TaskEditorModal";
import { Input, Pill, Select } from "./ui";

const STATUSES: TaskStatus[] = ["To Do", "In Progress", "Done"];
const COL_ACCENT: Record<TaskStatus, string> = {
  "To Do": "var(--ink-faint)",
  "In Progress": "var(--signal)",
  Done: "var(--pass)",
};

function fmtTaskDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const AGE_WARN_DAYS = 14; // open tasks older than this get the warn tone

// Medium is the unmarked default — only deviations get a pill, so High jumps out instead of
// every card wearing a badge. Tones mirror the ISPM severity tiles.
const PRIORITY_PILL: Partial<Record<TaskPriority, { tone: "crit" | "low"; label: string }>> = {
  High: { tone: "crit", label: "High" },
  Low: { tone: "low", label: "Low" },
};
const PRIORITY_RANK: Record<TaskPriority, number> = { High: 0, Medium: 1, Low: 2 };

/** Column order: priority first, then nearest due date (undated last), then age. */
function cardOrder(a: Task, b: Task): number {
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (p) return p;
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return (a.created ?? "") < (b.created ?? "") ? -1 : 1;
}

function isOverdue(t: Task): boolean {
  return !!t.dueDate && t.status !== "Done" && t.dueDate < new Date().toISOString().slice(0, 10);
}

function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function fmtAge(days: number): string {
  if (days < 1) return "today";
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function linkLabel(t: Task): { cls: string; text: string } | null {
  if (t.linkType === "ispm") return { cls: "ispm", text: t.linkRef || "ISPM control" };
  // A qualys ref is either a severity bucket (the original dropdown) or a bare QID (created from
  // the Top vulnerabilities table). Existing cards read exactly as they did before.
  if (t.linkType === "qualys") return { cls: "qualys", text: qualysLinkLabel(t.linkRef) };
  return null;
}

/** Kanban task board — ported from the original app's drag/drop board (index.html:1518-1603). */
export function TaskBoard({ clientId, tasks, ispmControls }: { clientId: string; tasks: Task[]; ispmControls: IspmControl[] }) {
  const updateTask = useUpdateTask(clientId);
  const deleteTask = useDeleteTask(clientId);
  const [editorState, setEditorState] = useState<{ editing: Task | null; defaultStatus: TaskStatus } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOverCol, setDropOverCol] = useState<TaskStatus | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error" | null>(null);
  // Board filters — same idiom as ControlsTable: plain client-side narrowing over the loaded set.
  const [search, setSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const { data: teammates } = useUserOptions();

  const q = search.trim().toLowerCase();
  const visible = tasks.filter(
    (t) =>
      (!q ||
        t.title.toLowerCase().includes(q) ||
        t.note.toLowerCase().includes(q) ||
        t.linkRef.toLowerCase().includes(q)) &&
      (!linkFilter || (linkFilter === "none" ? !t.linkType : t.linkType === linkFilter)) &&
      (!assigneeFilter || (assigneeFilter === "none" ? !t.assigneeId : t.assigneeId === assigneeFilter))
  );
  const filtering = q !== "" || linkFilter !== "" || assigneeFilter !== "";

  function moveTask(id: string, newStatus: TaskStatus) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === newStatus) return;
    updateTask.mutate({ taskId: id, status: newStatus });
  }

  // Drag/drop moves commit instantly with no confirmation step, so this is the only feedback the
  // user gets that the move actually persisted (vs. just snapping back on refresh).
  useEffect(() => {
    if (updateTask.isPending) {
      setSaveState("saving");
      return;
    }
    if (updateTask.isError) {
      setSaveState("error");
      return;
    }
    if (updateTask.isSuccess) {
      setSaveState("saved");
      const t = setTimeout(() => setSaveState(null), 1800);
      return () => clearTimeout(t);
    }
  }, [updateTask.isPending, updateTask.isSuccess, updateTask.isError]);

  return (
    <div>
      <div className="board-toolbar">
        <Input
          type="search"
          placeholder="Search tasks…"
          aria-label="Search tasks"
          className="w-auto min-w-[180px] flex-none py-1.5"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Filter by linked item"
          className="w-auto py-1.5"
          value={linkFilter}
          onChange={(e) => setLinkFilter(e.target.value)}
        >
          <option value="">All links</option>
          <option value="ispm">ISPM-linked</option>
          <option value="qualys">Qualys-linked</option>
          <option value="none">Unlinked</option>
        </Select>
        <Select
          aria-label="Filter by assignee"
          className="w-auto py-1.5"
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
        >
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          {(teammates ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        {filtering && (
          <span className="font-mono text-3xs text-ink-faint" role="status">
            {visible.length} of {tasks.length} shown
          </span>
        )}
        <span className="spacer" />
        {saveState && (
          <span className={`board-save-state ${saveState}`}>
            <span className="dot" />
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Move saved" : "Couldn't save that move"}
          </span>
        )}
      </div>
      <div className="board-cols">
        {STATUSES.map((status) => {
          const inCol = visible.filter((t) => t.status === status).sort(cardOrder);
          return (
            <div
              className={`board-col${dropOverCol === status ? " drop-over" : ""}`}
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setDropOverCol(status);
              }}
              onDragLeave={() => setDropOverCol((c) => (c === status ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDropOverCol(null);
                const id = dragId ?? e.dataTransfer.getData("text/plain");
                if (id) moveTask(id, status);
              }}
            >
              <div className="board-col-head">
                <span className="board-col-title">
                  <span className="cdot" style={{ ["--ccol" as string]: COL_ACCENT[status] }} />
                  {status}
                </span>
                <span className="board-col-count">{inCol.length}</span>
              </div>
              <div className="board-col-body">
                {inCol.length === 0 && (
                  <div className="board-empty-col">{filtering ? "No matching tasks" : "Nothing here yet"}</div>
                )}
                {inCol.map((t) => {
                  const accent = t.status === "Done" ? "var(--pass)" : t.linkType === "qualys" ? "var(--crit)" : t.linkType === "ispm" ? "var(--low)" : "var(--line)";
                  const link = linkLabel(t);
                  return (
                    <div
                      className="tcard"
                      key={t.id}
                      draggable
                      style={{ ["--tcard-accent" as string]: accent }}
                      onDragStart={(e) => {
                        setDragId(t.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", t.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest(".tcard-actions")) return;
                        setEditorState({ editing: t, defaultStatus: status });
                      }}
                    >
                      <div className="tcard-actions">
                        <button title="Edit" aria-label="Edit task" onClick={() => setEditorState({ editing: t, defaultStatus: status })}>
                          <Icon name="create-outline" />
                        </button>
                        <button className="rm" title="Delete" aria-label="Delete task" onClick={() => setPendingDelete(t)}>
                          <Icon name="trash-outline" />
                        </button>
                      </div>
                      <div className="tcard-title">{t.title}</div>
                      {t.note && <div className="tcard-note">{t.note}</div>}
                      <div className="tcard-foot">
                        {PRIORITY_PILL[t.priority] && (
                          <Pill round tone={PRIORITY_PILL[t.priority]!.tone} title={`${t.priority} priority`}>
                            {PRIORITY_PILL[t.priority]!.label}
                          </Pill>
                        )}
                        {link && (
                          <span className={`tcard-link ${link.cls}`} title={link.text}>
                            {link.text}
                          </span>
                        )}
                        {t.dueDate && t.status !== "Done" && (
                          <span
                            className="tcard-dates"
                            style={isOverdue(t) ? { color: "var(--fail)", fontWeight: 650 } : undefined}
                            title={isOverdue(t) ? `Overdue — was due ${t.dueDate}` : `Due ${t.dueDate}`}
                          >
                            {isOverdue(t) ? "overdue" : "due"} {fmtShort(t.dueDate)}
                          </span>
                        )}
                        {t.assigneeName && (
                          <span className="tcard-dates" title={`Assigned to ${t.assigneeName}`}>
                            <Icon name="person-outline" size={11} /> {t.assigneeName.split(" ")[0]}
                          </span>
                        )}
                        {t.status === "Done" && t.completed ? (
                          <span className="tcard-dates" title="Completed">
                            <Icon name="checkmark-outline" /> {fmtTaskDate(t.completed)}
                          </span>
                        ) : t.created ? (
                          <span
                            className="tcard-dates"
                            style={ageDays(t.created) > AGE_WARN_DAYS ? { color: "var(--warn)" } : undefined}
                            title={`Created ${fmtTaskDate(t.created)}`}
                          >
                            open {fmtAge(ageDays(t.created))}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <button className="board-col-add" onClick={() => setEditorState({ editing: null, defaultStatus: status })}>
                  <Icon name="add-outline" /> Add task
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {editorState && (
        <TaskEditorModal
          clientId={clientId}
          editing={editorState.editing}
          defaultStatus={editorState.defaultStatus}
          ispmControls={ispmControls}
          onClose={() => setEditorState(null)}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title="Delete this task?"
          body={`"${pendingDelete.title || "Untitled task"}" will be removed. This can't be undone.`}
          confirmLabel="Delete task"
          danger
          onConfirm={() => {
            deleteTask.mutate(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
