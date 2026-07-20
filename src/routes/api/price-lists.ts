import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  parseQuery,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";

export const Route = createFileRoute("/api/price-lists")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, page, offset, search, params } = parseQuery(request);
        let q = sb
          .from("price_lists")
          .select("*", { count: "exact" })
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (search) q = q.ilike("name", `%${search}%`);
        const isActive = params.get("isActive");
        if (isActive != null && isActive !== "") q = q.eq("is_active", isActive === "true");

        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        const lists = (data ?? []) as Record<string, unknown>[];

        const listIds = lists.map((l) => l.id);
        const counts = new Map<string, number>();
        if (listIds.length) {
          const { data: itemRows, error: itemError } = await (sb as any)
            .from("price_list_items")
            .select("price_list_id")
            .eq("user_id", user.id)
            .in("price_list_id", listIds);
          if (itemError) return errorJson(500, itemError.message);
          for (const row of itemRows ?? []) {
            const key = String(row.price_list_id);
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }

        return json({
          data: lists.map((row) => ({
            ...rowToApi(row),
            itemCount: counts.get(String(row.id)) ?? 0,
          })),
          total: count ?? lists.length,
          page,
          limit,
        });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.name) return errorJson(400, "name is required");

        const row = { ...apiToRow(body), user_id: user.id };
        const { data, error } = await sb
          .from("price_lists")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);

        // Exactly one price list may be the default at a time, same pattern
        // as warehouses.is_default (ISSUE-004).
        if ((data as any)?.is_default) {
          const { error: unsetError } = await sb
            .from("price_lists")
            .update({ is_default: false } as never)
            .eq("user_id", user.id)
            .neq("id", (data as any).id);
          if (unsetError) return errorJson(500, unsetError.message);
        }

        return json({ ...rowToApi(data), itemCount: 0 });
      },
    },
  },
});
