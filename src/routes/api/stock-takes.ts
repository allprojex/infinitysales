import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  listCreateHandlers,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";
import { resolveWarehouseUuid } from "./-stock-helpers";

const { GET } = listCreateHandlers({ table: "stock_takes", searchColumns: ["reference", "notes"] });

export const Route = createFileRoute("/api/stock-takes")({
  server: {
    handlers: {
      GET,
      // Custom POST (instead of the generic listCreateHandlers factory):
      // warehouseId arrives from the UI as the warehouse's numeric id (see
      // stock-take.tsx), but stock_takes.warehouse_id is a uuid column.
      // resolveWarehouseUuid() accepts either form and resolves it correctly
      // - the generic factory's plain apiToRow()+insert() does not, and was
      // inserting the raw numeric id straight into the uuid column, failing
      // with "invalid input syntax for type uuid" on every scoped stock take.
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const row = apiToRow(body) as Record<string, unknown>;
        if (row.warehouse_id != null && row.warehouse_id !== "") {
          const resolved = await resolveWarehouseUuid(user.id, row.warehouse_id);
          if (resolved.error) return errorJson(400, resolved.error);
          row.warehouse_id = resolved.warehouseId;
        } else {
          row.warehouse_id = null;
        }
        const { data, error } = await sb
          .from("stock_takes")
          .insert({ ...row, user_id: user.id } as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(rowToApi(data));
      },
    },
  },
});
