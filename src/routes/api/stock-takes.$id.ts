import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  itemHandlers,
  json,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";
import { resolveWarehouseUuid } from "./-stock-helpers";

const { GET, DELETE } = itemHandlers({ table: "stock_takes" });

export const Route = createFileRoute("/api/stock-takes/$id")({
  server: {
    handlers: {
      GET,
      DELETE,
      // Custom PUT - see stock-takes.ts POST for why warehouseId needs
      // resolveWarehouseUuid() instead of the generic factory's plain
      // apiToRow()+update().
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const row = apiToRow(body) as Record<string, unknown>;
        if (row.warehouse_id !== undefined) {
          if (row.warehouse_id == null || row.warehouse_id === "") {
            row.warehouse_id = null;
          } else {
            const resolved = await resolveWarehouseUuid(user.id, row.warehouse_id);
            if (resolved.error) return errorJson(400, resolved.error);
            row.warehouse_id = resolved.warehouseId;
          }
        }
        const { data, error } = await sb
          .from("stock_takes")
          .update(row as never)
          .eq("user_id", user.id)
          .eq("id", params.id)
          .select("*")
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(rowToApi(data));
      },
    },
  },
});
