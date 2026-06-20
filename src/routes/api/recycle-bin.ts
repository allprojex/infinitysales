import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, parseQuery, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/recycle-bin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { limit, page, offset, params } = parseQuery(request);
        const entityType = params.get("entityType");
        let q = sb.from("recycle_bin").select("*", { count: "exact" }).eq("user_id", auth.user.id);
        if (entityType && entityType !== "all") q = q.eq("entity_type", entityType);
        const { data, count, error } = await q.order("deleted_at", { ascending: false }).range(offset, offset + limit - 1);
        if (error) return json({ message: error.message }, { status: 500 });
        const out = (data || []).map((r: any) => ({
          id: r.id,
          entityType: r.entity_type,
          entityId: r.entity_id,
          entityName: r.entity_name,
          entityData: r.entity_data || {},
          deletedById: r.deleted_by_id,
          deletedByName: r.deleted_by_name,
          deletedAt: r.deleted_at,
        }));
        return json({ data: out, total: count ?? 0, page, limit });
      },
      DELETE: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { error } = await sb.from("recycle_bin").delete().eq("user_id", auth.user.id);
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ success: true });
      },
    },
  },
});
