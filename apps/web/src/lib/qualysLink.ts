import type { PillTone } from "../components/ui";

// A task's `linkRef` for linkType "qualys" carries one of two things: a severity bucket name
// ("Critical"), which is what the task editor's dropdown has always offered, or a bare QID
// ("92429") when the task was created from the Top vulnerabilities table.
//
// They're told apart by shape rather than by a new TaskLinkType member. Adding one would cost a
// migration, two entries in serialize.ts's enum maps, the route's enum list, the wire-type union,
// a dropdown option and a fourth board-filter option — to distinguish two things a regex already
// separates. Every existing "Qualys-linked" filter keeps working for both kinds unchanged.
//
// ponytail: all-digits means QID. The ceiling is a severity bucket literally named "5"; there
// isn't one, and there won't be — the four names are fixed in the editor.
export const isQid = (ref: string): boolean => /^\d+$/.test(ref);

/** How a qualys link reads on a task card and in the editor's dropdown. */
export const qualysLinkLabel = (ref: string): string =>
  !ref ? "Qualys" : isQid(ref) ? `QID ${ref}` : `${ref} severity`;

// Qualys severity levels are 1-5. This mirrors SEVERITY_BUCKET in the API's qualysSync.ts — the
// same 5/4/3/2-1 split the snapshot counts use, so a row's pill agrees with the severity charts
// above it. Kept as words, not just colour: DESIGN.md requires a status colour always be paired
// with its label.
const SEVERITY: Record<number, { tone: PillTone; label: string }> = {
  5: { tone: "crit", label: "Critical" },
  4: { tone: "high", label: "High" },
  3: { tone: "med", label: "Medium" },
  2: { tone: "low", label: "Low" },
  1: { tone: "low", label: "Low" },
};

export const severityMeta = (level: number): { tone: PillTone; label: string } =>
  SEVERITY[level] ?? { tone: "neutral", label: `Level ${level}` };
