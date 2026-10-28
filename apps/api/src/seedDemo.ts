// Seeds FAKE demo data — fictional clients with plausible Qualys/ISPM history — for the public
// proof-of-concept deployment (see README "Live demo"). Deterministic: same data every run.
// Guarded: refuses to run against any database that already has clients, so it can never mix
// fake rows into a populated database.
import { ispmWeightedCompliancePct } from "@watchtower/shared";
import { prisma } from "./lib/prisma.js";

// ---------- fixed ISPM control catalog (30 controls: 10 High, 12 Medium, 8 Low) ----------
// Realistic Huntress-ISPM-style controls; weighted total = 10*5 + 12*2 + 8*1 = 82.
type Sev = "High" | "Medium" | "Low";
const CATALOG: { control: string; category: string; group: string; severity: Sev }[] = [
  { control: "MFA enforced for all admin accounts", category: "Identity", group: "Microsoft 365", severity: "High" },
  { control: "MFA enforced for all user accounts", category: "Identity", group: "Microsoft 365", severity: "High" },
  { control: "Legacy authentication protocols blocked", category: "Identity", group: "Microsoft 365", severity: "High" },
  { control: "EDR agent deployed to all endpoints", category: "Endpoint", group: "Workstations", severity: "High" },
  { control: "Local administrator rights restricted", category: "Endpoint", group: "Workstations", severity: "High" },
  { control: "Domain admin group membership reviewed", category: "Identity", group: "Active Directory", severity: "High" },
  { control: "Immutable backup copies configured", category: "Backup", group: "Recovery", severity: "High" },
  { control: "Backup restore test performed quarterly", category: "Backup", group: "Recovery", severity: "High" },
  { control: "DMARC policy at quarantine or reject", category: "Email", group: "DNS", severity: "High" },
  { control: "Remote access requires VPN with MFA", category: "Network", group: "Perimeter", severity: "High" },
  { control: "Conditional access blocks risky sign-ins", category: "Identity", group: "Microsoft 365", severity: "Medium" },
  { control: "Password policy meets 14+ characters", category: "Identity", group: "Active Directory", severity: "Medium" },
  { control: "Stale accounts disabled within 30 days", category: "Identity", group: "Active Directory", severity: "Medium" },
  { control: "Screen lock enforced at 10 minutes", category: "Endpoint", group: "Group Policy", severity: "Medium" },
  { control: "Full-disk encryption enforced", category: "Endpoint", group: "Workstations", severity: "Medium" },
  { control: "OS patching SLA within 30 days", category: "Endpoint", group: "Patching", severity: "Medium" },
  { control: "Third-party application patching automated", category: "Endpoint", group: "Patching", severity: "Medium" },
  { control: "SPF record configured", category: "Email", group: "DNS", severity: "Medium" },
  { control: "DKIM signing enabled", category: "Email", group: "DNS", severity: "Medium" },
  { control: "Mailbox auditing enabled", category: "Email", group: "Microsoft 365", severity: "Medium" },
  { control: "Guest access reviewed quarterly", category: "Identity", group: "Microsoft 365", severity: "Medium" },
  { control: "Firewall firmware current", category: "Network", group: "Perimeter", severity: "Medium" },
  { control: "External email warning banner enabled", category: "Email", group: "Microsoft 365", severity: "Low" },
  { control: "Self-service password reset enabled", category: "Identity", group: "Microsoft 365", severity: "Low" },
  { control: "Security awareness training assigned", category: "People", group: "Training", severity: "Low" },
  { control: "Phishing simulations run quarterly", category: "People", group: "Training", severity: "Low" },
  { control: "Asset inventory reviewed this quarter", category: "Governance", group: "Documentation", severity: "Low" },
  { control: "Acceptable use policy signed by staff", category: "Governance", group: "Documentation", severity: "Low" },
  { control: "Guest Wi-Fi isolated from LAN", category: "Network", group: "Wireless", severity: "Low" },
  { control: "Network device firmware inventory current", category: "Network", group: "Perimeter", severity: "Low" },
];

// Deterministic per-week jitter so the series look organic, not ruler-straight.
const WIGGLE = [1.0, 1.03, 0.98, 1.02, 0.97, 1.01, 0.99, 1.04, 0.96, 1.01, 0.98, 1.0];
const WEEKS = 12;

