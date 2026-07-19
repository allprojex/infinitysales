import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/cash-sessions")({
  server: {
    handlers: listCreateHandlers({
      table: "cash_sessions",
      searchColumns: ["notes"],
      orderBy: "opened_at",
      filters: ["status", "branchId"],
    }),
  },
});
