import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/quotations/$id")({
  server: { handlers: itemHandlers({ table: "quotations" }) },
});
