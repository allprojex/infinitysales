import { createFileRoute } from "@tanstack/react-router";
import { clientIp, errorJson, json, requireAdmin, sb } from "./-security._helpers";

export const Route = createFileRoute("/api/security/blocked-ips/$ip")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const ip = decodeURIComponent(params.ip);
        const { error } = await sb.from("ip_blocks").delete().eq("ip_address", ip);
        if (error) return errorJson(500, error.message);
        await sb.from("audit_logs").insert({
          actor_id: auth.user.id,
          actor_email: auth.user.email,
          action: "IP_UNBLOCKED",
          entity_type: "security",
          entity_id: ip,
          entity_name: ip,
          details: { ip: clientIp(request), unblockedIp: ip },
        } as never);
        return json({ ok: true });
      },
    },
  },
});
