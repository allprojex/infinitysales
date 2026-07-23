/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, loadResourceScope, rowToApi, sb } from "./_resource-helpers";
import {
  customerNameMap,
  requireSalesReturnPermission,
  saleReferenceMap,
} from "./-sale-return-helpers";

export const Route = createFileRoute("/api/sales-returns/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireSalesReturnPermission(request, "view");
        if (auth.response) return auth.response;
        const scope = await loadResourceScope(auth.user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = (sb as any)
          .from("sale_returns")
          .select("*, sale_return_lines(*)")
          .eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", auth.user.id);
        const { data, error } = await q.maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Sales return not found");
        const names = await customerNameMap(data.customer_id ? [String(data.customer_id)] : []);
        const refs = await saleReferenceMap([String(data.sale_id)]);
        return json({
          ...rowToApi(data),
          customerName: data.customer_id
            ? (names.get(String(data.customer_id)) ?? null)
            : "Walk-in",
          originalInvoice: refs.get(String(data.sale_id)) ?? data.sale_id,
          lines: (data.sale_return_lines ?? []).map(rowToApi),
        });
      },
    },
  },
});
