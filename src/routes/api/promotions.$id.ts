import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/promotions/$id")({
  server: { handlers: itemHandlers({ table: "promotions" }) },
});
