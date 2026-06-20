import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/loyalty/transactions")({
  server: { handlers: listCreateHandlers({ table: "loyalty_transactions", searchColumns: ["reference", "notes"], orderBy: "occurred_at", filters: ["customerId", "type"] }) },
});
