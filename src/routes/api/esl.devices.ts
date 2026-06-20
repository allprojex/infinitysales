import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/esl/devices")({
  server: { handlers: listCreateHandlers({ table: "esl_devices", searchColumns: ["device_id", "notes"], required: ["deviceId"] }) },
});
