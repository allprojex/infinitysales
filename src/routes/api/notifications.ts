import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: listCreateHandlers({
      table: "notifications",
      searchColumns: ["title", "message"],
      required: ["title"],
    }),
  },
});
