import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/product-transfers")({
  server: { handlers: listCreateHandlers({
    table: "product_transfers",
    searchColumns: ["reference", "notes"],
    notify: {
      entity: "stock-movement",
      link: "/product-transfer",
      label: (r) => `Transfer ${r?.reference ?? r?.id}`,
    },
  }) },
});
