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

type RawItem = Record<string, unknown>;
type PurchaseOrderRow = Record<string, unknown>;
type NormalizedItem = {
  productId: unknown;
  productName: string;
  quantity: number;
  unitCost: number;
  total: number;
};

const normalizeItems = (items: RawItem[] = []): NormalizedItem[] =>
  items.map((item) => {
    const quantity = Number(item.quantity ?? item.qty ?? 0) || 0;
    const unitCost = Number(item.unitCost ?? item.unit_cost ?? item.price ?? 0) || 0;
    return {
      productId: item.productId ?? item.product_id ?? null,
      productName: item.productName ?? item.product_name ?? item.name ?? "",
      quantity,
      unitCost,
      total: quantity * unitCost,
    };
  });

const toPurchaseOrderApi = (row: PurchaseOrderRow) => ({
  ...rowToApi(row),
  poNumber: row.reference ?? row.id,
  supplierName: row.supplier_name ?? "",
  expectedDate: row.expected_date ?? null,
  receivedDate: row.received_date ?? null,
  items: normalizeItems(Array.isArray(row.items) ? (row.items as RawItem[]) : []),
});

export const Route = createFileRoute("/api/purchase-orders/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("purchase_orders")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(toPurchaseOrderApi(data));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const update: Record<string, unknown> = apiToRow(body);
        if (Array.isArray(body.items)) {
          update.items = normalizeItems(body.items);
          update.subtotal = +(update.items as NormalizedItem[])
            .reduce((sum, item) => sum + Number(item.total ?? 0), 0)
            .toFixed(2);
          update.total = update.subtotal;
        }
        const { data, error } = await sb
          .from("purchase_orders")
          .update(update as never)
          .eq("user_id", user.id)
          .eq("id", params.id)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(toPurchaseOrderApi(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { error } = await sb
          .from("purchase_orders")
          .delete()
          .eq("user_id", user.id)
          .eq("id", params.id);
        if (error) return errorJson(500, error.message);
        return json({ ok: true });
      },
    },
  },
});
