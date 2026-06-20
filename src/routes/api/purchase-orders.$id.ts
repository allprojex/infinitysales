import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/purchase-orders/$id")({
  server: { handlers: itemHandlers({ table: "purchase_orders" }) },
});
