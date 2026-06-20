import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/price-lists")({
  server: { handlers: listCreateHandlers({ table: "price_lists", required: ["name"] }) },
});
