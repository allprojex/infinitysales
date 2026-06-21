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

export const Route = createFileRoute("/api/suppliers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, page, offset, search } = parseQuery(request);
        let q = sb
          .from("suppliers")
          .select("*", { count: "exact" })
          .order("id", { ascending: false })
          .range(offset, offset + limit - 1);
        if (search) q = q.ilike("name", `%${search}%`);
        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        return json({
          data: (data ?? []).map(rowToApi),
          total: count ?? data?.length ?? 0,
          page,
          limit,
        });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.name) return errorJson(400, "name is required");
        const { data, error } = await sb
          .from("suppliers")
          .insert({ ...apiToRow(body), user_id: user.id } as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(rowToApi(data));
      },
    },
  },
});
