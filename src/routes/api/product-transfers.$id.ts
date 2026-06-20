import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/product-transfers/$id")({
  server: { handlers: itemHandlers({ table: "product_transfers" }) },
});
