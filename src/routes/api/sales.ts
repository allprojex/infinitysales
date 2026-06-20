import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/sales")({
  server: { handlers: listCreateHandlers({
    table: "sales",
    searchColumns: ["reference", "notes"],
    orderBy: "sold_at",
    filters: ["channel", "status", "paymentStatus", "customerId", "branchId"],
    notify: {
      entity: "sale",
      link: "/sales",
      severity: "success",
      label: (r) => `Sale ${r?.reference ?? r?.id} – ${r?.total ?? ""}`,
    },
  }) },
});
