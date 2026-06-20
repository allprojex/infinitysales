import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/stock-takes")({
  server: { handlers: listCreateHandlers({ table: "stock_takes", searchColumns: ["reference", "notes"] }) },
});
