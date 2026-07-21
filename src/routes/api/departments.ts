import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  parseQuery,
  requireHrmAccess,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";

// Departments are company-wide HRM data, like employees -- any account with
// HRM access sees the same list, not just ones its own account created.
export const Route = createFileRoute("/api/departments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const { limit, page, offset, search } = parseQuery(request);
        let q = sb
          .from("departments")
          .select("*", { count: "exact" })
          .order("name", { ascending: true })
          .range(offset, offset + limit - 1);
        if (search)
          q = q.or(`name.ilike.%${search}%,head_name.ilike.%${search}%,location.ilike.%${search}%`);
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
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.name) return errorJson(400, "name is required");
        const row = { ...apiToRow(body), user_id: user.id };
        const { data, error } = await sb
          .from("departments")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(rowToApi(data));
      },
    },
  },
});
