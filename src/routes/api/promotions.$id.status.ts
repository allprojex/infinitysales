import { createFileRoute } from "@tanstack/react-router";
import { promotionStatusHandlers } from "./-promotion-helpers";

export const Route = createFileRoute("/api/promotions/$id/status")({
  server: { handlers: promotionStatusHandlers() },
});
