import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireAdmin, sb, severityForAction } from "./-security._helpers";

type AuditRow = {
  id: string;
  action?: string | null;
  status?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  entity_name?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
};

export const Route = createFileRoute("/api/security/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        const url = new URL(request.url);
        const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 30), 1), 100);
        const offset = (page - 1) * limit;
        const eventType = url.searchParams.get("eventType");
        const severity = url.searchParams.get("severity");
        const ip = url.searchParams.get("ip")?.trim().toLowerCase();

        let q = sb
          .from("audit_logs")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (eventType && eventType !== "all") q = q.ilike("action", `%${eventType}%`);

        const { data, count, error } = await q;
        if (error) return errorJson(500, error.message);

        const rows = (data ?? [])
          .map((row: AuditRow) => {
            const sev = row.status === "failed" ? "critical" : severityForAction(row.action);
            return {
              id: row.id,
              eventType: String(row.action ?? "AUDIT_EVENT").toUpperCase(),
              severity: sev,
              ipAddress: row.details?.ip ?? null,
              userId: row.actor_id ?? null,
              userName: row.actor_name ?? row.actor_email ?? null,
              endpoint: row.entity_type ?? null,
              details: row.entity_name ?? row.entity_id ?? null,
              createdAt: row.created_at,
              metadata: row.details ?? {},
            };
          })
          .filter((row) => !severity || severity === "all" || row.severity === severity)
          .filter((row) => {
            if (!ip) return true;
            const rowIp = String(row.ipAddress ?? "").toLowerCase();
            const userName = String(row.userName ?? "").toLowerCase();
            return rowIp.includes(ip) || userName.includes(ip);
          });

        return json({ data: rows, total: count ?? rows.length, page, limit });
      },
    },
  },
});
