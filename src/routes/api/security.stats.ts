import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireAdmin, sb, severityForAction } from "./-security._helpers";

export const Route = createFileRoute("/api/security/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const sessionCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const [
          { count: eventsLast24h, error: eventsErr },
          { data: auditRows, error: auditErr },
          { count: blockedIps, error: blocksErr },
          { count: activeSessions, error: sessionsErr },
        ] = await Promise.all([
          sb
            .from("audit_logs")
            .select("id", { count: "exact", head: true })
            .gte("created_at", dayAgo),
          sb
            .from("audit_logs")
            .select("action,status,created_at")
            .gte("created_at", weekAgo)
            .order("created_at", { ascending: false })
            .limit(500),
          sb.from("ip_blocks").select("id", { count: "exact", head: true }),
          sb
            .from("user_sessions")
            .select("id", { count: "exact", head: true })
            .gte("last_seen", sessionCutoff),
        ]);

        const error = eventsErr ?? auditErr ?? blocksErr ?? sessionsErr;
        if (error) return errorJson(500, error.message);

        const byTypeMap = new Map<string, { event_type: string; severity: string; n: number }>();
        const timelineMap = new Map<string, { day: string; severity: string; n: number }>();
        let criticalLast24h = 0;

        for (const row of auditRows ?? []) {
          const eventType = String(row.action ?? "AUDIT_EVENT").toUpperCase();
          const severity = row.status === "failed" ? "critical" : severityForAction(row.action);
          if (severity === "critical" && row.created_at >= dayAgo) criticalLast24h += 1;
          const typeKey = `${eventType}:${severity}`;
          byTypeMap.set(typeKey, {
            event_type: eventType,
            severity,
            n: (byTypeMap.get(typeKey)?.n ?? 0) + 1,
          });
          const day = String(row.created_at).slice(0, 10);
          const timeKey = `${day}:${severity}`;
          timelineMap.set(timeKey, {
            day,
            severity,
            n: (timelineMap.get(timeKey)?.n ?? 0) + 1,
          });
        }

        return json({
          eventsLast24h: eventsLast24h ?? 0,
          criticalLast24h,
          blockedIps: blockedIps ?? 0,
          activeSessions: activeSessions ?? 0,
          byType: Array.from(byTypeMap.values()),
          timeline: Array.from(timelineMap.values()).sort((a, b) => a.day.localeCompare(b.day)),
        });
      },
    },
  },
});
