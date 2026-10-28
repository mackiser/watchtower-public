import { describe, expect, it } from "vitest";
import { aggregateSnapshot, aggregateVulns, etDateString, parseDetectionXml, parseHostListXml } from "./qualysSync.js";
import type { ParsedHost } from "./qualysSync.js";

const detectionPage = `<?xml version="1.0" encoding="UTF-8" ?>
<HOST_LIST_VM_DETECTION_OUTPUT>
  <RESPONSE>
    <DATETIME>2026-07-09T12:00:00Z</DATETIME>
    <HOST_LIST>
      <HOST>
        <ID>11111</ID>
        <IP>10.0.0.1</IP>
        <DETECTION_LIST>
          <DETECTION><QID>90001</QID><TYPE>Confirmed</TYPE><SEVERITY>5</SEVERITY><STATUS>Active</STATUS></DETECTION>
          <DETECTION><QID>90002</QID><TYPE>Potential</TYPE><SEVERITY>3</SEVERITY><STATUS>Re-Opened</STATUS></DETECTION>
        </DETECTION_LIST>
      </HOST>
      <HOST>
        <ID>22222</ID>
        <IP>10.0.0.2</IP>
        <DETECTION_LIST>
          <DETECTION><QID>90003</QID><TYPE>Confirmed</TYPE><SEVERITY>1</SEVERITY><STATUS>Fixed</STATUS><LAST_FIXED_DATETIME>2026-07-01T00:00:00Z</LAST_FIXED_DATETIME></DETECTION>
        </DETECTION_LIST>
      </HOST>
    </HOST_LIST>
    <WARNING>
      <CODE>1980</CODE>
      <TEXT>1000 record limit exceeded.</TEXT>
      <URL>https://qualysapi.qualys.com/api/2.0/fo/asset/host/vm/detection/?action=list&amp;id_min=22223</URL>
    </WARNING>
  </RESPONSE>
</HOST_LIST_VM_DETECTION_OUTPUT>`;

const detectionFinalPage = `<?xml version="1.0" encoding="UTF-8" ?>
<HOST_LIST_VM_DETECTION_OUTPUT>
  <RESPONSE>
    <DATETIME>2026-07-09T12:00:00Z</DATETIME>
    <HOST_LIST>
      <HOST>
        <ID>33333</ID>
        <DETECTION_LIST>
          <DETECTION><QID>90004</QID><TYPE>Confirmed</TYPE><SEVERITY>4</SEVERITY><STATUS>New</STATUS></DETECTION>
        </DETECTION_LIST>
      </HOST>
    </HOST_LIST>
  </RESPONSE>
</HOST_LIST_VM_DETECTION_OUTPUT>`;

const detectionEmpty = `<?xml version="1.0" encoding="UTF-8" ?>
<HOST_LIST_VM_DETECTION_OUTPUT>
  <RESPONSE><DATETIME>2026-07-09T12:00:00Z</DATETIME></RESPONSE>
</HOST_LIST_VM_DETECTION_OUTPUT>`;

describe("parseDetectionXml", () => {
  it("extracts hosts, detections (incl. type), and the pagination URL", () => {
    const { hosts, nextUrl } = parseDetectionXml(detectionPage);
    expect(hosts).toHaveLength(2);
    expect(hosts[0]).toEqual({
      hostId: "11111",
      detections: [
        { qid: "90001", type: "Confirmed", severity: 5, status: "Active", lastFixed: undefined },
        { qid: "90002", type: "Potential", severity: 3, status: "Re-Opened", lastFixed: undefined },
      ],
    });
    expect(hosts[1]!.detections[0]!.lastFixed).toBe("2026-07-01T00:00:00Z");
    expect(nextUrl).toContain("id_min=22223");
  });

  it("returns null nextUrl on the final page (single host/detection not array-collapsed)", () => {
    const { hosts, nextUrl } = parseDetectionXml(detectionFinalPage);
    expect(hosts).toHaveLength(1);
    expect(hosts[0]!.detections).toEqual([
      { qid: "90004", type: "Confirmed", severity: 4, status: "New", lastFixed: undefined },
    ]);
    expect(nextUrl).toBeNull();
  });

  it("handles an empty result", () => {
    expect(parseDetectionXml(detectionEmpty)).toEqual({ hosts: [], nextUrl: null });
  });
});

describe("parseHostListXml", () => {
  it("counts ID_SET ids and ranges, and surfaces pagination", () => {
    // details=None returns an ID_SET (verified against the live 5.0 API), with possible ranges
    const xml = `<HOST_LIST_OUTPUT><RESPONSE><ID_SET>
      <ID>658010892</ID><ID>658010913</ID><ID_RANGE>100-104</ID_RANGE>
    </ID_SET><WARNING><URL><![CDATA[https://next.example/page2?id_min=658010936]]></URL></WARNING></RESPONSE></HOST_LIST_OUTPUT>`;
    expect(parseHostListXml(xml)).toEqual({ count: 7, nextUrl: "https://next.example/page2?id_min=658010936" });
    expect(parseHostListXml(`<HOST_LIST_OUTPUT><RESPONSE/></HOST_LIST_OUTPUT>`)).toEqual({ count: 0, nextUrl: null });
  });
});

