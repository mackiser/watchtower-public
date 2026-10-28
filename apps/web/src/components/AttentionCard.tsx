import type { AuthUser, ClientSummary } from "@watchtower/shared";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMe, useUsers } from "../api/hooks";
import { Card, Pill, type PillTone } from "./ui";

const STALE_DAYS = 21; // matches the Overview staleness fail threshold

/** Days since the latest Qualys scan; null = never scanned. */
function daysSince(iso: string | null): number | null {
  return iso == null ? null : Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function Row({ tone, count, label, children }: { tone: PillTone; count: number; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-line-soft py-2 last:border-b-0">
      <Pill round tone={tone}>
        {count}
      </Pill>
      <span className="text-xs font-semibold text-ink">{label}</span>
      <span className="min-w-0 text-2xs text-ink-dim">{children}</span>
    </div>
  );
}

/** First few client names as links, then a quiet "+N more". */
function ClientLinks({ clients }: { clients: ClientSummary[] }) {
  const shown = clients.slice(0, 5);
  return (
    <>
      {shown.map((c, i) => (
        <span key={c.id}>
          <Link className="text-ink-dim underline decoration-line hover:text-signal" to={`/clients/${c.id}`}>
            {c.name}
          </Link>
          {i < shown.length - 1 && " · "}
        </span>
      ))}
      {clients.length > shown.length && <span className="text-ink-faint"> +{clients.length - shown.length} more</span>}
    </>
  );
}

/**
 * The Overview's "what's wrong right now" digest — surfaces in one place what otherwise lives
 * on four different pages: failed/stale/never-configured Qualys syncs, plus (for admins) locked
 * and un-enrolled accounts. Rows render only when non-empty; all-clear collapses to one line.
 */
export function AttentionCard({ clients }: { clients: ClientSummary[] }) {
  const { data: me } = useMe();
  const isAdmin = me?.role === "ADMIN";
  const { data: users } = useUsers(isAdmin);

  const syncFailed = clients.filter((c) => c.qualysSyncError != null);
  // Stale = has a tag (should be auto-updating) but the newest scan is old; failures already
  // listed above take precedence to avoid double-reporting a client.
  const stale = clients.filter((c) => {
    if (c.qualysSyncError != null || !c.qualysTag) return false;
    const d = daysSince(c.lastQualysDate);
    return d == null || d > STALE_DAYS;
  });
  const untagged = clients.filter((c) => !c.qualysTag);
  const locked = (users ?? []).filter((u) => u.lockedUntil && new Date(u.lockedUntil) > new Date());
  // Exempt accounts are a deliberate admin choice, so they're not a "needs action" warning — but
  // they are a standing waiver worth keeping visible, hence their own neutral row below.
  const noMfa = (users ?? []).filter((u) => !u.mfaEnabled && !u.mfaExempt);
  // The public demo's one login is waived by design, so don't greet visitors with it.
  const mfaOptional = import.meta.env.VITE_DEMO_EMAIL ? [] : (users ?? []).filter((u) => u.mfaExempt);

  const allClear =
    !syncFailed.length && !stale.length && !untagged.length && !locked.length && !noMfa.length && !mfaOptional.length;

  return (
    <Card title="Needs attention" hint="issues across clients and accounts" className="mb-6">
      {allClear ? (
        <p className="py-1 text-xs text-ink-faint">Nothing needs attention.</p>
      ) : (
        <div>
          {syncFailed.length > 0 && (
            <Row tone="fail" count={syncFailed.length} label="Qualys sync failing">
              <ClientLinks clients={syncFailed} /> — check the tag or credentials in Manage Clients.
            </Row>
          )}
          {stale.length > 0 && (
            <Row tone="warn" count={stale.length} label={`No scan data in ${STALE_DAYS}+ days`}>
              <ClientLinks clients={stale} />
            </Row>
          )}
          {untagged.length > 0 && (
            <Row tone="neutral" count={untagged.length} label="Not syncing (no Qualys tag)">
              <ClientLinks clients={untagged} />
              {isAdmin && (
                <>
                  {" "}
                  — add tags in{" "}
                  <Link className="text-ink-dim underline decoration-line hover:text-signal" to="/admin/clients">
                    Manage Clients
                  </Link>
                  .
                </>
              )}
            </Row>
          )}
          {locked.length > 0 && (
            <Row tone="fail" count={locked.length} label="Accounts locked out">
              {locked.map((u: AuthUser) => u.name).join(", ")} —{" "}
              <Link className="text-ink-dim underline decoration-line hover:text-signal" to="/admin/users">
                unlock in Users
              </Link>
              .
            </Row>
          )}
          {noMfa.length > 0 && (
            <Row tone="warn" count={noMfa.length} label="Two-factor not enrolled">
              {noMfa.map((u: AuthUser) => u.name).join(", ")} — they&rsquo;ll be prompted at next sign-in.
            </Row>
          )}
          {mfaOptional.length > 0 && (
            <Row tone="neutral" count={mfaOptional.length} label="Two-factor waived">
              {mfaOptional.map((u: AuthUser) => u.name).join(", ")} — test/demo accounts exempt from the
              two-factor requirement.{" "}
              <Link className="text-ink-dim underline decoration-line hover:text-signal" to="/admin/users">
                Review in Users
              </Link>
              .
            </Row>
          )}
        </div>
      )}
    </Card>
  );
}
