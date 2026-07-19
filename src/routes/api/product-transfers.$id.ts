import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";
import { resolveWarehouse, warehouseUuid } from "./-stock-helpers";

export const Route = createFileRoute("/api/product-transfers/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("product_transfers")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(rowToApi(data));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const update: Record<string, unknown> = apiToRow(body);

        if (body.fromWarehouseId != null || body.from_warehouse_id != null) {
          const resolved = await resolveWarehouse(
            user.id,
            body.fromWarehouseId ?? body.from_warehouse_id,
          );
          if (resolved.error) return errorJson(400, resolved.error);
          update.from_warehouse_id = warehouseUuid(resolved.warehouse);
        }
        if (body.toWarehouseId != null || body.to_warehouse_id != null) {
          const resolved = await resolveWarehouse(
            user.id,
            body.toWarehouseId ?? body.to_warehouse_id,
          );
          if (resolved.error) return errorJson(400, resolved.error);
          update.to_warehouse_id = warehouseUuid(resolved.warehouse);
        }

        const { data, error } = await sb
          .from("product_transfers")
          .update(update as never)
          .eq("user_id", user.id)
          .eq("id", params.id)
          .select("*")
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(rowToApi(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("product_transfers")
          .delete()
          .eq("user_id", user.id)
          .eq("id", params.id)
          .select("id")
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json({ ok: true });
      },
    },
  },
});
