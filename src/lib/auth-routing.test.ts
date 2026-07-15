import { describe, expect, it } from "vitest";

import {
  ADMIN_LOGIN_PATH,
  DASHBOARD_PATH,
  USER_LOGIN_PATH,
  postLoginPath,
  protectedRouteRedirect,
} from "./auth-routing";

describe("auth routing", () => {
  it("sends unauthenticated admin-only routes to the administrator login", () => {
    expect(
      protectedRouteRedirect({
        isLoading: false,
        permissionsLoading: false,
        isAuthenticated: false,
        role: null,
        adminOnly: true,
        adminOrManager: false,
        permissionDenied: false,
      }),
    ).toBe(ADMIN_LOGIN_PATH);
  });

  it("sends unauthenticated user routes to the user login", () => {
    expect(
      protectedRouteRedirect({
        isLoading: false,
        permissionsLoading: false,
        isAuthenticated: false,
        role: null,
        adminOnly: false,
        adminOrManager: false,
        permissionDenied: false,
      }),
    ).toBe(USER_LOGIN_PATH);
  });

  it("blocks normal users from admin-only routes", () => {
    expect(
      protectedRouteRedirect({
        isLoading: false,
        permissionsLoading: false,
        isAuthenticated: true,
        role: "user",
        adminOnly: true,
        adminOrManager: false,
        permissionDenied: false,
      }),
    ).toBe(DASHBOARD_PATH);
  });

  it("waits for role and permission loading before redirecting", () => {
    expect(
      protectedRouteRedirect({
        isLoading: true,
        permissionsLoading: false,
        isAuthenticated: false,
        role: null,
        adminOnly: true,
        adminOrManager: false,
        permissionDenied: false,
      }),
    ).toBeNull();

    expect(
      protectedRouteRedirect({
        isLoading: false,
        permissionsLoading: true,
        isAuthenticated: true,
        role: "user",
        adminOnly: false,
        adminOrManager: false,
        permissionDenied: true,
      }),
    ).toBeNull();
  });

  it("keeps administrators on the existing administrator dashboard route", () => {
    expect(postLoginPath("admin")).toBe(DASHBOARD_PATH);
    expect(postLoginPath("user")).toBe(DASHBOARD_PATH);
  });
});