interface DemoTask {
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  note?: string;
  linkControl?: string; // links the task to a failing ISPM control by name
  daysAgo: number; // createdAt offset
  doneDaysAgo?: number; // completedAt offset (DONE only)
}

interface DemoClient {
  name: string;
  assets: number;
  avgStart: number; // active vulns per asset, first scan
  avgEnd: number; // active vulns per asset, latest scan
  sevSplit: [number, number, number]; // crit/high/med fractions of active (low = remainder)
  // How many controls fail per severity bucket (picked from the catalog, rotated per client).
  fail: { high: number; med: number; low: number };
  ispmDrift: number; // weighted % improvement across the window (negative = getting worse)
  weeksBack?: number; // shifts the whole scan window into the past (stale-data showcase)
  ispmNA?: boolean;
  archivedDaysAgo?: number;
  tasks: DemoTask[];
}

// Tuned so composite grades land across the bands: A, A-, B+, B, C+, C, D + a vuln-only A-.
const CLIENTS: DemoClient[] = [
  {
    name: "Summit Credit Union", assets: 120, avgStart: 4.5, avgEnd: 1.6, sevSplit: [0.05, 0.18, 0.47],
    fail: { high: 1, med: 0, low: 1 }, ispmDrift: 9,
    tasks: [
      { title: "Quarterly backup restore test", status: "DONE", daysAgo: 34, doneDaysAgo: 6, note: "Restored finance share to sandbox — verified." },
      { title: "Review conditional access for contractors", status: "IN_PROGRESS", daysAgo: 8 },
      { title: "Renew perimeter firewall support contract", status: "TODO", daysAgo: 3 },
    ],
  },
  {
    name: "Harbor Dental Group", assets: 45, avgStart: 9, avgEnd: 6, sevSplit: [0.07, 0.2, 0.46],
    fail: { high: 2, med: 3, low: 0 }, ispmDrift: 11,
    tasks: [
      { title: "Block legacy IMAP/POP authentication", status: "IN_PROGRESS", daysAgo: 12, linkControl: "Legacy authentication protocols blocked" },
      { title: "Patch imaging workstation OS backlog", status: "TODO", daysAgo: 27, note: "Vendor approval needed before rebooting imaging PCs." },
      { title: "Enable DKIM for practice domain", status: "DONE", daysAgo: 40, doneDaysAgo: 15 },
    ],
  },
  {
    name: "Bluefin Logistics", assets: 210, avgStart: 14, avgEnd: 12, sevSplit: [0.09, 0.24, 0.44],
    fail: { high: 3, med: 2, low: 1 }, ispmDrift: 8,
    tasks: [
      { title: "Deploy EDR to warehouse scanners", status: "IN_PROGRESS", daysAgo: 21, linkControl: "EDR agent deployed to all endpoints" },
      { title: "Restrict local admin on dispatch PCs", status: "TODO", daysAgo: 9, linkControl: "Local administrator rights restricted" },
      { title: "Critical: patch fleet-tracking server", status: "TODO", daysAgo: 4, note: "CVSS 9.8 on public-facing service — schedule this week." },
      { title: "Segment guest Wi-Fi at Portland depot", status: "DONE", daysAgo: 50, doneDaysAgo: 22 },
    ],
  },
  {
    name: "Lakeview Property Group", assets: 65, avgStart: 12, avgEnd: 10.5, sevSplit: [0.06, 0.21, 0.45],
    fail: { high: 4, med: 3, low: 2 }, ispmDrift: 6,
    tasks: [
      { title: "Roll out MFA to remaining property managers", status: "IN_PROGRESS", daysAgo: 16, linkControl: "MFA enforced for all user accounts" },
      { title: "Quarterly guest access review", status: "TODO", daysAgo: 31, linkControl: "Guest access reviewed quarterly" },
    ],
  },
  {
    name: "Cedar Ridge Manufacturing", assets: 160, avgStart: 26, avgEnd: 20, sevSplit: [0.1, 0.25, 0.42],
    fail: { high: 6, med: 3, low: 1 }, ispmDrift: 10,
    tasks: [
      { title: "Plan OT/IT network segmentation", status: "IN_PROGRESS", daysAgo: 45, note: "Shop-floor PLCs currently share the office VLAN." },
      { title: "Deploy immutable backup repository", status: "TODO", daysAgo: 18, linkControl: "Immutable backup copies configured" },
      { title: "Patch ERP application server", status: "TODO", daysAgo: 7 },
      { title: "Decommission Windows Server 2012 host", status: "DONE", daysAgo: 60, doneDaysAgo: 12 },
    ],
  },
  {
    name: "Brightpath Pediatrics", assets: 38, avgStart: 27, avgEnd: 24, sevSplit: [0.08, 0.22, 0.45],
    fail: { high: 7, med: 2, low: 2 }, ispmDrift: 5, weeksBack: 3,
    tasks: [
      { title: "Schedule Qualys agent reinstall on EHR terminals", status: "TODO", daysAgo: 20, note: "Last scan is 3 weeks old — agents stopped reporting after EHR update." },
      { title: "Enforce screen lock on exam-room PCs", status: "IN_PROGRESS", daysAgo: 25, linkControl: "Screen lock enforced at 10 minutes" },
      { title: "Assign security awareness training", status: "TODO", daysAgo: 33, linkControl: "Security awareness training assigned" },
    ],
  },
  {
    name: "Northgate Foods", assets: 95, avgStart: 28, avgEnd: 34, sevSplit: [0.11, 0.26, 0.42],
    fail: { high: 8, med: 2, low: 1 }, ispmDrift: -7,
    tasks: [
      { title: "Escalate: vuln count rising for 6 weeks", status: "IN_PROGRESS", daysAgo: 14, note: "Patching agent broken on POS image — remediation plan drafted." },
      { title: "Re-enable OS patching on POS fleet", status: "TODO", daysAgo: 14, linkControl: "OS patching SLA within 30 days" },
      { title: "Deploy EDR to store back-office PCs", status: "TODO", daysAgo: 38, linkControl: "EDR agent deployed to all endpoints" },
      { title: "Block legacy authentication", status: "TODO", daysAgo: 52, linkControl: "Legacy authentication protocols blocked" },
    ],
  },
  {
    // ISPM not applicable — vuln-management-only engagement (shows the N/A path in the UI).
    name: "Ironwood Legal", assets: 28, avgStart: 8, avgEnd: 5, sevSplit: [0.05, 0.19, 0.46],
    fail: { high: 0, med: 0, low: 0 }, ispmDrift: 0, ispmNA: true,
    tasks: [
      { title: "Quarterly vulnerability review with partners", status: "DONE", daysAgo: 30, doneDaysAgo: 8 },
      { title: "Patch document management server", status: "IN_PROGRESS", daysAgo: 10 },
    ],
  },
  {
    // Archived — churned client kept for history (shows the archive path on the admin page).
    name: "Meridian Insurance Services", assets: 55, avgStart: 15, avgEnd: 11, sevSplit: [0.07, 0.22, 0.45],
    fail: { high: 3, med: 4, low: 2 }, ispmDrift: 4, weeksBack: 10, archivedDaysAgo: 35,
    tasks: [{ title: "Offboarding: final posture report delivered", status: "DONE", daysAgo: 40, doneDaysAgo: 36 }],
  },
];

