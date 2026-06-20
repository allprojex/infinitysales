import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/notifications/$id")({
  server: { handlers: itemHandlers({ table: "notifications" }) },
});
