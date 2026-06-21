import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireAdmin, sb, securitySettingsDefaults } from "./-security._helpers";

export const Route = createFileRoute("/api/security/compliance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const [
          { data: settingsRow, error: settingsError },
          { count: lockedCount, error: lockedError },
          { count: admin2faCount, error: adminsError },
        ] = await Promise.all([
          sb.from("user_settings").select("data").eq("user_id", auth.user.id).maybeSingle(),
          sb.from("profiles").select("id", { count: "exact", head: true }).eq("is_locked", true),
          sb
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("two_factor_enabled", true),
        ]);
        const error = settingsError ?? lockedError ?? adminsError;
        if (error) return errorJson(500, error.message);

        const settings = {
          ...securitySettingsDefaults,
          ...((settingsRow?.data as Record<string, string>) ?? {}),
        };
        const checks = [
          {
            id: "admin_2fa_policy",
            label: "Admin two-factor policy is configured",
            pass: settings.sec_require_2fa_admin === "true" || (admin2faCount ?? 0) > 0,
            severity: "high",
          },
          {
            id: "lockout_threshold",
            label: "Failed-login lockout threshold is set",
            pass: Number(settings.sec_lockout_threshold) > 0,
            severity: "medium",
          },
          {
            id: "locked_accounts_reviewed",
            label: "No currently locked accounts require review",
            pass: (lockedCount ?? 0) === 0,
            severity: "low",
          },
        ];
        const passed = checks.filter((c) => c.pass).length;
        return json({
          checks,
          passed,
          total: checks.length,
          score: Math.round((passed / checks.length) * 100),
        });
      },
    },
  },
});
