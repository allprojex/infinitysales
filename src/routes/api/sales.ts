import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers, safeJson, sb } from "./_resource-helpers";

const saleHandlers = listCreateHandlers({
  table: "sales",
  searchColumns: ["reference", "notes"],
  orderBy: "sold_at",
  filters: ["channel", "status", "paymentStatus", "customerId", "branchId"],
  notify: {
    entity: "sale",
    link: "/sales",
    severity: "success",
    label: (r) => `Sale ${r?.reference ?? r?.id} - ${r?.total ?? ""}`,
  },
});

async function decrementProductStock(items: unknown) {
  if (!Array.isArray(items)) return;

  for (const item of items) {
    const row = item as Record<string, unknown>;
    const productId = row.productId ?? row.product_id;
    const quantity = Number(row.quantity ?? row.qty ?? 0);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;

    const { data, error } = await sb
      .from("products")
      .select("stock")
      .eq("id", productId)
      .maybeSingle();
    if (error || !data) continue;

    const nextStock = Math.max(Number(data.stock ?? 0) - quantity, 0);
    await sb.from("products").update({ stock: nextStock }).eq("id", productId);
  }
}

export const Route = createFileRoute("/api/sales")({
  server: {
    handlers: {
      ...saleHandlers,
      POST: async ({ request }) => {
        const body = await safeJson(request.clone());
        const response = await saleHandlers.POST({ request });
        if (!response.ok) return response;

        if ((body?.status ?? "completed") === "completed") {
          await decrementProductStock(body?.items);
        }

        return response;
      },
    },
  },
});
