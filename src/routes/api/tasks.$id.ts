import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/tasks/$id")({
  server: { handlers: itemHandlers({ table: "tasks" }) },
});