describe("aggregateSnapshot", () => {
  const now = new Date("2026-07-09T21:00:00Z");
  const host = (sevs: number[]): ParsedHost => ({
    hostId: "h",
    detections: sevs.map((severity) => ({ qid: "10000", type: "Confirmed", severity, status: "Active" })),
  });

  it("maps severities 5/4/3/1-2 to crit/high/med/low and counts active", () => {
    const open = [host([5, 5, 4, 3, 2, 1])];
    const agg = aggregateSnapshot(open, [], now);
    expect(agg).toMatchObject({ active: 6, crit: 2, high: 1, med: 1, low: 2, reboot: 0 });
  });

  it("excludes Potential detections from the vuln metrics (dashboard counts Confirmed only)", () => {
    const mixed: ParsedHost = {
      hostId: "h",
      detections: [
        { qid: "1", type: "Confirmed", severity: 5, status: "Active" },
        { qid: "2", type: "Potential", severity: 5, status: "Active" },
        { qid: "3", type: "Potential", severity: 3, status: "New" },
      ],
    };
    const agg = aggregateSnapshot([mixed], [], now);
    expect(agg).toMatchObject({ active: 1, crit: 1, med: 0 });
  });

  it("counts pending-reboot hosts even though QID 90126 is Potential-type", () => {
    const rebootHost = (id: string): ParsedHost => ({
      hostId: id,
      detections: [
        { qid: "90126", type: "Potential", severity: 3, status: "Active" },
        { qid: "90126", type: "Potential", severity: 3, status: "New" }, // duplicate — host counts once
      ],
    });
    const agg = aggregateSnapshot([rebootHost("a"), rebootHost("b"), host([5])], [], now);
    expect(agg.reboot).toBe(2);
    expect(agg.active).toBe(1); // only the Confirmed sev-5 detection counts toward active
  });

  it("buckets fixed Confirmed detections by LAST_FIXED_DATETIME age", () => {
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
    const fixed: ParsedHost[] = [
      {
        hostId: "h",
        detections: [
          { qid: "10000", type: "Confirmed", severity: 3, status: "Fixed", lastFixed: daysAgo(5) }, // fix030
          { qid: "10000", type: "Confirmed", severity: 3, status: "Fixed", lastFixed: daysAgo(45) }, // fix3060
          { qid: "10000", type: "Confirmed", severity: 3, status: "Fixed", lastFixed: daysAgo(75) }, // fix6090
          { qid: "10000", type: "Confirmed", severity: 3, status: "Fixed", lastFixed: daysAgo(120) }, // outside window — ignored
          { qid: "10000", type: "Confirmed", severity: 3, status: "Fixed" }, // no date — ignored
          { qid: "10000", type: "Potential", severity: 3, status: "Fixed", lastFixed: daysAgo(5) }, // Potential — ignored
        ],
      },
    ];
    const agg = aggregateSnapshot([], fixed, now);
    expect(agg).toMatchObject({ active: 0, fix030: 1, fix3060: 1, fix6090: 1 });
  });
});

describe("aggregateVulns", () => {
  const det = (qid: string, over: Partial<{ type: string; severity: number; status: string }> = {}) => ({
    qid,
    type: "Confirmed",
    severity: 5,
    status: "Active",
    ...over,
  });

  it("counts distinct hosts and detection rows separately", () => {
    const open: ParsedHost[] = [
      // QID 90001 twice on one host (two ports) → 1 asset, 2 detections.
      { hostId: "h1", detections: [det("90001"), det("90001"), det("90002", { severity: 4 })] },
      { hostId: "h2", detections: [det("90001")] },
    ];
    const rows = aggregateVulns(open);
    const q1 = rows.find((r) => r.qid === "90001")!;
    expect(q1).toMatchObject({ assetCount: 2, detectionCount: 3, severity: 5 });
    expect(rows.find((r) => r.qid === "90002")).toMatchObject({ assetCount: 1, detectionCount: 1, severity: 4 });
  });

  it("ignores Potential detections, matching aggregateSnapshot", () => {
    const open: ParsedHost[] = [
      { hostId: "h1", detections: [det("90001"), det("90002", { type: "Potential" })] },
    ];
    const rows = aggregateVulns(open);
    expect(rows.map((r) => r.qid)).toEqual(["90001"]);
  });

  // The reboot QID is Potential-type and has its own KPI card. aggregateSnapshot special-cases it;
  // this deliberately does not, so it must not surface in the Top vulnerabilities table.
  it("excludes the reboot QID (90126)", () => {
    const open: ParsedHost[] = [
      { hostId: "h1", detections: [det("90126", { type: "Potential", severity: 3 }), det("90001")] },
    ];
    expect(aggregateVulns(open).map((r) => r.qid)).toEqual(["90001"]);
  });

  // The guard that matters most: the table sits directly under the "Active vulnerabilities" KPI,
  // so its rows have to add up to that number or the feature reads as broken.
  it("reconciles with aggregateSnapshot — detections sum to `active`", () => {
    const open: ParsedHost[] = [
      { hostId: "h1", detections: [det("90001"), det("90001"), det("90002", { severity: 4 }), det("90126", { type: "Potential" })] },
      { hostId: "h2", detections: [det("90001"), det("90003", { severity: 1 }), det("90004", { type: "Potential" })] },
      { hostId: "h3", detections: [det("90002", { severity: 4 })] },
    ];
    const total = aggregateVulns(open).reduce((s, r) => s + r.detectionCount, 0);
    expect(total).toBe(aggregateSnapshot(open, [], new Date()).active);
  });

  it("is empty for no hosts", () => {
    expect(aggregateVulns([])).toEqual([]);
  });
});

describe("etDateString", () => {
  it("uses the target timezone's calendar date, not UTC's", () => {
    // 2026-07-10 01:30 UTC is still 2026-07-09 in New York (EDT, UTC-4)
    expect(etDateString(new Date("2026-07-10T01:30:00Z"), "America/New_York")).toBe("2026-07-09");
    expect(etDateString(new Date("2026-07-10T12:00:00Z"), "America/New_York")).toBe("2026-07-10");
    // Winter (EST, UTC-5): 04:30 UTC is still the previous day
    expect(etDateString(new Date("2026-01-10T04:30:00Z"), "America/New_York")).toBe("2026-01-09");
  });
});
