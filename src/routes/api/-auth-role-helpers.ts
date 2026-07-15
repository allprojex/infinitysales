import type { ApiUser } from "./_auth-helpers";

export type LoginPortal = "admin" | "user";

export function parseLoginPortal(value: unknown): LoginPortal {
  return value === "admin" ? "admin" : "user";
}

export function loginPortalAccessError(role: ApiUser["role"], portal: LoginPortal): string | null {
  if (portal === "admin" && role !== "admin") {
    return "This account does not have administrator access.";
  }

  return null;
}
