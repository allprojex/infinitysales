import { createFileRoute } from "@tanstack/react-router";
import { promotionItemHandlers } from "./-promotion-helpers";

export const Route = createFileRoute("/api/promotions/$id")({
  server: { handlers: promotionItemHandlers() },
});
