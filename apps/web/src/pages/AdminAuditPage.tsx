import { useState } from "react";
import { useAuditEvents } from "../api/hooks";
import { Button, Card, Input, Pill, type PillTone } from "../components/ui";
import { csvFilename, downloadCsv } from "../lib/csv";

// Tone-code the event families so failures/lockouts jump out of the list.
function eventTone(event: string): PillTone {
  if (event === "login.lockout" || event.endsWith("failure") || event === "rate_limit.exceeded") return "fail";
  if (event === "login.success" || event === "user.unlock" || event === "mfa.enabled") return "pass";
  if (event.startsWith("user.") || event === "mfa.disabled") return "warn";
  return "neutral";
}

/** Pretty-print the JSON detail blob as "key: value" fragments; fall back to the raw string. */
function detailText(detail: string | null): string {
  if (!detail) return "";
  try {
    return Object.entries(JSON.parse(detail) as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(" · ");
  } catch {
    return detail;
  }
}

/** Read-only security audit trail (sign-ins, failures, lockouts, user admin, Qualys syncs). */
export function AdminAuditPage() {
  const [q, setQ] = useState("");
  const { data: events, isLoading } = useAuditEvents(q.trim());

  return (
    <div>
      <div className="scope">
        <span>Audit log{events ? ` · latest ${events.length} events` : ""}</span>
      </div>
      <Card
        title="Security events"
        hint="Sign-ins, failures, lockouts, and account changes — retained for one year."
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="search"
              placeholder="Filter by email, event, or IP…"
              aria-label="Filter audit events"
              className="w-auto min-w-[240px] py-1.5"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button
              size="sm"
              icon="arrow-down-outline"
              disabled={!events?.length}
              title="Download the current view as CSV — the access-log artifact auditors ask for"
              onClick={() =>
                downloadCsv(
                  csvFilename("watchtower-audit-log"),
                  ["Time (UTC)", "Event", "Account", "IP", "Details"],
                  (events ?? []).map((e) => [e.createdAt, e.event, e.email ?? "", e.ip ?? "", detailText(e.detail)])
                )
              }
            >
              Export CSV
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <p className="py-2 text-xs text-ink-faint">Loading…</p>
        ) : !events?.length ? (
          <p className="py-2 text-xs text-ink-faint">
            {q.trim() ? `No events match "${q.trim()}".` : "No events recorded yet."}
          </p>
        ) : (
          <div className="ov-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Account</th>
                  <th>IP</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td
                      data-label="When"
                      className="whitespace-nowrap font-mono text-2xs text-ink-dim"
                      title={new Date(e.createdAt).toISOString()}
                    >
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td data-label="Event">
                      <Pill round tone={eventTone(e.event)}>
                        {e.event}
                      </Pill>
                    </td>
                    <td data-label="Account" className="font-mono text-2xs text-ink-dim">
                      {e.email ?? <span className="text-ink-faint">—</span>}
                    </td>
                    <td data-label="IP" className="font-mono text-2xs text-ink-dim">
                      {e.ip ?? <span className="text-ink-faint">—</span>}
                    </td>
                    <td data-label="Details" className="max-w-[320px] truncate font-mono text-2xs text-ink-faint" title={detailText(e.detail)}>
                      {detailText(e.detail)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
