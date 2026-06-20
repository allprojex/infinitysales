import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/pos/connections/$id")({
  server: { handlers: itemHandlers({ table: "pos_connections" }) },
});
