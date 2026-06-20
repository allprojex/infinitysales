import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/promotions")({
  server: { handlers: listCreateHandlers({ table: "promotions", searchColumns: ["name", "code"], required: ["name"], filters: ["isActive", "type"] }) },
});
