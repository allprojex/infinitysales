import { describe, expect, it } from "vitest";

import { loginPortalAccessError, parseLoginPortal } from "./-auth-role-helpers";

describe("auth role portal policy", () => {
  it("requires admin role for the administrator login portal", () => {
    expect(loginPortalAccessError("admin", "admin")).toBeNull();
    expect(loginPortalAccessError("user", "admin")).toBe(
      "This account does not have administrator access.",
    );
    expect(loginPortalAccessError("manager", "admin")).toBe(
      "This account does not have administrator access.",
    );
  });

  it("does not treat the user portal as an administrator grant", () => {
    expect(loginPortalAccessError("admin", "user")).toBeNull();
    expect(loginPortalAccessError("user", "user")).toBeNull();
  });

  it("defaults missing or invalid portal values to the user portal", () => {
    expect(parseLoginPortal("admin")).toBe("admin");
    expect(parseLoginPortal("user")).toBe("user");
    expect(parseLoginPortal(undefined)).toBe("user");
    expect(parseLoginPortal("administrator")).toBe("user");
  });
});
