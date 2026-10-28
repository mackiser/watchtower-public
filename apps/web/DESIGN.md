---
name: Watchtower
description: Security posture console blending Qualys vulnerability data and Huntress ISPM compliance into one per-client score.
colors:
  glaucous: "#526aad"
  warning: "#c2933d"
  critical: "#f86190"
  field: "#0e1015"
  surface: "#15161e"
  surface-2: "#292d3d"
  line: "#535a79"
  line-soft: "#1c1e29"
  ink: "#f7f7f8"
  ink-dim: "#9d9faf"
  ink-faint: "#9294a6"
  high: "#fd7a3a"
  medium: "#e3b341"
  low: "#4fc9e8"
  pass: "#09c5b3"
typography:
  display:
    fontFamily: "Work Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "64px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-2px"
  headline:
    fontFamily: "Work Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "34px"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.5px"
  title:
    fontFamily: "Work Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Work Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', 'Source Code Pro', Consolas, monospace"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "1px"
rounded:
  sm: "4px"
  md: "8px"
  lg: "10px"
  pill: "50%"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.glaucous}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "7px 12px"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "7px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px 22px"
  input:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: Watchtower

## 1. Overview

**Creative North Star: "The Watchtower Console"**

Watchtower is read like an instrument panel, not browsed like a website. An analyst opens
it to answer one question fast — *which clients need attention right now* — then drills down
only as far as the work requires. Every screen is built around that rhythm: a dense but
legible overview first, quiet supporting detail underneath, and status color that means
something rather than decorates.

The system explicitly rejects the generic AI-generated SaaS look: no gradient text, no
cream/beige body backgrounds, no hero-metric cards, no identical icon-grid feature sections,
no tiny uppercase eyebrows stacked over every section, no glassmorphism, no ghost-cards
(thin border plus big soft shadow), no over-rounded surfaces. This is an operations tool, not
a landing page, and it should never read as one.

**Key Characteristics:**
- Dark-first, with a fully-supported light theme — not a token swap, a deliberately re-tuned
  palette per theme so contrast and legibility hold in both.
- Restrained depth (revised 2026-07; was "flat by default"). Depth still comes first from the
  surface scale (field → surface → surface-2 → surface-3) and 1px hairlines; a small tokenized
  shadow scale (`--shadow-sm`/`--shadow-md`) exists for the few genuinely raised things —
  modals, dropdowns, the grade card, hovered cards, chart tooltips. If a shadow is loud enough
  to notice on its own, it's too loud.
- Two accent registers that must never be confused: **Glaucous** for brand/action/
  navigation, and the **severity palette** (critical/high/medium/low) for vulnerability and
  compliance status. Blue never means "bad" or "good" — it means "you can act here."
- Monospace for every label, metric, and piece of scannable data; proportional sans for prose
  and headings only. The split is load-bearing, not stylistic.

## 1.5 Styling foundation — Tailwind (added 2026-07, migration completed 2026-07-02)

Styling migrated from the single hand-authored `theme.css` to **TailwindCSS**, token-mapped so
utilities and the remaining hand CSS share one source of truth:

- **Token-mapped, not a reset.** `tailwind.config.js` maps utility colors onto the CSS
  variables (`bg-surface` → `var(--surface)`, `text-ink`, `border-line`, `text-signal`, the
  severity/status tokens plus their `-soft` tint variants), the `--sans`/`--mono` fonts, the full
  12-step `--text-*` type scale (so `text-xs` means the same 13px everywhere), `boxShadow` →
  `--shadow-*`, and `transitionDuration` → `--dur-*`. Utilities stay theme-aware for free, since
  the vars flip between dark/light in `theme.css`.
- **Preflight disabled** (`corePlugins.preflight = false`); `theme.css` keeps the tiny universal
  reset plus the tokens, chart internals (`.linechart`, `.vbars`, `.crow`, `.gauge`/`.donut`),
  the kanban board, tables, and page chrome (header/tabs/scope) — everything else is utilities.
- **Dark mode via `data-theme`** (`darkMode: ['selector','[data-theme="dark"]']`) to match
  `useTheme.ts`, which always sets that attribute.
- **Spacing:** Tailwind's default 4px grid is the spacing scale (it matches the `--space-*`
  tokens 1:1). Migrated components stick to whole steps {1, 2, 3, 4, 5, 6, 8, 10}.
