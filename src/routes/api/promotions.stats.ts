import { createFileRoute } from "@tanstack/react-router";
import { promotionStatsHandlers } from "./-promotion-helpers";

export const Route = createFileRoute("/api/promotions/stats")({
  server: { handlers: promotionStatsHandlers() },
});
