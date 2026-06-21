import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireAdmin, sb } from "./-security._helpers";

type AbuseRow = {
  ip_address: string;
  hit_count: number;
  last_seen: string;
  user_name: string | null;
  user_id: string | null;
  dimension: "ip" | "user";
};

export const Route = createFileRoute("/api/security/api-abuse")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await sb
          .from("audit_logs")
          .select("actor_id,actor_name,actor_email,details,created_at")
          .gte("created_at", weekAgo)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error) return errorJson(500, error.message);

        const ipMap = new Map<string, AbuseRow>();
        const userMap = new Map<string, AbuseRow>();
        for (const row of data ?? []) {
          const details = (row.details ?? {}) as Record<string, unknown>;
          const ip = String(details.ip ?? "unknown");
          const ipRow = ipMap.get(ip) ?? {
            ip_address: ip,
            hit_count: 0,
            last_seen: row.created_at,
            user_name: null,
            user_id: null,
            dimension: "ip",
          };
          ipRow.hit_count += 1;
          if (row.created_at > ipRow.last_seen) ipRow.last_seen = row.created_at;
          ipMap.set(ip, ipRow);
          if (row.actor_id) {
            const userRow = userMap.get(row.actor_id) ?? {
              ip_address: ip,
              hit_count: 0,
              last_seen: row.created_at,
              user_name: row.actor_name ?? row.actor_email ?? null,
              user_id: row.actor_id,
              dimension: "user",
            };
            userRow.hit_count += 1;
            if (row.created_at > userRow.last_seen) userRow.last_seen = row.created_at;
            userMap.set(row.actor_id, userRow);
          }
        }

        const byIp = Array.from(ipMap.values())
          .filter((r) => r.hit_count >= 80)
          .sort((a, b) => b.hit_count - a.hit_count);
        const byUser = Array.from(userMap.values())
          .filter((r) => r.hit_count >= 80)
          .sort((a, b) => b.hit_count - a.hit_count);
        return json({ byIp, byUser });
      },
    },
  },
});
