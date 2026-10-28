import { computeClientScores, DEFAULT_CLIENT_GOALS, GOAL_LIMITS, gradeTone } from "@watchtower/shared";
import type { ClientDetail, ClientGoals } from "@watchtower/shared";
import { useState } from "react";
import { useSetClientGoals } from "../api/hooks";
import { Button, Field, Input, Modal } from "./ui";

function toneVar(score: number | null): string {
  const tone = gradeTone(score);
  return tone === "neutral" ? "var(--ink-faint)" : `var(--${tone})`;
}

/**
 * Per-client posture goals (admin only).
 *
 * The score preview is computed in the browser rather than round-tripping a what-if endpoint:
 * ClientDetail already carries the full scan series and control set, and computeClientScores is
 * the same pure function the server scores with — so the number shown here is the number that
 * will be saved, with no second implementation to drift.
 */
export function ClientGoalsModal({ client, onClose }: { client: ClientDetail; onClose: () => void }) {
  const save = useSetClientGoals(client.id);
  const [draft, setDraft] = useState<ClientGoals>(client.goals);

  const L = GOAL_LIMITS;
  const set = (patch: Partial<ClientGoals>) => setDraft({ ...draft, ...patch });

  const valid =
    Number.isFinite(draft.vulnTargetPerAsset) &&
    draft.vulnTargetPerAsset >= L.vulnTargetPerAsset.min &&
    draft.vulnTargetPerAsset <= L.vulnTargetPerAsset.max &&
    Number.isFinite(draft.ispmTargetPct) &&
    draft.ispmTargetPct >= L.ispmTargetPct.min &&
    draft.ispmTargetPct <= L.ispmTargetPct.max;

  const dirty =
    draft.vulnTargetPerAsset !== client.goals.vulnTargetPerAsset ||
    draft.ispmTargetPct !== client.goals.ispmTargetPct;

  // Same inputs, two sets of goals — the live before/after for this client alone.
  const current = client.compositeScore;
  const preview = valid
    ? computeClientScores(client.qualys, client.qSeries, client.ispm, client.ispmNotApplicable, draft)
    : null;
  const proposed = preview?.compositeScore ?? null;
  const delta = current != null && proposed != null ? Math.round(proposed) - Math.round(current) : null;

  return (
    <Modal
      title={`Posture goals — ${client.name}`}
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          {client.customGoals && (
            <Button
              onClick={() => setDraft(DEFAULT_CLIENT_GOALS)}
              title={`Back to the shared defaults (≤${DEFAULT_CLIENT_GOALS.vulnTargetPerAsset} and ${DEFAULT_CLIENT_GOALS.ispmTargetPct}%)`}
            >
              Use defaults
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!dirty || !valid}
            loading={save.isPending}
            onClick={() => {
              // Matching a default exactly clears the override rather than storing a copy of it,
              // so this client keeps following the shared default if it ever moves.
              save.mutate(
                {
                  vulnTargetPerAsset:
                    draft.vulnTargetPerAsset === DEFAULT_CLIENT_GOALS.vulnTargetPerAsset ? null : draft.vulnTargetPerAsset,
                  ispmTargetPct:
                    draft.ispmTargetPct === DEFAULT_CLIENT_GOALS.ispmTargetPct ? null : draft.ispmTargetPct,
                },
                { onSuccess: onClose }
              );
            }}
          >
            Save goals
          </Button>
        </>
      }
    >
      <p className="mb-4 text-xs leading-relaxed text-ink-dim">
        The targets this client is scored against. Hitting a target scores 85 out of 100 on that half
        of the blend, so a realistic goal for the engagement gives a fairer grade than one number for
        every client. Scan data isn&rsquo;t touched — changing these is reversible.
      </p>

      <Field
        label="Vulnerability goal — avg active vulns per asset"
        hint={`Default ${DEFAULT_CLIENT_GOALS.vulnTargetPerAsset}. Lower is stricter.`}
      >
        <Input
          type="number"
          min={L.vulnTargetPerAsset.min}
          max={L.vulnTargetPerAsset.max}
          step={0.5}
          value={draft.vulnTargetPerAsset}
          aria-label="Target average vulnerabilities per asset"
          onChange={(e) => set({ vulnTargetPerAsset: Number(e.target.value) })}
        />
      </Field>

      <Field
        label="ISPM compliance goal (%)"
        hint={`Default ${DEFAULT_CLIENT_GOALS.ispmTargetPct}%. Must stay below 100 — full compliance is the top of the scale, not the anchor.`}
      >
        <Input
          type="number"
          min={L.ispmTargetPct.min}
          max={L.ispmTargetPct.max}
          step={1}
          value={draft.ispmTargetPct}
          aria-label="Target ISPM weighted compliance percent"
          onChange={(e) => set({ ispmTargetPct: Number(e.target.value) })}
        />
      </Field>

      {/* Live what-if for this client — the whole point of editing goals here rather than in a
          settings page far from the score they affect. */}
      <div className="mt-1 rounded border border-line-soft bg-surface-2 px-3.5 py-3">
        <div className="mb-1.5 font-mono text-3xs uppercase tracking-[.5px] text-ink-faint">
          {dirty ? "Score with these goals" : "Current score"}
        </div>
        {current == null ? (
          <p className="text-2xs text-ink-faint">No Qualys or ISPM data loaded yet, so there&rsquo;s no score to preview.</p>
        ) : !valid ? (
          <p role="alert" className="font-mono text-2xs text-fail">
            Enter a vulnerability goal of {L.vulnTargetPerAsset.min}+ and an ISPM goal between{" "}
            {L.ispmTargetPct.min} and {L.ispmTargetPct.max}%.
          </p>
        ) : (
          <div className="flex items-baseline gap-2.5 font-mono text-sm tabular-nums">
            <span className="text-ink-dim">
              {Math.round(current)} <span className="text-ink-faint">{client.grade}</span>
            </span>
            <span className="text-ink-faint">&rarr;</span>
            <b style={{ color: toneVar(proposed) }}>
              {proposed == null ? "—" : Math.round(proposed)} {preview?.grade}
            </b>
            {delta != null && delta !== 0 && (
              <span className="text-2xs" style={{ color: delta > 0 ? "var(--pass)" : "var(--fail)" }}>
                ({delta > 0 ? "+" : ""}
                {delta})
              </span>
            )}
          </div>
        )}
      </div>

      {save.isError && (
        <p role="alert" className="mt-3 font-mono text-2xs text-fail">
          {save.error instanceof Error ? save.error.message : "Couldn't save these goals."}
        </p>
      )}
    </Modal>
  );
}
