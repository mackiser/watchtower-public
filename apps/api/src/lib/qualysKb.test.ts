import { describe, expect, it } from "vitest";
import { parseKbXml, stripQualysHtml } from "./qualysKb.js";

// Shaped from the documented KnowledgeBase response. The exact tag names are confirmed against a
// live call before this ships — see the spike note in the plan. Two VULNs, one with several CVEs
// and one with none, because the single-element collapse is the likeliest silent bug here.
const kbPage = `<?xml version="1.0" encoding="UTF-8" ?>
<KNOWLEDGE_BASE_VULN_LIST_OUTPUT>
  <RESPONSE>
    <DATETIME>2026-08-07T12:00:00Z</DATETIME>
    <VULN_LIST>
      <VULN>
        <QID>92429</QID>
        <VULN_TYPE>Vulnerability</VULN_TYPE>
        <SEVERITY_LEVEL>5</SEVERITY_LEVEL>
        <TITLE><![CDATA[Windows User Profile Service Elevation of Privilege Vulnerability]]></TITLE>
        <CATEGORY>Windows</CATEGORY>
        <PATCHABLE>1</PATCHABLE>
        <DIAGNOSIS><![CDATA[<P>A privilege escalation flaw exists.</P><P>Affected: Windows 10, 11.</P>]]></DIAGNOSIS>
        <CONSEQUENCE><![CDATA[Successful exploitation grants SYSTEM.]]></CONSEQUENCE>
        <SOLUTION><![CDATA[<P>Apply the vendor patch:</P><UL><LI>KB5034441</LI><LI>KB5034442</LI></UL>]]></SOLUTION>
        <CVE_LIST>
          <CVE><ID>CVE-2025-41246</ID><URL>https://example.test/1</URL></CVE>
          <CVE><ID>CVE-2025-41244</ID><URL>https://example.test/2</URL></CVE>
        </CVE_LIST>
      </VULN>
      <VULN>
        <QID>106247</QID>
        <SEVERITY_LEVEL>5</SEVERITY_LEVEL>
        <TITLE>EOL/Obsolete Software: Microsoft .Net Version 6 Detected</TITLE>
        <CATEGORY>Local</CATEGORY>
        <PATCHABLE>0</PATCHABLE>
        <DIAGNOSIS>Unsupported runtime detected.</DIAGNOSIS>
        <CONSEQUENCE></CONSEQUENCE>
        <SOLUTION>Upgrade to a supported release.</SOLUTION>
      </VULN>
    </VULN_LIST>
  </RESPONSE>
</KNOWLEDGE_BASE_VULN_LIST_OUTPUT>`;

// The single-result case: without VULN/CVE in the parser's isArray predicate this parses to a
// bare object and the map() below would throw. This is the regression guard for that.
const kbSingle = `<?xml version="1.0" encoding="UTF-8" ?>
<KNOWLEDGE_BASE_VULN_LIST_OUTPUT>
  <RESPONSE>
    <VULN_LIST>
      <VULN>
        <QID>378332</QID>
        <SEVERITY_LEVEL>4</SEVERITY_LEVEL>
        <TITLE>Microsoft WinVerifyTrust Signature Validation Vulnerability</TITLE>
        <CATEGORY>Windows</CATEGORY>
        <PATCHABLE>1</PATCHABLE>
        <DIAGNOSIS>Signature validation flaw.</DIAGNOSIS>
        <CONSEQUENCE>Code execution.</CONSEQUENCE>
        <SOLUTION>Apply the registry fix.</SOLUTION>
        <CVE_LIST><CVE><ID>CVE-2013-3900</ID></CVE></CVE_LIST>
      </VULN>
    </VULN_LIST>
  </RESPONSE>
</KNOWLEDGE_BASE_VULN_LIST_OUTPUT>`;

describe("parseKbXml", () => {
  it("extracts entries, joins CVEs, and coerces PATCHABLE", () => {
    const { entries, nextUrl } = parseKbXml(kbPage);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      qid: "92429",
      title: "Windows User Profile Service Elevation of Privilege Vulnerability",
      severity: 5,
      category: "Windows",
      patchable: true,
      cves: "CVE-2025-41246,CVE-2025-41244",
    });
    // PATCHABLE "0" is a non-empty string and would be truthy under a loose check.
    expect(entries[1]!.patchable).toBe(false);
    expect(entries[1]!.cves).toBe("");
    expect(nextUrl).toBeNull();
  });

  it("handles a single VULN with a single CVE without collapsing to an object", () => {
    const { entries } = parseKbXml(kbSingle);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.cves).toBe("CVE-2013-3900");
  });

  it("returns an empty list for a response with no vulns", () => {
    const { entries } = parseKbXml(
      `<?xml version="1.0"?><KNOWLEDGE_BASE_VULN_LIST_OUTPUT><RESPONSE></RESPONSE></KNOWLEDGE_BASE_VULN_LIST_OUTPUT>`
    );
    expect(entries).toEqual([]);
  });

  it("stores the write-up as plain text, not markup", () => {
    const { entries } = parseKbXml(kbPage);
    expect(entries[0]!.solution).toContain("KB5034441");
    expect(entries[0]!.solution).not.toContain("<");
    expect(entries[0]!.diagnosis).toBe("A privilege escalation flaw exists.\nAffected: Windows 10, 11.");
  });
});

describe("stripQualysHtml", () => {
  it("turns block tags into line breaks and bullets into list markers", () => {
    expect(stripQualysHtml("<P>One</P><P>Two</P>")).toBe("One\nTwo");
    expect(stripQualysHtml("<UL><LI>A</LI><LI>B</LI></UL>")).toBe("• A\n• B");
    expect(stripQualysHtml("Line<BR>Break")).toBe("Line\nBreak");
  });

  it("decodes entities after stripping, so escaped markup can't become live markup", () => {
    // If entities were decoded first, this would turn into a real <script> tag before the tag
    // strip ran — which is the whole reason for the ordering.
    expect(stripQualysHtml("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe("<script>alert(1)</script>");
    expect(stripQualysHtml("<P>Tom &amp; Jerry&nbsp;say &quot;hi&quot;</P>")).toBe('Tom & Jerry say "hi"');
  });

  it("removes every tag, including attributes and links", () => {
    expect(stripQualysHtml('<A HREF="http://x.test">click</A>')).toBe("click");
    expect(stripQualysHtml('<DIV CLASS="a"><SPAN>x</SPAN></DIV>')).toBe("x");
  });

  it("collapses runs of blank lines and trims", () => {
    expect(stripQualysHtml("<P>A</P><P></P><P></P><P>B</P>")).toBe("A\n\nB");
    expect(stripQualysHtml("   <P>A</P>   ")).toBe("A");
  });

  it("is a no-op on plain text", () => {
    expect(stripQualysHtml("Upgrade to a supported release.")).toBe("Upgrade to a supported release.");
    expect(stripQualysHtml("")).toBe("");
  });
});
