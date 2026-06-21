import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, json, requireAdmin } from "./_resource-helpers";

export { errorJson, json, requireAdmin };

export const securitySettingsDefaults: Record<string, string> = {
  sec_require_2fa_admin: "false",
  sec_require_2fa_manager: "false",
  sec_require_2fa_cashier: "false",
  sec_require_2fa_accountant: "false",
  sec_require_2fa_user: "false",
  sec_lockout_threshold: "5",
  sec_lockout_duration_minutes: "30",
  sec_session_timeout_minutes: "0",
};

export const sb = supabaseAdmin;

export function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export function rowRole(
  roleRows: Array<{ user_id: string; role: string }> | null | undefined,
  userId: string,
) {
  return roleRows?.find((r) => r.user_id === userId)?.role ?? "user";
}

export function severityForAction(action: string | null | undefined) {
  const value = String(action ?? "").toUpperCase();
  if (value.includes("DELETE") || value.includes("LOCK") || value.includes("BLOCK")) return "high";
  if (value.includes("UPDATE") || value.includes("RESTORE")) return "medium";
  return "low";
}
