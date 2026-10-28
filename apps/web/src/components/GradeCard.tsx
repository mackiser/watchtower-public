import { GRADE_CUTOFFS, gradeTone, ispmWeightedCompliancePct } from "@watchtower/shared";
import type { ClientDetail, ClientGoals } from "@watchtower/shared";
import { useState } from "react";
import { Modal } from "./ui";

export function GradeCard({ client }: { client: ClientDetail }) {
  const { compositeScore: score, grade, vulnHealth: vh, ispmHealth: ih, ispmNotApplicable } = client;
  const tone = gradeTone(score);
  const accent = tone === "neutral" ? "var(--ink-faint)" : `var(--${tone})`;
  const [explaining, setExplaining] = useState(false);
  // This client's own goals (Goals button below), so the explainer quotes the targets the score
  // was actually computed against rather than the shared defaults.
  const VULN_TARGET_PER_ASSET = client.goals.vulnTargetPerAsset;
  const ISPM_TARGET_PCT = client.goals.ispmTargetPct;

  let why: string;
  if (score == null) {
    why = "Load a Qualys and/or ISPM sheet to calculate a score.";
  } else if (vh != null && ih != null) {
    const weaker = vh < ih ? "average vulnerabilities per asset" : "ISPM compliance gaps";
    why = `Blends progress toward our targets — ≤${VULN_TARGET_PER_ASSET} avg vulns/asset and ${ISPM_TARGET_PCT}% ISPM compliance. Currently held back most by ${weaker}.`;
  } else if (vh != null) {
    why = ispmNotApplicable
      ? `Based on progress toward our ≤${VULN_TARGET_PER_ASSET} avg-vulns/asset target only — ISPM isn't applicable for this client's tenant.`
      : `Based on progress toward our ≤${VULN_TARGET_PER_ASSET} avg-vulns/asset target only — no ISPM data loaded for this client.`;
  } else {
    why = `Based on progress toward our ${ISPM_TARGET_PCT}% ISPM compliance target only — no Qualys data loaded for this client.`;
  }

  return (
    <div className="grade-card" style={{ ["--grade-accent" as string]: accent }}>
      <div className="grade-letter" style={{ color: accent }}>
        {grade}
      </div>
      <div className="grade-meta">
        {/* label → number, top-down like the KPI tiles */}
        <div className="grade-label">Security posture score</div>
        <div className="grade-score">{score == null ? "No data yet" : `${Math.round(score)} / 100`}</div>
        <div className="grade-why">{why}</div>
        {score != null && (
          <button type="button" className="grade-explain-link" onClick={() => setExplaining(true)}>
            How is this scored?
          </button>
        )}
      </div>
      {explaining && <ScoreExplainerModal client={client} onClose={() => setExplaining(false)} />}
    </div>
  );
}

/** One row of the blend table: label, the client's number, and its weight in the composite. */
function BlendRow({ label, value, weight, note }: { label: string; value: string; weight: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line-soft py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-ink">{label}</div>
        {note && <div className="text-2xs text-ink-faint">{note}</div>}
      </div>
      <div className="whitespace-nowrap font-mono text-2xs text-ink-dim">
        <b className="text-sm text-ink tabular-nums">{value}</b> {weight}
      </div>
    </div>
  );
}

/**
 * Makes the composite formula legible: this client's actual inputs, its own posture goals (the
 * same values the server scored with — see the Goals control on this page), the fixed 55/45
 * blend, and the grade scale with the current grade highlighted.
 */
function ScoreExplainerModal({ client, onClose }: { client: ClientDetail; onClose: () => void }) {
  const { compositeScore: score, grade, vulnHealth: vh, ispmHealth: ih, ispmNotApplicable, avgVulnsPerAsset } = client;
  const weightedPct = ispmNotApplicable ? null : ispmWeightedCompliancePct(client.ispm);
  const both = vh != null && ih != null;
  const scans = client.qSeries.filter((s) => s.assets).length;
  const VULN_TARGET_PER_ASSET = client.goals.vulnTargetPerAsset;
  const ISPM_TARGET_PCT = client.goals.ispmTargetPct;

  return (
    <Modal title="How the score works" onClose={onClose} maxWidth={520}>
      <div className="mb-4">
        {both ? (
          <>
            <BlendRow
              label="Qualys health"
              note={
                avgVulnsPerAsset != null
                  ? `${avgVulnsPerAsset.toFixed(1)} active vulns/asset · target ≤${VULN_TARGET_PER_ASSET}`
                  : undefined
              }
              value={`${Math.round(vh)}/100`}
              weight="× 55%"
            />
            <BlendRow
              label="ISPM health"
              note={weightedPct != null ? `${Math.round(weightedPct)}% weighted compliance · target ${ISPM_TARGET_PCT}%` : undefined}
              value={`${Math.round(ih)}/100`}
              weight="× 45%"
            />
            <BlendRow label="Security posture score" value={`${Math.round(score!)}/100`} weight={`→ ${grade}`} />
          </>
        ) : (
          <BlendRow
            label={vh != null ? "Qualys health" : "ISPM health"}
            note={
              vh != null
                ? `${avgVulnsPerAsset?.toFixed(1) ?? "—"} active vulns/asset · target ≤${VULN_TARGET_PER_ASSET} · counts alone (${ispmNotApplicable ? "ISPM not applicable" : "no ISPM data"})`
                : `${weightedPct != null ? Math.round(weightedPct) : "—"}% weighted compliance · target ${ISPM_TARGET_PCT}% · counts alone (no Qualys data)`
            }
            value={`${Math.round((vh ?? ih)!)}/100`}
            weight={`→ ${grade}`}
          />
        )}
      </div>

      <div className="mb-4 text-2xs leading-relaxed text-ink-dim">
        <p className="mb-2">
          <b className="text-ink">Qualys health</b> anchors at the target: ≤{VULN_TARGET_PER_ASSET} active
          vulns/asset scores 85, zero scores 100, and health decays toward a floor as the backlog grows.
          {scans >= 2
            ? " 30% of it comes from the trend across loaded scans — a shrinking backlog is rewarded before it reaches target."
            : " Once a second scan lands, 30% of it will come from the trend — a shrinking backlog is rewarded before it reaches target."}
        </p>
        <p>
          <b className="text-ink">ISPM health</b> uses severity-weighted compliance (High ×5, Medium ×2, Low ×1),
          anchored the same way: {ISPM_TARGET_PCT}% weighted compliance scores 85, climbing to 100 at full
          compliance.
        </p>
      </div>

      <div className="font-mono text-3xs uppercase tracking-[.5px] text-ink-faint">Grade scale</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {GRADE_CUTOFFS.map((c) => (
          <span
            key={c.grade}
            className={`rounded-md px-2 py-1 font-mono text-2xs tabular-nums ${
              c.grade === grade ? "bg-signal-soft font-semibold text-signal" : "bg-surface-2 text-ink-dim"
            }`}
            title={c.min > 0 ? `${c.grade}: ${c.min}+` : `${c.grade}: below 35`}
          >
            {c.grade} <span className="text-ink-faint">{c.min > 0 ? `≥${c.min}` : "<35"}</span>
          </span>
        ))}
      </div>
    </Modal>
  );
}
