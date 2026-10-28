import type { ClientDetail, TopVuln } from "@watchtower/shared";
import { useEffect, useState } from "react";
import { useQualysKb, useSetQualysKb } from "../api/hooks";
import { severityMeta } from "../lib/qualysLink";
import type { TaskPrefill } from "./TaskEditorModal";
import { Button, Field, Input, Modal, Pill, Skeleton, Textarea } from "./ui";

/** One labelled block of the Qualys write-up. Rendered as plain text, never markup — see
 *  stripQualysHtml on the API side for why the HTML never reaches the browser at all. */
function Section({ label, body }: { label: string; body: string }) {
  if (!body.trim()) return null;
  return (
    <div className="mb-4">
      <div className="mb-1.5 font-mono text-3xs uppercase tracking-[1px] text-ink-faint">{label}</div>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-dim">{body}</p>
    </div>
  );
}

/**
 * The full write-up for one vulnerability, plus the path to turning it into a to-do.
 *
 * The prose is fetched on open rather than bundled into ClientDetail: the three blocks run to
 * several KB each, and ClientDetail is re-sent on every mutation on this page — including every
 * kanban drag. One load state here beats that on the hot path.
 */
export function VulnDetailModal({
  client,
  vuln,
  onCreateTask,
  onClose,
}: {
  client: ClientDetail;
  vuln: TopVuln;
  onCreateTask: (prefill: TaskPrefill) => void;
  onClose: () => void;
}) {
  const { data: kb, isLoading, isError } = useQualysKb(client.id, vuln.qid);
  const save = useSetQualysKb(client.id, vuln.qid);
  const sev = severityMeta(vuln.severity);
  const named = vuln.title || kb?.title || "";
  const title = named || `QID ${vuln.qid}`;

  // This subscription isn't entitled to the Qualys KnowledgeBase API, so titles and remediation
  // are written here by hand. An unnamed QID opens straight into the editor — there's nothing else
  // to show it, and naming it is the only useful thing to do.
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  useEffect(() => {
    if (!kb) return;
    setTitleDraft(kb.title);
    setNotesDraft(kb.notes);
    if (!kb.title && !kb.notes) setEditing(true);
  }, [kb]);

  const hasWriteUp = !!(kb && (kb.diagnosis || kb.consequence || kb.solution));

  // Five people making five identical to-dos is this feature's most obvious failure mode.
  const existing = client.tasks.find((t) => t.linkType === "qualys" && t.linkRef === vuln.qid);

  function buildPrefill(): TaskPrefill {
    return {
      // The API caps title at 300 chars; vulnerability names are long enough to matter.
      title: `Remediate: ${title}`.slice(0, 300),
      // Qualys's solution text if it ever arrives, otherwise whatever was written here by hand.
      note: (kb?.solution || kb?.notes || "").slice(0, 1500),
      priority: vuln.severity >= 4 ? "High" : "Medium",
      linkType: "qualys",
      // Bare QID — see lib/qualysLink.ts for why this isn't a new TaskLinkType.
      linkRef: vuln.qid,
    };
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      maxWidth={760}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon="add-outline" onClick={() => onCreateTask(buildPrefill())}>
            Create to-do
          </Button>
        </>
      }
    >
      {/* Facts line: identifier and counts in mono, severity as a pill with its word. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line-soft pb-3.5 font-mono text-2xs text-ink-dim">
        <span className="tabular-nums">QID {vuln.qid}</span>
        <Pill tone={sev.tone}>{sev.label}</Pill>
        <span>
          <b className="tabular-nums text-ink">{vuln.assetCount.toLocaleString()}</b> asset
          {vuln.assetCount === 1 ? "" : "s"}
        </span>
        <span>
          <b className="tabular-nums text-ink">{vuln.detectionCount.toLocaleString()}</b> detection
          {vuln.detectionCount === 1 ? "" : "s"}
        </span>
        {kb?.category && <span>{kb.category}</span>}
        {kb?.patchable && <span className="text-pass">Patch available</span>}
      </div>

      {vuln.cves.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {vuln.cves.map((c) => (
            <Pill key={c}>{c}</Pill>
          ))}
        </div>
      )}

      {existing && (
        <p className="mb-4 rounded border border-line-soft bg-surface-2 px-3 py-2 text-2xs text-ink-dim">
          A to-do already links to this QID: <b className="text-ink">{existing.title}</b> ({existing.status})
        </p>
      )}

      {isLoading && (
        <>
          <Skeleton className="mb-3 h-3 w-24" />
          <Skeleton className="mb-5 h-16" />
          <Skeleton className="mb-3 h-3 w-24" />
          <Skeleton className="h-16" />
        </>
      )}

      {isError && (
        <p className="text-xs text-ink-faint">
          Couldn&rsquo;t load the details for this QID. The counts above are current.
        </p>
      )}

      {kb && !editing && (
        <>
          {/* Qualys's own write-up, when the KnowledgeBase API has supplied one. */}
          <Section label="Threat" body={kb.diagnosis} />
          <Section label="Impact" body={kb.consequence} />
          <Section label="Solution" body={kb.solution} />
          <Section label="Notes" body={kb.notes} />
          {!hasWriteUp && !kb.notes && (
            <p className="mb-4 text-xs text-ink-faint">
              No description recorded for this QID yet.
            </p>
          )}
          <button type="button" className="grade-explain-link" onClick={() => setEditing(true)}>
            {named || kb.notes ? "Edit description" : "Add a description"}
          </button>
        </>
      )}

      {kb && editing && (
        <>
          {/* Naming is global — the same QIDs recur across the portfolio, so this is worth saying
              out loud or it reads like a per-client note. */}
          <p className="mb-3.5 text-2xs text-ink-faint">
            Qualys hasn&rsquo;t licensed KnowledgeBase API access for this subscription, so descriptions are
            recorded here. A name applies to <b className="text-ink-dim">every client</b> with this QID.
          </p>
          <Field label="Vulnerability name" className="mb-3.5" hint="e.g. EOL/Obsolete Software: Microsoft .Net Version 6 Detected">
            <Input
              type="text"
              value={titleDraft}
              autoFocus
              placeholder={`QID ${vuln.qid}`}
              onChange={(e) => setTitleDraft(e.target.value)}
            />
          </Field>
          <Field label="Notes" className="mb-3.5" hint="Context and remediation — what this is, and how it gets fixed.">
            <Textarea
              value={notesDraft}
              placeholder="Affects&hellip; Remediated by&hellip;"
              onChange={(e) => setNotesDraft(e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-2.5">
            <Button
              variant="primary"
              loading={save.isPending}
              onClick={() =>
                save.mutate(
                  { title: titleDraft.trim(), notes: notesDraft },
                  { onSuccess: () => setEditing(false) }
                )
              }
            >
              Save description
            </Button>
            <Button
              onClick={() => {
                setTitleDraft(kb.title);
                setNotesDraft(kb.notes);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            {save.isError && (
              <span role="alert" className="font-mono text-2xs text-fail">
                {save.error instanceof Error ? save.error.message : "Couldn't save."}
              </span>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
