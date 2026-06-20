import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/stock-takes/$id")({
  server: { handlers: itemHandlers({ table: "stock_takes" }) },
});
