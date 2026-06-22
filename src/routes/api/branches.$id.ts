import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, loadResourceScope, requireUser, safeJson, sb } from "./_resource-helpers";
import { branchWriteRow } from "./-branch-helpers";

const emptyBranchDetail = (branch: Record<string, unknown>) => ({
  branch,
  performance: {
    revenue_30d: "0",
    sales_30d: 0,
    avg_sale_30d: "0",
    pending_sales: 0,
    cash_sales: 0,
    momo_sales: 0,
    card_sales: 0,
  },
  inventory: {
    total_products: 0,
    total_units: 0,
    inventory_value: "0",
    out_of_stock: 0,
    low_stock: 0,
  },
  topProducts: [],
  recentSales: [],
});

export const Route = createFileRoute("/api/branches/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("branches")
          .select("*")
          .eq("id", Number(params.id))
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(emptyBranchDetail(data));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb
          .from("branches")
          .update(branchWriteRow(body) as never)
          .eq("id", Number(params.id));
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("*").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Branch not found");
        return json(data);
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb
          .from("branches")
          .delete()
          .eq("id", Number(params.id));
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("id").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Branch not found");
        return json({ ok: true });
      },
    },
  },
});
