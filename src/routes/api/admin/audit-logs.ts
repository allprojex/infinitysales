import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin, parseQuery, errorJson, sb } from "../_resource-helpers";

export const Route = createFileRoute("/api/admin/audit-logs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireAdmin(request);
        if (!user) return response;
        const { page, limit, offset, search, params } = parseQuery(request);
        const entityType = params.get("entityType");
        let q = sb
          .from("audit_logs")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (entityType) q = q.eq("entity_type", entityType);
        if (search) {
          q = q.or(
            `action.ilike.%${search}%,actor_name.ilike.%${search}%,actor_email.ilike.%${search}%,entity_name.ilike.%${search}%`,
          );
        }
        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        const rows = (data ?? []).map((r: any) => ({
          id: r.id,
          actorId: r.actor_id,
          actorName: r.actor_name,
          actorEmail: r.actor_email,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          entityName: r.entity_name,
          status: r.status,
          details: r.details,
          createdAt: r.created_at,
        }));
        return json({ data: rows, total: count ?? rows.length, page, limit });
      },
    },
  },
});
