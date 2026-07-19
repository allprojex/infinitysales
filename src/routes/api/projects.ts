import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: listCreateHandlers({
      table: "projects",
      searchColumns: ["name", "assigned_to"],
      required: ["name"],
    }),
  },
});
