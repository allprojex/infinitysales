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

// Employees are a shared company roster, like products/customers/warehouses
// -- any account with HRM access sees the same staff list, not just
// employees its own account happened to create. Confirmed live: a cashier
// account granted HRM access saw "No employees yet" against a business that
// already had 6.
export const Route = createFileRoute("/api/employees")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const { limit, page, offset, search, params } = parseQuery(request);
        let q = sb
          .from("employees")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (search)
          q = q.or(
            `name.ilike.%${search}%,email.ilike.%${search}%,department.ilike.%${search}%,job_title.ilike.%${search}%`,
          );
        for (const f of ["department", "status"]) {
          const v = params.get(f);
          if (v != null && v !== "") q = q.eq(f, v);
        }
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
          .from("employees")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(rowToApi(data));
      },
    },
  },
});
