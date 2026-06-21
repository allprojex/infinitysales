import { createFileRoute } from "@tanstack/react-router";
import { clientIp, errorJson, json, requireAdmin, sb } from "./-security._helpers";

export const Route = createFileRoute("/api/security/sessions/$userId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const { error } = await sb.from("user_sessions").delete().eq("user_id", params.userId);
        if (error) return errorJson(500, error.message);
        await sb.from("audit_logs").insert({
          actor_id: auth.user.id,
          actor_email: auth.user.email,
          action: "SESSION_REVOKED",
          entity_type: "user_session",
          entity_id: params.userId,
          details: { ip: clientIp(request) },
        } as never);
        return json({ ok: true });
      },
    },
  },
});
