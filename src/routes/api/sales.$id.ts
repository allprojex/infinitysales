import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/sales/$id")({
  server: { handlers: itemHandlers({ table: "sales" }) },
});
