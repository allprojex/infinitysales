import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/customer-credits")({
  server: { handlers: listCreateHandlers({ table: "customer_credits", searchColumns: ["reference", "notes"], orderBy: "occurred_at", filters: ["customerId", "type"] }) },
});
