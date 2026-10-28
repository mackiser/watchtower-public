import { pctChange, rate } from "@watchtower/shared";
import type { ClientDetail } from "@watchtower/shared";
import { fmtLongDate } from "../lib/format";
import { Icon } from "./Icon";

/** Small colored badge icon for a narrative line — up/down direction, or a flat/checkmark state. */
function NIcon({ tone }: { tone: "up" | "down" | "flat" | "check" }) {
  if (tone === "up") return <Icon name="arrow-down-outline" />; // "up" = improving, shown as a down arrow (the metric is going down)
  if (tone === "down") return <Icon name="arrow-up-outline" />; // metric is rising, which is bad here
  if (tone === "check") return <Icon name="checkmark-outline" />;
  return <Icon name="ellipse" />;
}

interface NarrativeItem {
  key: string;
  /** nicon background tone (color register) */
  cls: "up" | "down" | "flat";
  icon: "up" | "down" | "flat" | "check";
  /** sans takeaway, ≤6 words */
  headline: string;
  /** mono data line; omitted when the headline says it all */
  detail?: string;
}

/** "Since engagement start" strip — the wall-of-sentences renderNarrative() port, restructured
 *  into scannable headline + mono-data items. */
export function NarrativeCard({ client }: { client: ClientDetail }) {
  const dated = client.qSeries.filter((r) => r.date);
  const series = dated.length ? dated : client.qSeries;
  const ispm = client.ispm;

  let title = "Since engagement start";
  const items: NarrativeItem[] = [];

  if (series.length < 2) {
    if (series.length === 1) {
      title = "Baseline established";
      const d = series[0]!.date;
      items.push({
        key: "baseline",
        cls: "flat",
        icon: "flat",
        headline: "Baseline captured",
        detail: `${d ? fmtLongDate(d) : "undated"} · trends appear after the next scan`,
      });
    } else {
      items.push({ key: "none", cls: "flat", icon: "flat", headline: "No scan data loaded yet" });
    }
  } else {
    const first = series[0]!;
    const last = series[series.length - 1]!;
    const since = first.date ? ` · since ${fmtLongDate(first.date)}` : "";

    const totPct = pctChange(first.active, last.active);
    if (totPct != null) {
      const good = totPct < 0;
      items.push({
        key: "total",
        cls: good ? "up" : "down",
        icon: good ? "up" : "down",
        headline: `Active vulnerabilities ${good ? "down" : "up"} ${Math.abs(totPct).toFixed(0)}%`,
        detail: `${first.active.toLocaleString()} → ${last.active.toLocaleString()}${since}`,
      });
    }

    const chFirst = first.crit + first.high;
    const chLast = last.crit + last.high;
    const chPct = pctChange(chFirst, chLast);
    if (chPct != null && chFirst > 0) {
      const good = chPct < 0;
      items.push({
        key: "ch",
        cls: good ? "up" : "down",
        icon: good ? "up" : "down",
        headline: `Critical & high findings ${good ? "down" : "up"} ${Math.abs(chPct).toFixed(0)}%`,
        detail: `${chFirst.toLocaleString()} → ${chLast.toLocaleString()}`,
      });
    } else if (chLast === 0 && chFirst === 0) {
      items.push({
        key: "ch0",
        cls: "up",
        icon: "check",
        headline: "Zero critical or high findings",
        detail: "throughout the engagement",
      });
    }

    const fixedTotal = last.fix030 + last.fix3060 + last.fix6090;
    if (fixedTotal > 0) {
      items.push({
        key: "fixed",
        cls: "up",
        icon: "check",
        headline: `${fixedTotal.toLocaleString()} detections remediated`,
        detail: "trailing 90 days · as of latest scan",
      });
    }

    if (first.reboot !== last.reboot) {
      const good = last.reboot < first.reboot;
      items.push({
        key: "reboot",
        cls: good ? "up" : "down",
        icon: good ? "up" : "down",
        headline: `Assets pending reboot ${good ? "down" : "up"}`,
        detail: `${first.reboot} → ${last.reboot}`,
      });
    }

    if (!items.length) {
      items.push({
        key: "stable",
        cls: "flat",
        icon: "flat",
        headline: "Metrics stable — no significant change",
        detail: first.date ? `since ${fmtLongDate(first.date)}` : undefined,
      });
    }
  }

  if (ispm.length) {
    const r = rate(ispm);
    const failingHigh = ispm.filter((x) => !x.compliant && x.severity === "High").length;
    const totalHigh = ispm.filter((x) => x.severity === "High").length;
    if (totalHigh > 0) {
      items.push({
        key: "ispm",
        cls: failingHigh === 0 ? "up" : "flat",
        icon: failingHigh === 0 ? "check" : "flat",
        headline: `${totalHigh - failingHigh} of ${totalHigh} high-severity ISPM controls compliant`,
        detail: `${r.pct}% overall compliance`,
      });
    }
  }

  return (
    <div className="narrative-card">
      <div className="narrative-title">{title}</div>
      <ul className="narrative-list">
        {items.map((item) => (
          <li key={item.key}>
            <span className={`nicon ${item.cls}`}>
              <NIcon tone={item.icon} />
            </span>
            <div>
              <div className="narrative-headline">{item.headline}</div>
              {item.detail && <div className="narrative-detail">{item.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
