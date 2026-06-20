import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/purchase-orders")({
  server: { handlers: listCreateHandlers({
    table: "purchase_orders",
    searchColumns: ["reference", "notes"],
    orderBy: "ordered_at",
    filters: ["status", "supplierId", "warehouseId", "branchId"],
    notify: {
      entity: "purchase-order",
      link: "/purchases",
      label: (r) => `PO ${r?.reference ?? r?.id}`,
    },
  }) },
});
