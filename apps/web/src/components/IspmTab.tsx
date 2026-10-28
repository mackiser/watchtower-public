import { ispmPctTone, rate } from "@watchtower/shared";
import type { ClientDetail, IspmControl } from "@watchtower/shared";
import { useEffect, useState } from "react";
import { useReplaceIspm, useSetIspmNotApplicable } from "../api/hooks";
import { ConfirmDialog } from "./ConfirmDialog";
import { ControlsTable } from "./ControlsTable";
import { KpiGrid } from "./KpiGrid";
import { RateBars } from "./RateBars";
import { RingChart } from "./RingChart";
import { Button, Card } from "./ui";

const SEV_COLOR: Record<string, string> = { High: "var(--crit)", Medium: "var(--med)", Low: "var(--low)" };

export function IspmTab({ client }: { client: ClientDetail }) {
  const replace = useReplaceIspm(client.id);
  const goals = client.goals;
  const setNa = useSetIspmNotApplicable(client.id);
  const readOnly = !!client.archivedAt;
  const [pendingNa, setPendingNa] = useState(false);
  // Same instant-commit feedback pattern as the task board's drag/drop indicator.
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error" | null>(null);
  useEffect(() => {
    if (replace.isPending) {
      setSaveState("saving");
      return;
    }
    if (replace.isError) {
      setSaveState("error");
      return;
    }
    if (replace.isSuccess) {
      setSaveState("saved");
      const t = setTimeout(() => setSaveState(null), 1800);
      return () => clearTimeout(t);
    }
  }, [replace.isPending, replace.isSuccess, replace.isError]);

  const edit = readOnly ? undefined : { save: (next: IspmControl[]) => replace.mutate(next), busy: replace.isPending };

  const saveIndicator = saveState && (
    <span className={`board-save-state ${saveState}`}>
      <span className="dot" />
      {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Couldn't save that change"}
    </span>
  );

  if (client.ispmNotApplicable) {
    return (
      <div>
        <div className="scope">
          <span>{client.name} &middot; ISPM not applicable</span>
        </div>
        <Card>
          <p className="flex flex-wrap items-center gap-3 py-2 text-xs text-ink-faint">
            This client&rsquo;s tenant doesn&rsquo;t support Huntress-managed ISPM policies. ISPM is excluded from
            their security posture score.
            {!readOnly && (
              <Button size="sm" loading={setNa.isPending} onClick={() => setNa.mutate(false)}>
                ISPM applies to this client
              </Button>
            )}
          </p>
        </Card>
      </div>
    );
  }

  const rs = client.ispm;

  const naButton = !readOnly && (
    <Button size="sm" variant="danger" icon="close-outline" onClick={() => setPendingNa(true)}>
      Mark ISPM not applicable
    </Button>
  );
  const naDialog = pendingNa && (
    <ConfirmDialog
      title="Mark ISPM not applicable?"
      body={`This removes ${rs.length ? `all ${rs.length} of this client's controls` : "the control list"} and excludes ISPM from their security posture score. You can re-enable it later, but the controls will need to be re-added.`}
      confirmLabel="Mark not applicable"
      danger
      onConfirm={() => {
        setPendingNa(false);
        setNa.mutate(true);
      }}
      onCancel={() => setPendingNa(false)}
    />
  );

  if (!rs.length) {
    return (
      <div>
        <div className="scope">
          <span>{client.name} &middot; no ISPM controls yet</span>
          {saveIndicator}
          {naButton}
        </div>
        <ControlsTable controls={rs} edit={edit} />
        {naDialog}
      </div>
    );
  }

  const r = rate(rs);
  const highGaps = rs.filter((x) => !x.compliant && x.severity === "High").length;
  const categories = new Map<string, typeof rs>();
  rs.forEach((c) => {
    if (!categories.has(c.category)) categories.set(c.category, []);
    categories.get(c.category)!.push(c);
  });
  const worst = [...categories.entries()].map(([k, v]) => [k, rate(v).pct] as const).sort((a, b) => a[1] - b[1])[0];
  const tone = ispmPctTone(r.pct, goals);

  const cards = [
    { label: "Overall compliance", value: `${r.pct}%`, meta: `${r.pass} of ${r.total} controls · target ${goals.ispmTargetPct}%`, accent: `var(--${tone})` },
    { label: "High-severity gaps", value: highGaps, meta: "non-compliant · high", accent: "var(--crit)" },
    { label: "Controls not met", value: r.fail, meta: `across ${categories.size} categories`, accent: "var(--fail)" },
    { label: "Weakest category", value: worst ? `${worst[1]}%` : "—", meta: worst ? worst[0] : "—", accent: "var(--signal)" },
  ];

  return (
    <div>
      <div className="scope">
        <span>
          {client.name} &middot; {rs.length} controls assessed
        </span>
        {saveIndicator}
        {naButton}
      </div>
      <KpiGrid cards={cards} />
      <div className="mb-6 grid gap-6 min-[900px]:grid-cols-2">
        <Card title="Overall posture" hint="compliant vs not">
          <div className="flex flex-wrap items-center gap-8">
            <RingChart
              variant="donut"
              fraction={r.total ? r.pass / r.total : 0}
              color={`var(--${tone})`}
              centerValue={`${r.pct}%`}
              centerLabel="compliant"
            />
            <div className="flex min-w-[180px] flex-1 flex-col gap-3">
              <div className="flex items-baseline gap-2.5">
                <span className="text-xl font-[650] text-pass tabular-nums">{r.pass}</span>
                <span className="text-2xs text-ink-dim">controls compliant</span>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-xl font-[650] text-fail tabular-nums">{r.fail}</span>
                <span className="text-2xs text-ink-dim">controls not compliant</span>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-xl font-[650] tabular-nums">{r.total}</span>
                <span className="text-2xs text-ink-dim">controls assessed</span>
              </div>
            </div>
          </div>
        </Card>
        <Card title="Severity of gaps" hint="non-compliant by severity">
          <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
            {(["High", "Medium", "Low"] as const).map((sev) => {
              const inSev = rs.filter((x) => x.severity === sev);
              const gaps = inSev.filter((x) => !x.compliant).length;
              const c = SEV_COLOR[sev];
              return (
                <div className="rounded-lg bg-surface-2 p-3.5 border-l-[3px]" key={sev} style={{ borderLeftColor: c }}>
                  <div className="font-mono text-3xs uppercase tracking-[1px] text-ink-faint">{sev}</div>
                  <div className="mt-1.5 text-2xl font-[650] tabular-nums" style={{ color: gaps ? c : "var(--ink-dim)" }}>
                    {gaps}
                  </div>
                  <div className="mt-0.5 text-2xs text-ink-dim">
                    {gaps} of {inSev.length} not met
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <div className="mb-6 grid gap-6 min-[900px]:grid-cols-2">
        <Card title="Compliance by category" hint="where to focus">
          <RateBars controls={rs} groupKey="category" goals={goals} />
        </Card>
        <Card title="Compliance by enforcement group" hint="maturity tier">
          <RateBars controls={rs} groupKey="group" goals={goals} />
        </Card>
      </div>
      <ControlsTable controls={rs} edit={edit} />
      {naDialog}
    </div>
  );
}
