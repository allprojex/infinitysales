import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers, requireHrmAccess } from "./_resource-helpers";

export const Route = createFileRoute("/api/employees/$id")({
  server: { handlers: itemHandlers({ table: "employees", guard: requireHrmAccess }) },
});
