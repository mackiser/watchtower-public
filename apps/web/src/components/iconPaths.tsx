import type { ReactNode } from "react";
import type { IconName } from "./Icon";

// Raw path data ported directly from ionicons' SVG source (viewBox 0 0 512 512 for all of
// them). Rendered as plain JSX rather than fetched/injected at runtime — see Icon.tsx for why:
// both the bundler-imported web component and the standalone script-tag builds of the actual
// <ion-icon> custom element ran into packaging issues in this Vite setup (Rollup can't trace
// its internal lazy-load dynamic imports for a production build; the standalone script bundle
// then failed to hydrate at all when self-hosted). Inlining the handful of icons this app
// actually uses sidesteps all of that — it's just static SVG markup, so it can't break
// differently between `vite dev` and `vite build`.
export const ICON_PATHS: Record<IconName, ReactNode> = {
  "search-outline": (
    <>
      <path
        d="M221.09 64a157.09 157.09 0 10157.09 157.09A157.1 157.1 0 00221.09 64z"
        className="icon-fill-none icon-stroke"
        strokeMiterlimit="10"
      />
      <path d="M338.29 338.29L448 448" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeMiterlimit="10" />
    </>
  ),
  "grid-outline": (
    <>
      <rect width="176" height="176" x="48" y="48" rx="20" ry="20" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <rect width="176" height="176" x="288" y="48" rx="20" ry="20" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <rect width="176" height="176" x="48" y="288" rx="20" ry="20" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <rect width="176" height="176" x="288" y="288" rx="20" ry="20" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "list-outline": (
    <>
      <path d="M160 144h288M160 256h288M160 368h288" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="80" cy="144" r="16" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="80" cy="256" r="16" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="80" cy="368" r="16" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "moon-outline": (
    <path
      d="M160 136c0-30.62 4.51-61.61 16-88C99.57 81.27 48 159.32 48 248c0 119.29 96.71 216 216 216 88.68 0 166.73-51.57 200-128-26.39 11.49-57.38 16-88 16-119.29 0-216-96.71-216-216"
      className="icon-fill-none icon-stroke"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "sunny-outline": (
    <>
      <path
        d="M256 48v48M256 416v48M403.08 108.92l-33.94 33.94M142.86 369.14l-33.94 33.94M464 256h-48M96 256H48M403.08 403.08l-33.94-33.94M142.86 142.86l-33.94-33.94"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeMiterlimit="10"
      />
      <circle cx="256" cy="256" r="80" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeMiterlimit="10" />
    </>
  ),
  "add-outline": <path d="M256 112v288M400 256H112" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />,
  "refresh-outline": (
    <>
      <path d="M320 146s24.36-12-64-12a160 160 0 10160 160" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeMiterlimit="10" />
      <path d="M256 58l80 80-80 80" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "log-out-outline": (
    <path
      d="M304 336v40a40 40 0 0 1-40 40H104a40 40 0 0 1-40-40V136a40 40 0 0 1 40-40h152c22.09 0 48 17.91 48 40v40M368 336l80-80-80-80M176 256h256"
      className="icon-fill-none icon-stroke"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "people-outline": (
    <>
      <path
        d="M402 168c-2.93 40.67-33.1 72-66 72s-63.12-31.32-66-72c-3-42.31 26.37-72 66-72s69 30.46 66 72"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M336 304c-65.17 0-127.84 32.37-143.54 95.41-2.08 8.34 3.15 16.59 11.72 16.59h263.65c8.57 0 13.77-8.25 11.72-16.59C463.85 335.36 401.18 304 336 304Z"
        className="icon-fill-none icon-stroke"
        strokeMiterlimit="10"
      />
      <path
        d="M200 185.94c-2.34 32.48-26.72 58.06-53 58.06s-50.7-25.57-53-58.06C91.61 152.15 115.34 128 147 128s55.39 24.77 53 57.94"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M206 306c-18.05-8.27-37.93-11.45-59-11.45-52 0-102.1 25.85-114.65 76.2-1.65 6.66 2.53 13.25 9.37 13.25H154"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeMiterlimit="10"
      />
    </>
  ),
  "person-outline": (
    <>
      <path
        d="M344 144c-3.92 52.87-44 96-88 96s-84.15-43.12-88-96c-4-55 35-96 88-96s92 42 88 96z"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M256 304c-87 0-175.3 48-191.64 138.6C62.39 453.52 68.57 464 80 464h352c11.44 0 17.62-10.48 15.65-21.4C431.3 352 343 304 256 304z"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  "bug-outline": (
    <>
      <path
        d="M370 378c28.89 23.52 46 46.07 46 86M142 378c-28.89 23.52-46 46.06-46 86M384 208c28.89-23.52 32-56.07 32-96M128 206c-28.89-23.52-32-54.06-32-94M464 288.13h-80M128 288.13H48M256 192v256"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M256 448c-70.4 0-128-57.6-128-128v-96.07c0-65.07 57.6-96 128-96h0c70.4 0 128 25.6 128 96V320c0 70.4-57.6 128-128 128"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M179.43 143.52a49.1 49.1 0 0 1-3.43-15.73A80 80 0 0 1 255.79 48h.42A80 80 0 0 1 336 127.79a41.9 41.9 0 0 1-3.12 14.3"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  "shield-checkmark-outline": (
    <>
      <path d="M336 176 225.2 304 176 255.8" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M463.1 112.37C373.68 96.33 336.71 84.45 256 48c-80.71 36.45-117.68 48.33-207.1 64.37C32.7 369.13 240.58 457.79 256 464c15.42-6.21 223.3-94.87 207.1-351.63"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  "clipboard-outline": (
    <>
      <path
        d="M336 64h32a48 48 0 0 1 48 48v320a48 48 0 0 1-48 48H144a48 48 0 0 1-48-48V112a48 48 0 0 1 48-48h32"
        className="icon-fill-none icon-stroke"
        strokeLinejoin="round"
      />
      <rect width="160" height="64" x="176" y="32" rx="26.13" ry="26.13" className="icon-fill-none icon-stroke" strokeLinejoin="round" />
    </>
  ),
  // Missing icon-stroke here left both arrows fully invisible (fill:none, stroke defaults to
  // none) despite setting strokeWidth — the Export CSV buttons and every trend arrow
  // (LineChart/NarrativeCard/QualysTab) rendered a blank glyph.
  "arrow-down-outline": (
    <path d="m112 268 144 144 144-144M256 392V100" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth="48px" />
  ),
  "arrow-up-outline": (
    <path d="m112 244 144-144 144 144M256 120v292" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth="48px" />
  ),
  "checkmark-outline": <path d="M416 128 192 384l-96-96" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />,
  ellipse: <path d="M256 464c-114.69 0-208-93.31-208-208S141.31 48 256 48s208 93.31 208 208-93.31 208-208 208" />,
  "close-outline": <path d="M368 368 144 144M368 144 144 368" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />,
  "create-outline": (
    <>
      <path
        d="M384 224v184a40 40 0 0 1-40 40H104a40 40 0 0 1-40-40V168a40 40 0 0 1 40-40h167.48"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M459.94 53.25a16.06 16.06 0 0 0-23.22-.56L424.35 65a8 8 0 0 0 0 11.31l11.34 11.32a8 8 0 0 0 11.34 0l12.06-12c6.1-6.09 6.67-16.01.85-22.38M399.34 90 218.82 270.2a9 9 0 0 0-2.31 3.93L208.16 299a3.91 3.91 0 0 0 4.86 4.86l24.85-8.35a9 9 0 0 0 3.93-2.31L422 112.66a9 9 0 0 0 0-12.66l-9.95-10a9 9 0 0 0-12.71 0" />
    </>
  ),
  "trash-outline": (
    <>
      <path
        d="m112 112 20 320c.95 18.49 14.4 32 32 32h184c17.67 0 30.87-13.51 32-32l20-320"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M80 112h352" className="icon-stroke" strokeLinecap="round" strokeMiterlimit="10" />
      <path
        d="M192 112V72h0a23.93 23.93 0 0 1 24-24h80a23.93 23.93 0 0 1 24 24h0v40M256 176v224M184 176l8 224M328 176l-8 224"
        className="icon-fill-none icon-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  "caret-up": <path d="M414 321.94 274.22 158.82a24 24 0 0 0-36.44 0L98 321.94c-13.34 15.57-2.28 39.62 18.22 39.62h279.6c20.5 0 31.56-24.05 18.18-39.62" />,
  "caret-down": <path d="m98 190.06 139.78 163.12a24 24 0 0 0 36.44 0L414 190.06c13.34-15.57 2.28-39.62-18.22-39.62h-279.6c-20.5 0-31.56 24.05-18.18 39.62" />,
  "expand-outline": (
    <path
      d="M432 320v112H320M421.8 421.77 304 304M80 192V80h112M90.2 90.23 208 208M320 80h112v112M421.77 90.2 304 208M192 432H80V320M90.23 421.8 208 304"
      className="icon-fill-none icon-stroke"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "contract-outline": (
    <path
      d="M304 416V304h112M314.2 314.23 432 432M208 96v112H96M197.8 197.77 80 80M416 208H304V96M314.23 197.8 432 80M96 304h112v112M197.77 314.2 80 432"
      className="icon-fill-none icon-stroke"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "chevron-down": <path d="m112 184 144 144 144-144" className="icon-fill-none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="48px" />,
  "chevron-forward": <path d="m184 112 144 144-144 144" className="icon-fill-none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="48px" />,
  "menu-outline": (
    <path d="M80 160h352M80 256h352M80 352h352" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
  ),
  "lock-closed-outline": (
    <>
      <path d="M336 208v-95a80 80 0 0 0-160 0v95" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <rect width="320" height="272" x="96" y="208" rx="48" ry="48" className="icon-fill-none icon-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};