- **Primitive components** live in `src/components/ui/` — `Button` (primary/secondary/danger/
  ghost × sm/md, loading state, icon slot), `Modal` (wraps `useModalA11y`; nesting-safe),
  `Card`, `Field`/`Input`/`Select`/`Textarea`, and `Pill`. They are the enforcement layer for
  consistency: new UI composes these rather than re-styling raw elements. Class conflicts
  resolve caller-wins via `tailwind-merge` (`ui/cx.ts`).
- **Fonts are self-hosted** via `@fontsource-variable/work-sans` and
  `@fontsource-variable/source-code-pro` (imported in `main.tsx`) so the app renders identically
  on the offline/LAN test box — no Google Fonts fetch.
- Everything below — the two-register color system, restrained-depth elevation, and data
  density — stays authoritative for both Tailwind and hand CSS.

## 2. Colors

**2026-09, Tailwind-generated ramps.** Three named ramps came in: Glaucous (blue), Twilight
Indigo (blue-grey), Pitch Black (despite the name, a warm gold ramp — there's no black in it).
Glaucous becomes the brand accent; Twilight Indigo, genuinely low-saturation, becomes the neutral
ramp in both themes; Pitch Black's gold fills `--warn`, the one severity role it fits, rather
than existing as a fourth decorative accent (see the Two-Register Rule below for why that
matters). `--crit`/`--high`/`--med`/`--low`/`--pass` are untouched by this request — the first
time in this system's history that was true without needing any AA retuning at all.

### Primary
- **Glaucous 500** — `#526aad` literal. The single brand accent: active tab, focus rings, links,
  the brand mark's center dot, the logo, the security-posture graph line. It marks "you can act
  here," not "this is important" (that's the severity palette's job).
  - `--signal` (`#788bbf` dark / `#5168aa` light) is the *text/border* value. The literal color
    is 3.5:1 on a card — too pale — so dark lightens the same hue until it clears the harder
    pill-on-its-own-wash case. Light barely has to move: literal 500 is already 5.2:1 on white.
  - `--signal-solid` is the literal `#526aad`, **unchanged in both themes** — the first palette
    this session where one fill value works everywhere. It clears 5.2:1 with a white label
    whether the surface behind it is dark or white, so there was no reason to diverge it the way
    every prior palette's fill value had to.
  - `--signal-soft` is the selected/active wash: a pale, mostly-opaque tint in light mode
    (`#edeef2`), and the literal Glaucous at 12% in dark.

### Neutral
Every step is a literal Twilight Indigo value — nothing manufactured, the given 11-step ramp had
enough range to cover every role in both themes without inventing an intermediate.

- **Field** (`#0e1015` dark, ramp 950 / `#f0f1f5` light, ramp 50): page background.
- **Surface** (`#15161e` dark, ramp 900 / `#ffffff` light): card, panel, and modal background.
- **Surface 2** (`#292d3d` dark, ramp 800 / `#e1e2ea` light, ramp 100): input fields, table
  zebra/hover, chip backgrounds.
- **Surface 3** (`#3e435b` dark, ramp 700 / `#c2c6d6` light, ramp 200).
- **Line** (`#535a79` dark, ramp 600 / `#a4a9c1` light, ramp 300) and **Line Soft** (`#1c1e29`
  dark, interpolated 35% of the way from surface toward surface-2 — the ramp has no step that
  close to surface — / `#f0f1f5` light, reusing the field/50 value: both jobs want "barely
  there," so the same literal value covers both). No shadows stand in for borders.
- **Ink / Ink Dim / Ink Faint** (`#f7f7f8` / `#9d9faf` / `#9294a6` dark;
  `#0e1015` / `#525e7b` / `#596480` light): a three-step text ramp — primary reading text,
  secondary/meta text, and label/hint text. `ink-faint` is checked against `surface-2`, not the
  card, because that's where placeholder text sits. Never introduce a fourth text color; pick the
  closest of these three.
- Light-theme ink is the literal dark field value (`#0e1015`), the reciprocal-pair convention
  this system has followed every palette — dark ground, light ink, same hex.

**Still gone:** the Sand-style secondary-brand text accent from two palettes ago. Nothing in this
request revives it; client names stay plain `--ink`.

### Severity (functional, not brand)
- **Critical** `#f86190` / `#cd0946`, **High** `#fd7a3a` / `#b4470f`, **Medium** `#e3b341` /
  `#7d610a`, **Low** `#4fc9e8` / `#0a6f8a`, **Pass** `#09c5b3` / `#05776c` (dark / light) — all
  five untouched by this request, and all five still clear AA against the new ground with margin
  (worst case 4.57:1, a pill). No hue in this row changed; no value in this row changed.
- **Warn** `#c2933d` / `#86652a` (dark / light) is new: Pitch Black 500, literal in dark (6.5:1
  on a card, no lift needed); darkened for light, where the literal value is only 2.8:1 on white.
  This is a deliberate mapping, not a literal instruction — the brief gave three aesthetic ramps
  with no severity semantics attached, and gold conventionally reads as "warning" in almost every
  status vocabulary, so it filled the one open slot rather than becoming a fourth free-floating
  accent alongside Glaucous.

### ⚠ Flag: High severity and Warning share a warm hue family
`--high` (orange, untouched by this request) and the new `--warn` (Pitch Black gold) are both
warm ~20-40° hues — closer to each other than most severity/status pairs in this system, though
less confusable than the last palette's near-identical 9° gap. Worth a look side by side on
`QualysTab`, which puts a High-severity bar and a `--warn`-accented KPI tile on the same screen.
Not changed here since `--high`'s hue wasn't part of this request.

### Contrast floor
**Every foreground/background pair in this system clears 4.5:1, in both themes** — including
every soft-tint pill, the harder, self-referential case (a color has to clear AA against a wash
of *itself*). Twilight Indigo's low saturation made this the easiest palette yet to hold the
floor: the five untouched severity/status colors needed zero retuning, the first time that's
been true.

**Keep it there.** Any new token, or any change to `--surface-2` or a `-soft` alpha, should be
re-measured against the *pill* case, not just the flat card — that is the case that has broken
AA on every palette this system has shipped so far.

### Named Rules
**The Two-Register Rule.** Glaucous is the only "you can act here" color, and it is the only
color with that job. Everything else on screen — pink-red, orange, yellow, cyan, teal, gold — is
status data. A screen may use all of them at once, but never for the same purpose: a user must
be able to tell "the app wants me to click this" from "this data point is bad" without reading
the label. This is the reasoning behind folding Pitch Black's gold into `--warn` instead of
adding it as a second brand accent alongside Glaucous.

**The Three-Ink Rule.** Body copy is `ink`, supporting copy is `ink-dim`, labels/hints are
`ink-faint`. If something doesn't fit one of the three, it's not a text color — it's data, and
belongs in the severity or accent palette instead. No exceptions currently in force.

## 3. Typography

**Display/Body Font:** Work Sans Variable, self-hosted via `@fontsource-variable/work-sans`
(fallbacks: `Work Sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)
**Label/Mono Font:** Source Code Pro Variable, self-hosted via
`@fontsource-variable/source-code-pro` (fallbacks: `ui-monospace, "SF Mono", "Cascadia Code",
"Source Code Pro", Consolas, monospace`)

**Character:** One proportional sans for anything meant to be read, one monospace for
anything meant to be scanned or measured. The pairing is functional, not decorative — mono
signals "this is data" the instant you see it, before you've read a word.

**x-height normalization.** `body` sets `font-size-adjust: .535`. The type scale below was tuned
against Inter (x-height ratio .545) and later Open Sans (.535); Work Sans is .50 and Source Code
Pro .49, so both rendered visibly smaller at the identical px values — worst in the dense Overview
table. Pinning the ratio restores the intended optical size (sans +7%, mono +9%) without editing
~15 size tokens. **If the typefaces ever change again, re-check this number rather than nudging
the scale** — the scale is the semantic layer, this is the metric correction underneath it.

### Hierarchy
Sizes below are the authored px values; the `font-size-adjust` above scales the rendered glyphs
about 7–9% larger than the raw numbers suggest.

- **Display** (800 weight, 64px, line-height 1, letter-spacing -2px): the letter grade only
  (A / B+ / C- / F). The single largest element on any screen, by design — it's the answer to
  "is this client okay?" before anything else loads.
- **Headline** (650 weight, 34px, letter-spacing -0.5px): KPI values (client counts, scores,
  vulnerability counts). Tabular numerals throughout so columns of numbers align.
- **Title** (700 weight, 16px): the brand mark and client-name headings.
- **Body** (400 weight, 14px, line-height 1.5): narrative sentences, form hints, table cells.
- **Label** (600 weight, 11px, letter-spacing 1px, uppercase, mono): every field label, KPI
  caption, section eyebrow, and table header. Uppercase + tracked + mono is the system's one
  consistent "this is metadata" signal — don't introduce a second one.

### Named Rules
**The Mono-Means-Data Rule.** If it's a number, a label, a date, or anything meant to be
scanned rather than read as prose, it's monospace. If it's a sentence meant to be read, it's
Work Sans. Never mix within the same string.

## 4. Elevation

**Restrained depth** (revised 2026-07 — deliberately supersedes the original No-Shadow Rule).
Depth is still conveyed first by the surface scale (field → surface → surface-2 → surface-3)
plus 1px hairline borders. On top of that sits a two-step tokenized shadow scale, tuned per
theme (`--shadow-sm`, `--shadow-md` — heavier alpha in dark mode where soft shadows barely
read, much lighter in light mode where they read as dirt):

- `--shadow-md`: modals only — the most-raised thing in the app.
- `--shadow-sm`: dropdown menus, chart hover tooltips, the grade card (resting), the login
  card, and task cards on hover.

Modals sit on a `rgba(0,0,0,.55)` scrim with a `blur(3px)` backdrop-filter — the one place
translucency is used, and it's functional, not decorative. Buttons: the primary button carries
a whisper of top-light gradient and gains `--shadow-sm` on hover; nothing else gets gradients.

Motion is tokenized too: `--dur-fast` (.15s, hover/focus feedback), `--dur` (.25s, surface and
theme changes), `--ease` (the springy curve the chart fills use). Chart entrances (line
draw-in, bar grow-in, ring sweep) are pure-CSS keyframes; `prefers-reduced-motion` kills all
transitions *and* animations globally.

### Named Rules
**The Restrained-Depth Rule.** Elevation is a budget, not a default. A shadow is only for
something genuinely floating above the page (modal, dropdown, tooltip) or the one card per
screen that must read first (grade card). If a shadow is noticeable on its own, it's too
strong; if every card has one, none of them read as raised. When in doubt, move up one step on
the surface scale instead — that's still the primary depth mechanism.

## 5. Components

Every component is quiet and grid-disciplined: flat surfaces, thin borders, restrained hover
states. Components recede so the data is what a user notices, not the chrome around it.

### Buttons
- **Shape:** 8px radius (`rounded.md`), `7px 12px` padding, monospace 12px label.
- **Secondary (default `.btn`):** `surface-2` background, `ink` text, `line`
  border. This is the default for every non-primary action.
- **Primary (revised 2026-07):** the app's one solid fill — `signal-solid` background (the
  literal Glaucous, *not* `signal`; see §2 for why they hold the same value now),
  white text, a whisper of top-light gradient, `--shadow-sm` + slight brighten on hover.
  Reserved for the single primary action per screen/dialog (Weekly Update, Save, Sign in).
  (Previously a ghost treatment; promoted to a fill as part of the restrained-depth revision
  so the primary action reads unmistakably.)
- **Danger / Ghost:** danger stays a fail-tinted ghost (destructive actions never get a solid
  fill); ghost is borderless for toolbars.
- **Hover / Focus:** border shifts to `glaucous` on secondary buttons; `focus-visible`
  gets a 2px `glaucous` outline with 2px offset on every variant. No scale animation.
- **Implementation:** always `ui/Button` (`variant` × `size`, `loading`, `icon`) — never
  hand-assembled classes.

### Chips / Pills
- **Style:** `border-radius: 4px`, `10.5px` monospace text, tinted background from the
  `-soft` token (12% of the semantic color in dark, 10–12% in light) with the same color at
  full opacity for text (e.g. compliant = `pass-soft` background + solid `pass` text). Always
  the token, never a hand-written `rgba()` — the alphas are theme-tuned and have moved once
  already. See the Known contrast gap note in §2 before changing these.
- **State:** severity pills (`high`/`med`/`low`) and status pills (`pass`/`fail`) share this
  exact treatment; only the color changes. A neutral `grp` variant (surface-2 background,
  `ink-dim` text) exists for non-semantic tags like category names.

### Cards / Containers
- **Corner Style:** 10px radius (`rounded.lg`) for panels, KPI cards, and modals; 9px for
  kanban task cards (close enough to read as the same family).
- **Background:** `surface`, one step above the page's `field`.
- **Shadow Strategy:** restrained — flat at rest for almost everything; see Elevation for the
  short list of raised surfaces (`--shadow-sm`/`--shadow-md`).
- **Border:** 1px on every card, no exceptions — `line` by default.
- **Status borders (grade card):** where a card *is* a verdict, the 1px border takes the status
  color on all four sides, from a `--grade-accent` custom property set per-instance. Revised
  2026-09: this was a 3px left stripe. Same encoding, but confined to one edge it read as a
  decorative rule applied to a card rather than the card itself carrying the verdict — and a
  one-sided colored border is the single most recognizable tell of generated UI, worth avoiding
  even when the data behind it is real. Stays 1px: the grade letter is already 64px, so the
  border only has to agree with it, not compete.
- **Accent bars:** KPI cards and task cards still carry a 3px colored left border
  from a `--accent` custom property, set per-instance to a grade or severity color. These are
  scan-able strips down a dense grid, where the edge position is doing real work — you read the
  column of stripes, not one card. Don't add a colored left border to a card that has no status
  to encode, and don't add one to a card that stands alone: use the full border instead.
- **Internal Padding:** `20px 22px` for panels and KPI cards; `12px 13px` for task cards.

### Inputs / Fields
- **Style:** `surface-2` background, `line` border, 8px radius, `8px 10px`
  padding, sans body font (14/13px) — inputs are the one place mono is *not* used, since
  users type prose into them.
- **Focus:** 2px `glaucous` outline, 1px offset. No glow, no border-color-only
  treatment — the outline must be visible for keyboard users.
- **Error:** a red mono 12px line below the field (`ui/Field`'s `error` prop); validation can
  additionally mark the control itself via the `invalid` prop (red border + red focus ring)
  when the form scrolls the user to the offending field.
- **Implementation:** always `ui/Field` + `ui/Input`/`Select`/`Textarea` — one label register,
  one control style, one error/success line.

### Navigation
- **Style:** a single sticky top header (blurred surface background) with the brand mark
  left, actions right. Tabs below it use bottom-border-only active state (2px
  `glaucous`, transparent otherwise), monospace uppercase labels, no background pill.
  No sidebar — every surface in the app is reachable from the top header or a client's own
  tab strip.

### Grade Card (signature component)
The system's one deliberately oversized element: a 64px display-weight letter grade, colored
by tone (green ≥78, amber ≥58, red below), with a 3px accent bar and a plain-language "why"
sentence beneath it. Every other number in the app is monospace and modest; the grade is the
one exception, on purpose — it's the single fact a user is most likely to need at a glance.

## 6. Do's and Don'ts

### Do:
- **Do** keep Glaucous reserved for actions/navigation/identity — active tab, primary
  button, focus ring, links, logo. Nothing else.
- **Do** use the three-step ink ramp (`ink` / `ink-dim` / `ink-faint`) for all text; use the
  severity or accent palette for anything that isn't plain reading text.
- **Do** keep every card on a 1px hairline border; keep resting shadows to the Elevation
  short-list (grade card, auth card) and let everything else stay flat until hovered.
- **Do** use monospace uppercase-tracked labels for anything meant to be scanned (KPI
  captions, table headers, form labels); reserve Work Sans for prose and headings.
- **Do** pair every status color with a text or icon label (WCAG AA, and this app's own
  Accessibility principle) — never rely on a severity pill's color alone.

### Don't:
- **Don't** use gradient text, cream/beige backgrounds, hero-metric-card templates, identical
  icon-grid sections, tiny uppercase eyebrows over every section, glassmorphism, or
  ghost-cards (thin border + big soft shadow) — the generic AI-SaaS look this system
  explicitly rejects.
- **Don't** round cards or modals past 10px, or buttons/inputs past 8px. Full-pill radius is
  reserved for chips/pills only.
- **Don't** invent new shadows — only `--shadow-sm`/`--shadow-md`, and only on the Elevation
  short-list. When a surface just needs to look nested/interactive, move up the surface scale
  instead.
- **Don't** use Glaucous as a severity color, or a severity color as a
  brand accent. The two registers never swap roles.
- **Don't** add a colored left-border stripe to a card unless it's encoding a real status value
  the user can already see restated elsewhere on that card (grade, severity) **and** the card sits
  in a repeating grid or column where the stripes line up and can be read together. A standalone
  card takes the status on its full 1px border instead. A stripe with no data behind it is
  decoration, and decoration is exactly what this system rejects.
