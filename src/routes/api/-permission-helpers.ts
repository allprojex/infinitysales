import { errorJson, requireUser, sb } from "./_resource-helpers";

const isPermissionKey = (key: string) =>
  key.startsWith("perm_user_") || key.startsWith("perm_purchase_returns_");

export async function globalUserPermissions() {
  const { data: admins, error: roleError } = await sb
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1);
  if (roleError) throw roleError;
  const adminId = admins?.[0]?.user_id;
  if (!adminId) return {} as Record<string, unknown>;
  const { data, error } = await sb
    .from("user_settings")
    .select("data")
    .eq("user_id", adminId)
    .maybeSingle();
  if (error) throw error;
  const settings = data?.data && typeof data.data === "object" && !Array.isArray(data.data)
    ? (data.data as Record<string, unknown>)
    : {};
  return Object.fromEntries(Object.entries(settings).filter(([key]) => isPermissionKey(key)));
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
    return allowed
      ? auth
      : { user: null, response: errorJson(403, `${key} permission required`) };
  } catch (permissionError) {
    return {
      user: null,
      response: errorJson(500, permissionError instanceof Error ? permissionError.message : "Permission check failed"),
    };
  }
}

export { isPermissionKey };
