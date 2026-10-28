import { describe, expect, it } from "vitest";
import { serializeTopVulns } from "./serialize.js";

// The KB-miss path is the behaviour that keeps the Top vulnerabilities table useful when the
// KnowledgeBase lookup fails or hasn't run for a new QID: counts still render, against a bare
// QID. It can't be exercised through the UI here, so it gets a test.
const vuln = (qid: string, over: Partial<{ severity: number; assetCount: number; detectionCount: number }> = {}) => ({
  clientId: "c1",
  qid,
  severity: 5,
  assetCount: 10,
  detectionCount: 12,
  ...over,
});

const kb = (
  qid: string,
  over: Partial<{ title: string; cves: string; patchable: boolean; notes: string; fromQualys: boolean }> = {}
) => ({
  qid,
  title: `Title ${qid}`,
  severity: 5,
  category: "Windows",
  patchable: true,
  cves: "",
  diagnosis: "",
  consequence: "",
  solution: "",
  notes: "",
  fromQualys: true,
  ...over,
  fetchedAt: new Date(),
});

describe("serializeTopVulns", () => {
  it("joins counts to their cached KnowledgeBase entry", () => {
    const rows = serializeTopVulns([vuln("92429")], [kb("92429", { cves: "CVE-2025-1,CVE-2025-2" })]);
    expect(rows[0]).toEqual({
      qid: "92429",
      severity: 5,
      assetCount: 10,
      detectionCount: 12,
      title: "Title 92429",
      patchable: true,
      cves: ["CVE-2025-1", "CVE-2025-2"],
    });
  });

  it("keeps the row with a null title when no KB entry is cached", () => {
    const rows = serializeTopVulns([vuln("99999", { assetCount: 7 })], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qid: "99999", title: null, patchable: null, cves: [], assetCount: 7 });
  });

  it("handles a mixed set — some cached, some not — without dropping rows or misaligning them", () => {
    const rows = serializeTopVulns([vuln("1"), vuln("2"), vuln("3")], [kb("2")]);
    expect(rows.map((r) => r.title)).toEqual([null, "Title 2", null]);
  });

  it("treats an empty CVE string as no CVEs, not as one blank CVE", () => {
    expect(serializeTopVulns([vuln("1")], [kb("1", { cves: "" })])[0]!.cves).toEqual([]);
    // Trailing/duplicated separators shouldn't produce empty entries either.
    expect(serializeTopVulns([vuln("1")], [kb("1", { cves: "CVE-1,,CVE-2," })])[0]!.cves).toEqual(["CVE-1", "CVE-2"]);
  });

  // The KnowledgeBase API isn't licensed on this subscription, so most entries are hand-authored:
  // a title with no Qualys write-up behind it still has to reach the table.
  it("shows a hand-authored title the same as a Qualys-sourced one", () => {
    const manual = kb("92429", { title: "EOL .NET Detected", fromQualys: false });
    const rows = serializeTopVulns([vuln("92429")], [manual]);
    expect(rows[0]!.title).toBe("EOL .NET Detected");
  });

  it("preserves the order it was given (the query already ranked them)", () => {
    const rows = serializeTopVulns([vuln("a", { assetCount: 9 }), vuln("b", { assetCount: 3 })], []);
    expect(rows.map((r) => r.qid)).toEqual(["a", "b"]);
  });
});
