// Display-only helpers ported from the original app's chart code (index.html:1249-1252 in
// legacy/index.html, see git history). Pure presentation, not business logic, so they live in
// the web app rather than packages/shared.
export function fmtShort(iso: string): string {
  // Date-only strings parse as LOCAL midnight, not UTC — `new Date("2026-07-01")` is UTC
  // midnight, which US timezones read back as Jun 30 (same bug fmtLongDate dodges below).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "2026-05-15" → "May 15th, 2026". Parses the parts directly — `new Date("2026-05-15")` is UTC
 *  midnight, which reads back as the previous day in US timezones. */
export function fmtLongDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const day = Number(m[3]);
  const month = new Date(year, Number(m[2]) - 1, 1).toLocaleDateString(undefined, { month: "long" });
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${month} ${day}${suffix}, ${year}`;
}

export function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / mag;
  let nf: number;
  if (f <= 1) nf = 1;
  else if (f <= 1.5) nf = 1.5;
  else if (f <= 2) nf = 2;
  else if (f <= 2.5) nf = 2.5;
  else if (f <= 3) nf = 3;
  else if (f <= 4) nf = 4;
  else if (f <= 5) nf = 5;
  else if (f <= 6) nf = 6;
  else if (f <= 8) nf = 8;
  else nf = 10;
  return nf * mag;
}

export function niceFloor(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / mag;
  let nf: number;
  if (f >= 8) nf = 8;
  else if (f >= 6) nf = 6;
  else if (f >= 5) nf = 5;
  else if (f >= 4) nf = 4;
  else if (f >= 3) nf = 3;
  else if (f >= 2.5) nf = 2.5;
  else if (f >= 2) nf = 2;
  else if (f >= 1.5) nf = 1.5;
  else nf = 1;
  return nf * mag;
}

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export function fmtCompact(v: number): string {
  return compact.format(Math.round(v));
}

/** Relative time for recency displays ("2h ago" in the users table); past ~30 days a plain
 *  local date reads better than "47d ago". */
export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
