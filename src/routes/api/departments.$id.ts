import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers, requireHrmAccess } from "./_resource-helpers";

export const Route = createFileRoute("/api/departments/$id")({
  server: { handlers: itemHandlers({ table: "departments", guard: requireHrmAccess }) },
});
