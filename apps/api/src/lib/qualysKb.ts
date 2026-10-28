import { audit } from "./audit.js";
import { prisma } from "./prisma.js";
import { MAX_PAGES, parser, QUALYS_BASE, qualysGet } from "./qualysApi.js";

// Qualys KnowledgeBase — the human-readable half of a vulnerability (title, CVEs, and the
// diagnosis/consequence/solution write-up). The Host List Detection endpoint the daily sync uses
// returns none of this at any parameter setting, so it's a separate call against a separate
// endpoint, cached globally by QID.
//
// Deliberately its own module rather than more of qualysSync.ts: different endpoint, different
// cache, and — most importantly — a different failure posture. Nothing in here may fail a sync.

// The asset endpoints are pinned to 5.0 because 2.0 is EOS for those paths. The KnowledgeBase is
// documented at 2.0 and it is NOT safe to assume the same version applies, so it gets its own
// setting rather than reusing API_VERSION. Env-overridable so the answer is a config change.
const KB_API_VERSION = () => process.env.QUALYS_KB_API_VERSION || "2.0";

// QIDs per request. 200 × ~6 chars is ~1.4 KB of URL — far inside any limit, and it keeps this to
// one or two requests in the steady state without needing a POST path in qualysGet.
const BATCH_SIZE = 200;

// KB write-ups are near-immutable but Qualys does revise them. Re-fetching anything older than
// this folds the whole staleness policy into a filter that has to exist anyway.
const STALE_AFTER_MS = 90 * 86_400_000;

// How many of each client's vulnerabilities get KB metadata. The table shows 5; fetching 10 costs
// nothing extra (same batch) and means raising the display count later needs no re-sync.
const KB_PER_CLIENT = 10;

export interface KbEntry {
  qid: string;
  title: string;
  severity: number;
  category: string;
  patchable: boolean;
  cves: string;
  diagnosis: string;
  consequence: string;
  solution: string;
}

/**
 * Qualys ships DIAGNOSIS/CONSEQUENCE/SOLUTION as HTML. This flattens them to plain text at cache
 * time so only the stripped form is ever stored or rendered.
 *
 * That is a security decision, not a formatting one: the alternative is piping a third-party feed
 * into dangerouslySetInnerHTML (an HTML injection path into an authenticated app, for the sake of
 * some <p> tags) or adding a sanitiser dependency for one modal. Stripping removes the surface
 * instead of mitigating it.
 *
 * Lossy on purpose — list bullets become newlines and links survive as visible-but-unclickable
 * text. ponytail: good enough for a reference panel; if the formatting is ever genuinely missed,
 * store the raw HTML alongside and sanitise at render.
 */
