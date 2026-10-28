import type { ClientDetail, TopVuln } from "@watchtower/shared";
import { useState } from "react";
import { severityMeta } from "../lib/qualysLink";
import { TaskEditorModal, type TaskPrefill } from "./TaskEditorModal";
import { VulnDetailModal } from "./VulnDetailModal";
import { Card, Pill } from "./ui";

/**
 * The client's highest-impact vulnerabilities from the latest sync, ranked by how many assets
 * each one affects rather than by severity — a severity-4 on ninety-five machines is more of a
 * Monday morning than a severity-5 on one.
 *
 * Deliberately not sortable/filterable/exportable: it's five rows with one meaningful order, and
 * ControlsTable's ~40 lines of sort machinery would be scaffolding for a table that doesn't need
 * it. The full list lives in Qualys.
 */
export function TopVulnsCard({ client }: { client: ClientDetail }) {
  const [openQid, setOpenQid] = useState<string | null>(null);
  // The task editor replaces the detail modal rather than stacking on top of it — Modal's nesting
  // stack would handle the focus trap fine, but two scrims double-darken the page.
  const [prefill, setPrefill] = useState<TaskPrefill | null>(null);
  const vulns = client.topVulns;

  return (
    <Card
      title="Top vulnerabilities"
      hint="by affected assets"
      className="mb-6"
    >
      {vulns.length === 0 ? (
        <p className="py-2 text-xs text-ink-faint">
          {client.qualysTag
            ? "No per-vulnerability detail yet — it's recorded on the next Qualys sync."
            : "This client isn't linked to a Qualys tag, so there's no vulnerability detail to show. Set their tag in Manage Clients."}
        </p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>QID</th>
                <th>Vulnerability</th>
                <th>Severity</th>
                <th>Assets</th>
                <th>Detections</th>
              </tr>
            </thead>
            <tbody>
              {vulns.map((v) => (
                <VulnRow key={v.qid} vuln={v} onOpen={() => setOpenQid(v.qid)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openQid && (
        <VulnDetailModal
          client={client}
          vuln={vulns.find((v) => v.qid === openQid)!}
          onCreateTask={(p) => {
            setOpenQid(null);
            setPrefill(p);
          }}
          onClose={() => setOpenQid(null)}
        />
      )}
      {/* Reuses the board's editor rather than adding a second creation path — useCreateTask
          invalidates the client query, so the Tasks tab and its badge update on their own. */}
      {prefill && (
        <TaskEditorModal
          clientId={client.id}
          editing={null}
          defaultStatus="To Do"
          ispmControls={client.ispm}
          prefill={prefill}
          onClose={() => setPrefill(null)}
        />
      )}
    </Card>
  );
}

function VulnRow({ vuln: v, onOpen }: { vuln: TopVuln; onOpen: () => void }) {
  const sev = severityMeta(v.severity);
  return (
    <tr>
      {/* Mono for the identifier, per the mono-means-data rule. */}
      <td data-label="QID" className="font-mono tabular-nums text-ink-dim">
        {v.qid}
      </td>
      {/* The one interactive element, and it's a real button so it's keyboard-reachable — the
          row itself carries no click handler. Signal blue because it's an action; severity
          colour stays on the pill, where it means something. */}
      <td data-label="Vulnerability">
        <button type="button" className="vuln-open" onClick={onOpen}>
          {v.title || <span className="font-mono">QID {v.qid}</span>}
        </button>
        {/* No name yet. The Qualys subscription can't fetch one, so this is an invitation to
            write it rather than a "check back later" — say which. */}
        {!v.title && <div className="mt-0.5 text-3xs text-ink-faint">Click to name this vulnerability</div>}
      </td>
      <td data-label="Severity">
        <Pill tone={sev.tone}>{sev.label}</Pill>
      </td>
      <td data-label="Assets" className="font-mono font-semibold tabular-nums">
        {v.assetCount.toLocaleString()}
      </td>
      <td data-label="Detections" className="font-mono tabular-nums text-ink-dim">
        {v.detectionCount.toLocaleString()}
      </td>
    </tr>
  );
}
