# Product

## Register

product

## Users

MSP security analysts and administrators at managed security providers who manage many client accounts at
once. Their workflow: scan an Overview of all clients to spot who needs attention, drill into
a single client's Qualys vulnerability / ISPM compliance / Tasks detail, run a Weekly Update
to log new scan data and control compliance, and track hardening work on a per-client kanban
board. Team admins additionally manage teammate accounts. Primarily desk-based, focused work
sessions, sometimes scanning quickly across dozens of clients in a row.

## Product Purpose

Watchtower blends Qualys vulnerability scan data and Huntress ISPM control compliance
into a single security posture score per client, tracked over time, replacing manual
spreadsheet tracking with a shared, always-current dashboard. Success is fast triage across
many clients, confident low-error weekly data entry, and a clear, visible sense of remediation
progress over time.

## Brand Personality

Serious, precise, calm — a SOC/NOC-console feel. Dense but scannable, trustworthy, no fluff
or marketing flourish. Confidence through clarity: numbers and status are the hero, not
decoration. Brand colors — Glaucous `#526aad` (primary), Critical `#f86190`, Warning
`#c2933d`, Pass `#09c5b3` — anchor the accent system, over the Twilight Indigo neutral ramp
(`#0e1015` page, `#15161e` cards) in dark and its lightest steps (`#f0f1f5` page, white cards)
in light.

## Anti-references

Generic AI-generated SaaS template look: gradient text, cream/beige body backgrounds,
hero-metric cards, identical icon-grid feature sections, side-stripe card borders, tiny
uppercase tracked eyebrows over every section, numbered 01/02/03 scaffolding, glassmorphism,
ghost-cards (thin border + big soft shadow), over-rounded cards. This is an operations tool,
not a landing page, and should never read as one.

## Design Principles

1. **Data density with clarity** — surface a lot of per-client information without feeling
   cluttered; hierarchy does the work, not decoration.
2. **Status color is functional, not decorative** — severity (critical/high/medium/low) and
   compliance (pass/fail) colors are load-bearing signals; never repurpose them for branding.
3. **Brand accent supports, doesn't compete** — primary blue marks actions/navigation/identity
   and must stay visually distinct from the functional severity palette.
4. **Fast triage over exhaustive detail** — the Overview and grade card exist so a user can
   assess a client's health in seconds; drill-down is opt-in, not required.
5. **No ceremony** — every screen should get a working analyst to their next action (weekly
   update, task edit) with minimal friction.

## Accessibility & Inclusion

WCAG AA baseline: ≥4.5:1 contrast for body text, ≥3:1 for large text/UI components, full
keyboard operability, honor `prefers-reduced-motion`. Severity/compliance status relies on
color (crit/high/med/low, pass/fail) — always pair color with a text or icon label, never
color alone.
