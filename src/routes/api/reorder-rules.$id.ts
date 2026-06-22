import { createFileRoute } from "@tanstack/react-router";
import { reorderRuleItemHandlers } from "./-reorder-rules-helpers";

export const Route = createFileRoute("/api/reorder-rules/$id")({
  server: { handlers: reorderRuleItemHandlers() },
});
