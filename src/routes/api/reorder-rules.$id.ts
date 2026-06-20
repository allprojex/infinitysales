import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/reorder-rules/$id")({
  server: { handlers: itemHandlers({ table: "reorder_rules" }) },
});
