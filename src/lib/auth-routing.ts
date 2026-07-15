export type AppRole = "admin" | "manager" | "cashier" | "accountant" | "user";

export const USER_LOGIN_PATH = "/login";
export const ADMIN_LOGIN_PATH = "/admin/login";
export const ADMIN_DASHBOARD_PATH = "/dashboard";
export const USER_DASHBOARD_PATH = "/dashboard";
export const DASHBOARD_PATH = USER_DASHBOARD_PATH;

export function postLoginPath(role: AppRole | null | undefined): string {
  // The existing dashboard renders the administrator view when the resolved
  // database role is admin, including the administration navigation.
  return role === "admin" ? ADMIN_DASHBOARD_PATH : USER_DASHBOARD_PATH;
}

export function protectedRouteRedirect({
  isLoading,
  permissionsLoading,
  isAuthenticated,
  role,
  adminOnly,
  adminOrManager,
  permissionDenied,
}: {
  isLoading: boolean;
  permissionsLoading: boolean;
  isAuthenticated: boolean;
  role: AppRole | null | undefined;
  adminOnly: boolean;
  adminOrManager: boolean;
  permissionDenied: boolean;
}): string | null {
  if (isLoading || permissionsLoading) return null;
  if (!isAuthenticated) return adminOnly ? ADMIN_LOGIN_PATH : USER_LOGIN_PATH;
  if (adminOnly && role !== "admin") return DASHBOARD_PATH;
  if (adminOrManager && role !== "admin" && role !== "manager") return DASHBOARD_PATH;
  if (permissionDenied) return DASHBOARD_PATH;
  return null;
}
