import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/price-lists/$id")({
  server: { handlers: itemHandlers({ table: "price_lists" }) },
});
