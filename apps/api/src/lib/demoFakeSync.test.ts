import { describe, expect, it } from "vitest";
import { seededJitter } from "./demoFakeSync.js";

describe("seededJitter", () => {
  it("is deterministic for the same key", () => {
    expect(seededJitter("client1:2026-09-05", 0.06)).toBe(seededJitter("client1:2026-09-05", 0.06));
  });

  it("stays within the requested amplitude", () => {
    for (const key of ["a", "b", "Summit Credit Union:2026-09-05", "Northgate Foods:2026-09-06"]) {
      const j = seededJitter(key, 0.06);
      expect(j).toBeGreaterThanOrEqual(-0.06);
      expect(j).toBeLessThanOrEqual(0.06);
    }
  });

  it("varies across days for the same client, so the series doesn't flatline", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
    const values = days.map((d) => seededJitter(`client1:${d}`, 0.06));
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});