export function stripQualysHtml(html: string): string {
  return (
    html
      // Block-ish tags become line breaks so paragraphs stay separated. `</li>` is deliberately
      // absent — the opening `<li>` below already starts the line, and handling both would put a
      // blank line between every bullet.
      .replace(/<\s*(br|\/p|\/div|\/tr|\/h\d)\s*\/?\s*>/gi, "\n")
      .replace(/<\s*li[^>]*>/gi, "\n• ")
      .replace(/<[^>]+>/g, "")
      // Entity decode last, so an escaped "&lt;p&gt;" in the source can't become a live tag.
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

const text = (v: unknown): string => (v == null ? "" : String(v));

/** Parse one page of KnowledgeBase XML → entries + next-page URL (same truncation idiom as the
 *  detection endpoint). Exported for unit testing against a captured fixture. */
export function parseKbXml(xml: string): { entries: KbEntry[]; nextUrl: string | null } {
  const doc = parser.parse(xml);
  const resp = doc?.KNOWLEDGE_BASE_VULN_LIST_OUTPUT?.RESPONSE;
  const rawVulns: any[] = resp?.VULN_LIST?.VULN ?? [];
  const entries: KbEntry[] = rawVulns.map((v) => {
    // CVE_LIST > CVE > ID. The parser's isArray predicate covers CVE, so a single-CVE vuln still
    // arrives as an array rather than a bare object.
    const cveList: any[] = v?.CVE_LIST?.CVE ?? [];
    return {
      qid: text(v?.QID),
      title: text(v?.TITLE).trim(),
      severity: Number(v?.SEVERITY_LEVEL) || 0,
      category: text(v?.CATEGORY).trim(),
      // Qualys sends 0/1 here, which is truthy-as-a-string either way — compare explicitly.
      patchable: text(v?.PATCHABLE) === "1",
      cves: cveList
        .map((c) => text(c?.ID).trim())
        .filter(Boolean)
        .join(","),
      diagnosis: stripQualysHtml(text(v?.DIAGNOSIS)),
      consequence: stripQualysHtml(text(v?.CONSEQUENCE)),
      solution: stripQualysHtml(text(v?.SOLUTION)),
    };
  });
  return { entries, nextUrl: resp?.WARNING?.URL ? String(resp.WARNING.URL) : null };
}

async function fetchKbBatch(qids: string[]): Promise<KbEntry[]> {
  let url =
    `${QUALYS_BASE()}/api/${KB_API_VERSION()}/fo/knowledge_base/vuln/?action=list` +
    `&ids=${encodeURIComponent(qids.join(","))}&details=All`;
  const all: KbEntry[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { entries, nextUrl } = parseKbXml(await qualysGet(url));
    all.push(...entries);
    if (!nextUrl) return all;
    url = nextUrl;
  }
  throw new Error(`KnowledgeBase pagination exceeded ${MAX_PAGES} pages.`);
}

/** Split into fixed-size batches. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Top up the KB cache for the vulnerabilities that actually surface in the UI.
 *
 * Runs ONCE per sync run rather than per client: the QID sets overlap heavily (every client has
 * the same Windows and Chrome findings), so deduping across all clients turns 43 potential
 * requests into one or two, and leaves exactly one failure site to reason about.
 *
 * Returns a count rather than throwing — the caller has already committed the detection counts,
 * which are useful on their own, and a KB outage must not mark any client's sync failed.
 */
export async function refreshKbEntries(): Promise<{ fetched: number; requested: number }> {
  // No per-group LIMIT in Prisma, so pull the (small) count table and rank in memory.
  const rows = await prisma.qualysVuln.findMany({
    select: { clientId: true, qid: true, assetCount: true, severity: true },
  });
  const byClient = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byClient.get(r.clientId) ?? [];
    list.push(r);
    byClient.set(r.clientId, list);
  }
  const wanted = new Set<string>();
  for (const list of byClient.values()) {
    list
      .sort((a, b) => b.assetCount - a.assetCount || b.severity - a.severity || a.qid.localeCompare(b.qid))
      .slice(0, KB_PER_CLIENT)
      .forEach((r) => wanted.add(r.qid));
  }
  if (!wanted.size) return { fetched: 0, requested: 0 };

  const cached = await prisma.qualysKbEntry.findMany({
    where: { fromQualys: true },
    select: { qid: true, fetchedAt: true },
  });
  const freshUntil = Date.now() - STALE_AFTER_MS;
  const cachedAt = new Map(cached.map((e) => [e.qid, e.fetchedAt.getTime()]));
  const missing = [...wanted].filter((qid) => (cachedAt.get(qid) ?? 0) < freshUntil);
  if (!missing.length) return { fetched: 0, requested: 0 };

  let fetched = 0;
  // Each batch is written as it arrives rather than in one transaction: a batch that fails leaves
  // the successful ones cached and its own QIDs to be retried tomorrow. Self-healing.
  for (const batch of chunk(missing, BATCH_SIZE)) {
    const entries = await fetchKbBatch(batch);
    for (const e of entries) {
      if (!e.qid) continue;
      // `notes` is deliberately absent from both branches: it is Watchtower's, and a real
      // KnowledgeBase entry arriving must not wipe a hand-written remediation note. A hand-typed
      // title, by contrast, is correctly replaced by Qualys's official one.
      await prisma.qualysKbEntry.upsert({
        where: { qid: e.qid },
        update: { ...e, fromQualys: true },
        create: { ...e, fromQualys: true },
      });
      fetched++;
    }
  }
  return { fetched, requested: missing.length };
}

/** Wrapper used by the sync: never throws, audits its own failure. */
export async function refreshKbEntriesSafely(): Promise<void> {
  try {
    const { fetched, requested } = await refreshKbEntries();
    if (requested) audit("qualys.kb_fetch", { fetched, requested });
  } catch (err) {
    // A KB failure is not a sync failure. The detection counts are already committed and the
    // table renders with bare QIDs until this succeeds.
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    audit("qualys.kb_error", { error: message });
  }
}
