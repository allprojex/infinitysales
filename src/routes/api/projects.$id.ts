import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/projects/$id")({
  server: { handlers: itemHandlers({ table: "projects" }) },
});
