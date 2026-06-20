import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/esl/devices/$id")({
  server: { handlers: itemHandlers({ table: "esl_devices" }) },
});
