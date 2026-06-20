import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "./_resource-helpers";

// Move audit-log entries older than `olderThanDays` to the recycle bin.
export const Route = createFileRoute("/api/admin/audit-logs/purge-to-bin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const days = Math.max(1, Number(body.olderThanDays ?? 90));
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Audit logs are not currently persisted per-user, so this is a no-op
        // returning a uniform response shape. Real purge logic plugs in here.
        await sb.from("recycle_bin").insert({
          user_id: auth.user.id,
          entity_type: "audit-log-purge",
          entity_id: cutoff,
          entity_name: `Purge marker (${days}d)`,
          entity_data: { cutoff, days },
        });
        return json({ message: "Audit log purge marker created.", count: 0 });
      },
    },
  },
});
