import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/employees")({
  server: { handlers: listCreateHandlers({ table: "employees", searchColumns: ["name", "email", "department", "job_title"], required: ["name"] }) },
});
