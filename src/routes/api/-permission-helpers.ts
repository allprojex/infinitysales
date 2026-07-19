import { errorJson, requireUser, sb } from "./_resource-helpers";

const isPermissionKey = (key: string) =>
  key.startsWith("perm_user_") || key.startsWith("perm_purchase_returns_");

export async function globalUserPermissions() {
  const { data: admins, error: roleError } = await sb
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (roleError) throw roleError;
  const adminIds = [...new Set((admins ?? []).map((row) => row.user_id).filter(Boolean))];
  if (adminIds.length === 0) return {} as Record<string, unknown>;
  const { data, error } = await sb
    .from("user_settings")
    .select("data,updated_at")
    .in("user_id", adminIds)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  // Multiple administrator accounts can exist. Use the most recently updated
  // admin settings row that actually contains permission configuration instead
  // of selecting an arbitrary admin role row.
  for (const row of data ?? []) {
    const settings =
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : {};
    const permissions = Object.fromEntries(
      Object.entries(settings).filter(([key]) => isPermissionKey(key)),
    );
    if (Object.keys(permissions).length > 0) return permissions;
  }
  return {} as Record<string, unknown>;
}

export async function requirePermission(request: Request, key: string, defaultAllow = false) {
  const auth = await requireUser(request);
  if (auth.response) return auth;
  const { data: roles, error } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id);
  if (error) return { user: null, response: errorJson(500, error.message) };
  if ((roles ?? []).some((row) => row.role === "admin")) return auth;
  try {
    const permissions = await globalUserPermissions();
    const value = permissions[key];
    const allowed = value == null ? defaultAllow : value !== false && value !== "false";
    return allowed ? auth : { user: null, response: errorJson(403, `${key} permission required`) };
  } catch (permissionError) {
    return {
      user: null,
      response: errorJson(
        500,
        permissionError instanceof Error ? permissionError.message : "Permission check failed",
      ),
    };
  }
}

export { isPermissionKey };
