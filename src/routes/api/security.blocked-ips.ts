import { createFileRoute } from "@tanstack/react-router";
import { clientIp, errorJson, json, requireAdmin, sb } from "./-security._helpers";

const isIpv4 = (value: string) =>
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value);

type IpBlockRow = {
  id: number;
  ip_address: string;
  reason: string;
  failed_attempts?: number | null;
  blocked_until?: string | null;
  created_at: string;
};

function mapBlock(row: IpBlockRow) {
  return {
    id: row.id,
    ipAddress: row.ip_address,
    reason: row.reason,
    failedAttempts: row.failed_attempts ?? 0,
    blockedUntil: row.blocked_until ?? null,
    createdAt: row.created_at,
  };
}

export const Route = createFileRoute("/api/security/blocked-ips")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb
          .from("ip_blocks")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) return errorJson(500, error.message);
        return json((data ?? []).map(mapBlock));
      },
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const ip = String(body.ip ?? body.ipAddress ?? "").trim();
        if (!isIpv4(ip)) return errorJson(400, "Valid IPv4 address is required");
        const minutes = Number(body.durationMinutes ?? 0);
        const blockedUntil =
          Number.isFinite(minutes) && minutes > 0
            ? new Date(Date.now() + minutes * 60 * 1000).toISOString()
            : null;
        const { data, error } = await sb
          .from("ip_blocks")
          .upsert(
            {
              user_id: auth.user.id,
              ip_address: ip,
              reason: body.reason ?? "manual_block",
              blocked_until: blockedUntil,
            } as never,
            { onConflict: "user_id,ip_address" },
          )
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        await sb.from("audit_logs").insert({
          actor_id: auth.user.id,
          actor_email: auth.user.email,
          action: "MANUAL_BLOCK",
          entity_type: "security",
          entity_id: ip,
          entity_name: ip,
          details: { ip: clientIp(request), blockedIp: ip },
        } as never);
        return json(mapBlock(data));
      },
    },
  },
});
