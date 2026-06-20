import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/serial-numbers/$id")({
  server: { handlers: itemHandlers({ table: "serial_numbers" }) },
});
