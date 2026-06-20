import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/adjustments")({
  server: { handlers: listCreateHandlers({
    table: "stock_adjustments",
    searchColumns: ["reference", "reason", "notes"],
    notify: {
      entity: "stock-movement",
      link: "/adjustments",
      severity: "warning",
      label: (r) => `Stock adjustment ${r?.reference ?? r?.id}`,
    },
  }) },
});
