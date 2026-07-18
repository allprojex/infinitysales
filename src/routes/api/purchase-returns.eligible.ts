import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, loadResourceScope, sb } from "./_resource-helpers";
import { requireReturnPermission, returnableItems } from "./-purchase-return-helpers";

export const Route = createFileRoute("/api/purchase-returns/eligible")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireReturnPermission(request, "create");
        if (auth.response) return auth.response;
        const url = new URL(request.url);
        const id = url.searchParams.get("purchaseOrderId");
        if (id) {
          const result = await returnableItems(id, auth.user.id);
          if (result.error) return errorJson(400, result.error);
          return json({ purchase: result.order, items: result.items });
        }
        const scope = await loadResourceScope(auth.user.id);
        let q = sb
          .from("purchase_orders")
          .select("*")
          .eq("status", "received")
          .order("received_date", { ascending: false })
          .limit(100);
        if (!scope.isPrivileged) q = q.eq("user_id", auth.user.id);
        const search = url.searchParams.get("search");
        if (search)
          q = q.or(
            `reference.ilike.%${search}%,supplier_name.ilike.%${search}%,notes.ilike.%${search}%`,
          );
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        return json({ data: data ?? [] });
      },
    },
  },
});
