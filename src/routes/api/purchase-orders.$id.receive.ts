import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, rowToApi, errorJson } from "./_resource-helpers";
import { notify } from "./_notify";
import { adjustProductStock, recordStockMovement, numberOrZero } from "./-stock-helpers";

type RawItem = Record<string, unknown>;

function receiveItems(items: unknown) {
  if (!Array.isArray(items)) return [];
  return (items as RawItem[])
    .map((item) => ({
      productId: item.productId ?? item.product_id,
      quantity: Number(item.quantity ?? item.qty ?? 0) || 0,
    }))
    .filter((item) => item.productId && item.quantity > 0);
}

async function applyReceivedStock(
  userId: string,
  purchaseOrderId: string,
  warehouseId: string | null,
  items: ReturnType<typeof receiveItems>,
) {
  for (const item of items) {
    const { data: product, error: readError } = await sb
      .from("products")
      .select("id,cost")
      .eq("id", item.productId as never)
      .maybeSingle();
    if (readError) return readError.message;
    if (!product) return `Product ${String(item.productId)} was not found`;

    const stockError = await adjustProductStock(String(item.productId), item.quantity);
    if (stockError) return stockError;

    const movement = await recordStockMovement({
      userId,
      productId: String(item.productId),
      warehouseId,
      movementType: "purchase_receipt",
      quantity: item.quantity,
      unitCost: numberOrZero((product as Record<string, unknown>).cost),
      referenceType: "purchase_order",
      referenceId: purchaseOrderId,
      reason: "Purchase order received",
      createdBy: userId,
    });
    if (movement.error) return movement.error;
  }
  return null;
}

export const Route = createFileRoute("/api/purchase-orders/$id/receive")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data: existing, error: readError } = await sb
          .from("purchase_orders")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("id", params.id)
          .maybeSingle();
        if (readError) return errorJson(500, readError.message);
        if (!existing) return errorJson(404, "Purchase order not found");
        if (existing.status === "received") return json(rowToApi(existing));

        const stockError = await applyReceivedStock(
          auth.user.id,
          params.id,
          ((existing as Record<string, unknown>).warehouse_id ?? null) as string | null,
          receiveItems(existing.items),
        );
        if (stockError) return errorJson(500, stockError);

        const { data, error } = await sb
          .from("purchase_orders")
          .update({
            status: "received",
            received_date: new Date().toISOString().slice(0, 10),
          })
          .eq("user_id", auth.user.id)
          .eq("id", params.id)
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });
        await notify({
          userId: auth.user.id,
          type: "stock-movement",
          severity: "success",
          title: "Purchase order received",
          message: `PO ${data?.reference ?? params.id} received`,
          link: "/purchases",
          metadata: { id: params.id, action: "receive" },
        });
        return json(rowToApi(data));
      },
    },
  },
});
