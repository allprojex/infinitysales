import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/supplier-invoices")({
  server: { handlers: listCreateHandlers({
    table: "supplier_invoices",
    searchColumns: ["reference", "notes"],
    orderBy: "invoiced_at",
    filters: ["status", "supplierId"],
    notify: {
      entity: "supplier-invoice",
      link: "/supplier-invoices",
      label: (r) => `Invoice ${r?.reference ?? r?.id}`,
    },
  }) },
});
