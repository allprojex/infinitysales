import { describe, expect, it } from "vitest";

import {
  ADMIN_PORTAL_DENIED_MESSAGE,
  MISSING_ROLE_DENIED_MESSAGE,
  USER_PORTAL_DENIED_MESSAGE,
  loginPortalAccessError,
  parseLoginPortal,
  resolveLoginRole,
} from "./-auth-role-helpers";

describe("auth role portal policy", () => {
  it("requires admin role for the administrator login portal", () => {
    expect(loginPortalAccessError("admin", "admin")).toBeNull();
    expect(loginPortalAccessError("user", "admin")).toBe(ADMIN_PORTAL_DENIED_MESSAGE);
    expect(loginPortalAccessError("cashier", "admin")).toBe(ADMIN_PORTAL_DENIED_MESSAGE);
    expect(loginPortalAccessError("manager", "admin")).toBe(ADMIN_PORTAL_DENIED_MESSAGE);
  });

  it("denies administrators on the user login portal", () => {
    expect(loginPortalAccessError("admin", "user")).toBe(USER_PORTAL_DENIED_MESSAGE);
    expect(loginPortalAccessError("user", "user")).toBeNull();
    expect(loginPortalAccessError("cashier", "user")).toBeNull();
    expect(loginPortalAccessError("accountant", "user")).toBeNull();
    expect(loginPortalAccessError("manager", "user")).toBeNull();
  });

  it("denies missing or unrecognized roles safely", () => {
    expect(resolveLoginRole([])).toBeNull();
    expect(resolveLoginRole(["staff"])).toBeNull();
    expect(loginPortalAccessError(null, "user")).toBe(MISSING_ROLE_DENIED_MESSAGE);
  });

  it("defaults missing or invalid portal values to the user portal", () => {
    expect(parseLoginPortal("admin")).toBe("admin");
    expect(parseLoginPortal("user")).toBe("user");
    expect(parseLoginPortal(undefined)).toBe("user");
    expect(parseLoginPortal("administrator")).toBe("user");
  });
});
