import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/serial-numbers")({
  server: { handlers: listCreateHandlers({ table: "serial_numbers", searchColumns: ["serial", "notes"], required: ["serial"], filters: ["productId", "status"] }) },
});
