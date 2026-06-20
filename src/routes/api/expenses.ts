import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/expenses")({
  server: { handlers: listCreateHandlers({ table: "expenses", searchColumns: ["reference", "description", "category"], orderBy: "spent_at", filters: ["category", "branchId", "supplierId", "bankAccountId"] }) },
});
