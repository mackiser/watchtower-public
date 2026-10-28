import type { IspmControl, Task, TaskLinkType, TaskPriority, TaskStatus } from "@watchtower/shared";
import { FormEvent, useId, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import { useCreateTask, useUpdateTask, useUserOptions } from "../api/hooks";
import { qualysLinkLabel } from "../lib/qualysLink";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

const QUALYS_SEVERITIES = ["Critical", "High", "Medium", "Low"];
const STATUSES: TaskStatus[] = ["To Do", "In Progress", "Done"];
const PRIORITIES: TaskPriority[] = ["High", "Medium", "Low"];

/** Seed values for a brand-new task, used when the editor is opened from somewhere that already
 *  knows what the task is about (currently the Top vulnerabilities table). Ignored when editing. */
export type TaskPrefill = Partial<Pick<Task, "title" | "note" | "priority" | "linkType" | "linkRef">>;

export function TaskEditorModal({
  clientId,
  editing,
  defaultStatus,
  ispmControls,
  prefill,
  onClose,
}: {
  clientId: string;
  editing: Task | null;
  defaultStatus: TaskStatus;
  ispmControls: IspmControl[];
  prefill?: TaskPrefill;
  onClose: () => void;
}) {
  const createTask = useCreateTask(clientId);
  const updateTask = useUpdateTask(clientId);
  const formId = useId();
  const [title, setTitle] = useState(editing?.title ?? prefill?.title ?? "");
  const [note, setNote] = useState(editing?.note ?? prefill?.note ?? "");
  // Status is also editable here (not just via drag) so the board is usable by keyboard and touch.
  const [status, setStatus] = useState<TaskStatus>(editing?.status ?? defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>(editing?.priority ?? prefill?.priority ?? "Medium");
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? "");
  const [assigneeId, setAssigneeId] = useState(editing?.assigneeId ?? "");
  const [linkType, setLinkType] = useState<TaskLinkType>(editing?.linkType ?? prefill?.linkType ?? null);
  const [linkRef, setLinkRef] = useState(editing?.linkRef ?? prefill?.linkRef ?? "");
  const [error, setError] = useState<string | null>(null);
  const { data: teammates } = useUserOptions();

  const ispmOptions = useMemo(() => [...new Set(ispmControls.map((c) => c.control))].sort(), [ispmControls]);
  // A controlled <select> whose value isn't among its options renders blank, so the current ref is
  // always prepended when it isn't one of the four buckets — which covers QID refs from the Top
  // vulnerabilities table and any legacy value that predates this list.
  const qualysOptions = useMemo(
    () => (linkRef && !QUALYS_SEVERITIES.includes(linkRef) ? [linkRef, ...QUALYS_SEVERITIES] : QUALYS_SEVERITIES),
    [linkRef]
  );

  function onLinkTypeChange(next: TaskLinkType) {
    setLinkType(next);
    setLinkRef(next === "ispm" ? ispmOptions[0] ?? "" : next === "qualys" ? QUALYS_SEVERITIES[0]! : "");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Give the task a title.");
      return;
    }
    const fields = {
      title: title.trim(),
      status,
      note,
      priority,
      dueDate: dueDate || null,
      assigneeId: assigneeId || null,
      linkType,
      linkRef,
    };
    try {
      if (editing) {
        await updateTask.mutateAsync({ taskId: editing.id, ...fields });
      } else {
        await createTask.mutateAsync(fields);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save this task.");
    }
  }

  const pending = createTask.isPending || updateTask.isPending;

  return (
    <Modal
      title={editing ? "Edit task" : "Add task"}
      onClose={onClose}
      maxWidth={560}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" loading={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add task"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit}>
        <Field label="Title" className="mb-3.5">
          <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Note" className="mb-3.5">
          <Textarea placeholder="Context, blockers, scope…" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <Field label="Status" className="mb-3.5">
            <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" className="mb-3.5">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" className="mb-3.5" hint="Optional target — overdue cards get flagged on the board.">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Assignee" className="mb-3.5">
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {(teammates ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Link (optional)" className="mb-3.5" error={error}>
          <div className="grid grid-cols-[140px_1fr] gap-3 max-[560px]:grid-cols-1">
            <Select value={linkType ?? ""} onChange={(e) => onLinkTypeChange((e.target.value || null) as TaskLinkType)}>
              <option value="">No link</option>
              <option value="ispm">ISPM control</option>
              {/* Carries both severity buckets and individual QIDs now. */}
              <option value="qualys">Qualys</option>
            </Select>
            {linkType && (
              <Select value={linkRef} onChange={(e) => setLinkRef(e.target.value)}>
                {linkType === "ispm" ? (
                  ispmOptions.length ? (
                    ispmOptions.map((c) => <option key={c}>{c}</option>)
                  ) : (
                    <option value="">No ISPM controls loaded for this client</option>
                  )
                ) : (
                  qualysOptions.map((s) => (
                    <option key={s} value={s}>
                      {qualysLinkLabel(s)}
                    </option>
                  ))
                )}
              </Select>
            )}
          </div>
        </Field>
      </form>
    </Modal>
  );
}
