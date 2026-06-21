import { createFileRoute } from "@tanstack/react-router";
import { clientIp, errorJson, json, requireAdmin, sb } from "./-security._helpers";

export const Route = createFileRoute("/api/security/locked-users/$id/unlock")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb
          .from("profiles")
          .update({ is_locked: false } as never)
          .eq("id", Number(params.id))
          .select("id,email,name")
          .single();
        if (error) return errorJson(500, error.message);
        await sb.from("audit_logs").insert({
          actor_id: auth.user.id,
          actor_email: auth.user.email,
          action: "ACCOUNT_UNLOCKED",
          entity_type: "profile",
          entity_id: String(data.id),
          entity_name: data.email ?? data.name,
          details: { ip: clientIp(request) },
        } as never);
        return json({ ok: true });
      },
    },
  },
});
