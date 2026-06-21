import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireAdmin, sb, securitySettingsDefaults } from "./-security._helpers";

export const Route = createFileRoute("/api/security/mfa-settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb
          .from("user_settings")
          .select("data")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        return json({
          ...securitySettingsDefaults,
          ...((data?.data as Record<string, string>) ?? {}),
        });
      },
      PUT: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const { data: existing, error: getError } = await sb
          .from("user_settings")
          .select("data")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (getError) return errorJson(500, getError.message);
        const allowed = new Set(Object.keys(securitySettingsDefaults));
        const patch = Object.fromEntries(
          Object.entries(body)
            .filter(([key]) => allowed.has(key))
            .map(([key, value]) => [key, String(value)]),
        );
        const merged = { ...((existing?.data as Record<string, unknown>) ?? {}), ...patch };
        const { error } = await sb
          .from("user_settings")
          .upsert({ user_id: auth.user.id, data: merged } as never, { onConflict: "user_id" });
        if (error) return errorJson(500, error.message);
        return json({ ...securitySettingsDefaults, ...merged });
      },
    },
  },
});
