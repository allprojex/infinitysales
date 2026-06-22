import { createFileRoute } from "@tanstack/react-router";
import { promotionListCreateHandlers } from "./-promotion-helpers";

export const Route = createFileRoute("/api/promotions")({
  server: { handlers: promotionListCreateHandlers() },
});
