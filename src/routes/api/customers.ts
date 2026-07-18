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

export const Route = createFileRoute("/api/customers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, page, offset, search } = parseQuery(request);
        // Customers are a shared business directory. Authentication still applies,
        // while user_id continues to record who created each customer.
        let q = sb
          .from("customers")
          .select("*", { count: "exact" })
          .order("name", { ascending: true })
          .range(offset, offset + limit - 1);
        if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        return json({ data: (data ?? []).map(rowToApi), total: count ?? 0, page, limit });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.name || !body?.email) return errorJson(400, "name and email are required");
        const customerRow = { ...apiToRow(body), user_id: user.id };
        const { data, error } = await sb
          .from("customers")
          .insert(customerRow as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(rowToApi(data));
      },
    },
  },
});
