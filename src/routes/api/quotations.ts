import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/quotations")({
  server: { handlers: listCreateHandlers({ table: "quotations", searchColumns: ["reference", "notes"], filters: ["status", "customerId"] }) },
});
