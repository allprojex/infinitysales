import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/adjustments/$id")({
  server: { handlers: itemHandlers({ table: "stock_adjustments" }) },
});
