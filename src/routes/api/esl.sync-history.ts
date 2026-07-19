import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/esl/sync-history")({
  server: {
    handlers: listCreateHandlers({
      table: "esl_sync_history",
      searchColumns: ["device_id", "message"],
      orderBy: "synced_at",
    }),
  },
});
