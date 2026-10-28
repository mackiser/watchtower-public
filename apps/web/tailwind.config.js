/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // useTheme.ts always sets data-theme to the active theme, so `dark:` keys off it directly.
  darkMode: ["selector", '[data-theme="dark"]'],
  // Incremental adoption: don't reset the hand-authored element/component styles in theme.css.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      // Map utilities onto the existing design tokens so bg-surface/text-ink/border-line/etc.
      // stay theme-aware for free (the vars flip in theme.css between dark and light).
      colors: {
        field: "var(--field)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        line: "var(--line)",
        "line-soft": "var(--line-soft)",
        ink: "var(--ink)",
        "ink-dim": "var(--ink-dim)",
        "ink-faint": "var(--ink-faint)",
        signal: "var(--signal)",
        // Filled-blue surfaces that carry white text — see the token comment in theme.css for
        // why this isn't the same value as `signal` in dark mode.
        "signal-solid": "var(--signal-solid)",
        "signal-soft": "var(--signal-soft)",
        crit: "var(--crit)",
        high: "var(--high)",
        med: "var(--med)",
        low: "var(--low)",
        pass: "var(--pass)",
        fail: "var(--fail)",
        warn: "var(--warn)",
        // soft tint backgrounds (pills, badges, accent fills) — theme-tuned in theme.css
        "crit-soft": "var(--crit-soft)",
        "high-soft": "var(--high-soft)",
        "med-soft": "var(--med-soft)",
        "low-soft": "var(--low-soft)",
        "pass-soft": "var(--pass-soft)",
        "fail-soft": "var(--fail-soft)",
        "warn-soft": "var(--warn-soft)",
      },
      fontFamily: {
        sans: "var(--sans)",
        mono: "var(--mono)",
      },
      // The app's 12-step type scale (theme.css). Overrides Tailwind's defaults for the shared
      // names (xs/sm/base/...) so `text-xs` in a component means the same 13px it means in BEM
      // CSS. Line-heights tighten as sizes grow — big numbers/grades are display type.
      fontSize: {
        "3xs": ["var(--text-3xs)", { lineHeight: "1.5" }],
        "2xs": ["var(--text-2xs)", { lineHeight: "1.5" }],
        xs: ["var(--text-xs)", { lineHeight: "1.5" }],
        sm: ["var(--text-sm)", { lineHeight: "1.5" }],
        base: ["var(--text-base)", { lineHeight: "1.5" }],
        md: ["var(--text-md)", { lineHeight: "1.4" }],
        lg: ["var(--text-lg)", { lineHeight: "1.3" }],
        xl: ["var(--text-xl)", { lineHeight: "1.3" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "1.25" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "1.15" }],
        "4xl": ["var(--text-4xl)", { lineHeight: "1.1" }],
        "5xl": ["var(--text-5xl)", { lineHeight: "1.1" }],
        "6xl": ["var(--text-6xl)", { lineHeight: "1" }],
      },
      borderRadius: {
        DEFAULT: "var(--r)",
      },
      // Restrained-depth elevation (theme-tuned in theme.css). `shadow`/`shadow-sm` for raised
      // cards + dropdowns, `shadow-md` for modals. Nothing louder exists on purpose.
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)",
      },
      transitionDuration: {
        DEFAULT: "var(--dur-fast)", // hover/focus feedback
        base: "var(--dur)", // surface/theme changes
      },
      transitionTimingFunction: {
        DEFAULT: "var(--ease)",
      },
      // Entrance motion for overlays/dropdowns. Use with `motion-safe:` so reduced-motion users
      // get an instant cut (theme.css also kills transitions globally under that preference).
      keyframes: {
        "overlay-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "panel-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "menu-in": {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "overlay-in": "overlay-in var(--dur) var(--ease) both",
        "panel-in": "panel-in var(--dur) var(--ease) both",
        "menu-in": "menu-in var(--dur-fast) var(--ease) both",
      },
      // NOTE on spacing: Tailwind's default 4px-grid utilities line up 1:1 with the --space-*
      // ramp (p-1=4px ... p-10=40px), so numeric utilities are kept. Migrated components should
      // stick to whole steps {1,2,3,4,5,6,8,10} — same ramp, two names.
    },
  },
  plugins: [],
};
