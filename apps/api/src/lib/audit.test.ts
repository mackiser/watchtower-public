import { describe, expect, it } from "vitest";
import { redactForDemo } from "./audit.js";

// The public demo's shared login is an admin who can read the Audit Log, so nothing identifying a
// visitor may reach it.
describe("redactForDemo", () => {
  it("always drops the IP", () => {
    for (const event of ["login.success", "login.failure", "rate_limit.exceeded", "logout"] as const) {
      expect(redactForDemo(event, { ip: "203.0.113.7", email: "demo@watchtower.dev" })).not.toHaveProperty("ip");
    }
  });

  it("drops typed emails from failed attempts but keeps the demo account's own sign-ins", () => {
    expect(redactForDemo("login.failure", { email: "someone@real.example", ip: "1.2.3.4" })).toEqual({});
    expect(redactForDemo("login.lockout", { email: "x@y.example", minutes: 15 })).toEqual({ minutes: 15 });
    expect(redactForDemo("login.success", { userId: "u1", email: "demo@watchtower.dev", ip: "1.2.3.4" })).toEqual({
      userId: "u1",
      email: "demo@watchtower.dev",
    });
  });

  it("leaves unrelated fields alone", () => {
    expect(redactForDemo("rate_limit.exceeded", { route: "login", ip: "1.2.3.4" })).toEqual({ route: "login" });
  });
});
