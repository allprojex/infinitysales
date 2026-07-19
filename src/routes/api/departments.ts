import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers, requireHrmAccess } from "./_resource-helpers";

export const Route = createFileRoute("/api/departments")({
  server: {
    handlers: listCreateHandlers({
      table: "departments",
      searchColumns: ["name", "head_name", "location"],
      required: ["name"],
      orderBy: "name",
      ascending: true,
      guard: requireHrmAccess,
    }),
  },
});
