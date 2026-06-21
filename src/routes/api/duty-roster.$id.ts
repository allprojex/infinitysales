import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers, requireHrmAccess } from "./_resource-helpers";

export const Route = createFileRoute("/api/duty-roster/$id")({
  server: { handlers: itemHandlers({ table: "duty_roster", guard: requireHrmAccess }) },
});
