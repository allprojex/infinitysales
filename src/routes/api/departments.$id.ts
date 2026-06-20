import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/departments/$id")({
  server: { handlers: itemHandlers({ table: "departments" }) },
});
