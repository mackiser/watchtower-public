import { extendTailwindMerge } from "tailwind-merge";

// The config extends Tailwind's fontSize scale with 3xs/2xs/md; teach the merger those names so
// e.g. `text-xs` on a primitive is correctly overridden by a caller's `text-2xs` (and font-size
// classes never clobber color classes like `text-ink`).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["3xs", "2xs", "md"] }],
    },
  },
});

/** Join class fragments, skipping falsy ones, resolving Tailwind conflicts caller-wins. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