// ---------- date helpers (all yyyy-mm-dd at UTC midnight, like the Weekly Update form) ----------
function daysAgoDate(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}
/** Most recent Friday (scan day), optionally shifted whole weeks into the past. */
function scanDate(weekIndex: number, weeksBack = 0): Date {
  const today = new Date();
  const sinceFriday = (today.getUTCDay() - 5 + 7) % 7;
  return daysAgoDate(sinceFriday + (WEEKS - 1 - weekIndex + weeksBack) * 7);
}

async function seedClient(cfg: DemoClient, index: number) {
  // Controls: rotate which catalog entries fail per client so failure sets differ.
  const bySev = (sev: Sev) => CATALOG.filter((c) => c.severity === sev);
  const failing = new Set<string>();
  (["High", "Medium", "Low"] as const).forEach((sev) => {
    const pool = bySev(sev);
    const count = sev === "High" ? cfg.fail.high : sev === "Medium" ? cfg.fail.med : cfg.fail.low;
    for (let j = 0; j < count; j++) failing.add(pool[(index + j) % pool.length]!.control);
  });
  const controls = cfg.ispmNA ? [] : CATALOG.map((c) => ({ ...c, compliant: !failing.has(c.control) }));
  const weightedPct = cfg.ispmNA ? null : ispmWeightedCompliancePct(controls);

  const client = await prisma.client.create({
    data: {
      name: cfg.name,
      ispmNotApplicable: !!cfg.ispmNA,
      archivedAt: cfg.archivedDaysAgo ? daysAgoDate(cfg.archivedDaysAgo) : null,
      // Fake auto-sync fields so the demo showcases the Qualys sync feature; the demo stack has
      // no Qualys credentials, so these are display-only ("HarborDental"-style short tags).
      qualysTag: cfg.name.split(/\s+/).slice(0, 2).join(""),
      qualysLastSyncAt: cfg.archivedDaysAgo ? null : daysAgoDate(1),
    },
  });

  // Weekly Qualys series: linear avg-per-asset ramp with deterministic jitter.
  const qualysRows = Array.from({ length: WEEKS }, (_, i) => {
    const frac = i / (WEEKS - 1);
    const avg = (cfg.avgStart + (cfg.avgEnd - cfg.avgStart) * frac) * WIGGLE[i]!;
    const active = Math.round(cfg.assets * avg);
    const crit = Math.round(active * cfg.sevSplit[0]);
    const high = Math.round(active * cfg.sevSplit[1]);
    const med = Math.round(active * cfg.sevSplit[2]);
    return {
      clientId: client.id,
      date: scanDate(i, cfg.weeksBack),
      active,
      crit,
      high,
      med,
      low: active - crit - high - med,
      fix030: Math.round(active * 0.32),
      fix3060: Math.round(active * 0.24),
      fix6090: Math.round(active * 0.17),
      assets: cfg.assets,
      reboot: Math.round(cfg.assets * 0.12 * WIGGLE[(i + 3) % WEEKS]!),
    };
  });
  await prisma.qualysSnapshot.createMany({ data: qualysRows });

  if (controls.length) {
    await prisma.ispmControl.createMany({ data: controls.map((c) => ({ ...c, clientId: client.id })) });
    // ISPM history ramps toward the current weighted % so the trend chart ends where the grade
    // card's blend sits (compositeScoreSeries pins current ISPM at the latest scan date anyway).
    const snapshots = Array.from({ length: WEEKS }, (_, i) => {
      const frac = i / (WEEKS - 1);
      const pct = Math.min(100, Math.max(0, weightedPct! - cfg.ispmDrift * (1 - frac)));
      return {
        clientId: client.id,
        date: scanDate(i, cfg.weeksBack),
        totalCount: controls.length,
        compliantCount: Math.round((controls.length * pct) / 100),
        weightedCompliancePct: Math.round(pct * 10) / 10,
      };
    });
    await prisma.ispmSnapshot.createMany({ data: snapshots });
  }

  for (const t of cfg.tasks) {
    await prisma.task.create({
      data: {
        clientId: client.id,
        title: t.title,
        status: t.status,
        note: t.note ?? "",
        linkType: t.linkControl ? "ISPM" : null,
        linkRef: t.linkControl ?? "",
        createdAt: daysAgoDate(t.daysAgo),
        completedAt: t.status === "DONE" ? daysAgoDate(t.doneDaysAgo ?? 1) : null,
      },
    });
  }

  console.log(`  ${cfg.name}: ${WEEKS} scans, ${controls.length} controls, ${cfg.tasks.length} tasks`);
}

async function main() {
  const existing = await prisma.client.count();
  if (existing > 0) {
    console.error(`Refusing to seed: this database already has ${existing} client(s). Demo data only goes into an empty database.`);
    process.exit(1);
  }
  console.log("Seeding demo data (fictional clients)...");
  for (let i = 0; i < CLIENTS.length; i++) await seedClient(CLIENTS[i]!, i);
  console.log(`Done — ${CLIENTS.length} demo clients created.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
