import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/pos/connections")({
  server: { handlers: listCreateHandlers({ table: "pos_connections", searchColumns: ["name", "address"], required: ["name"] }) },
});
