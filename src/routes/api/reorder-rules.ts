import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/reorder-rules")({
  server: { handlers: listCreateHandlers({ table: "reorder_rules", searchColumns: [], filters: ["productId", "warehouseId"] }) },
});
