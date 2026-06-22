import { createFileRoute } from "@tanstack/react-router";
import { reorderRuleListCreateHandlers } from "./-reorder-rules-helpers";

export const Route = createFileRoute("/api/reorder-rules")({
  server: { handlers: reorderRuleListCreateHandlers() },
});
