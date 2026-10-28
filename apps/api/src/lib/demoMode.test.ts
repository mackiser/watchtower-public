import { describe, expect, it } from "vitest";
import { blocksDemoWrite } from "./demoMode.js";

describe("blocksDemoWrite", () => {
  it("lets reads through", () => {
    expect(blocksDemoWrite("GET", "/api/clients")).toBe(false);
    expect(blocksDemoWrite("head", "/api/clients/abc")).toBe(false);
  });

  it("allows only sign-in and sign-out writes", () => {
    for (const p of ["/api/auth/login", "/api/auth/login/mfa", "/api/auth/logout", "/api/auth/logout/"]) {
      expect(blocksDemoWrite("POST", p)).toBe(false);
    }
  });

  it("blocks every other write, including password changes and user management", () => {
    expect(blocksDemoWrite("POST", "/api/auth/password")).toBe(true);
    expect(blocksDemoWrite("PATCH", "/api/clients/abc/goals")).toBe(true);
    expect(blocksDemoWrite("DELETE", "/api/users/u1")).toBe(true);
    expect(blocksDemoWrite("PUT", "/api/clients/abc/ispm")).toBe(true);
  });
});
