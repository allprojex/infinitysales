import { ROLE_PRIORITY, type ApiUser } from "./_auth-helpers";

export type LoginPortal = "admin" | "user";

export const ADMIN_PORTAL_DENIED_MESSAGE = "This account does not have administrator access.";
export const USER_PORTAL_DENIED_MESSAGE =
  "Administrator accounts must log in through the administrator portal.";
export const MISSING_ROLE_DENIED_MESSAGE =
  "This account does not have an assigned application role.";

export function parseLoginPortal(value: unknown): LoginPortal {
  return value === "admin" ? "admin" : "user";
}

export function resolveLoginRole(
  roles: Array<string | null | undefined> | null | undefined,
): ApiUser["role"] | null {
  const assigned = new Set(roles ?? []);
  return ROLE_PRIORITY.find((role) => assigned.has(role)) ?? null;
}

export function loginPortalAccessError(
  role: ApiUser["role"] | null,
  portal: LoginPortal,
): string | null {
  if (!role) {
    return MISSING_ROLE_DENIED_MESSAGE;
  }

  if (portal === "admin" && role !== "admin") {
    return ADMIN_PORTAL_DENIED_MESSAGE;
  }

  if (portal === "user" && role === "admin") {
    return USER_PORTAL_DENIED_MESSAGE;
  }

  return null;
}
