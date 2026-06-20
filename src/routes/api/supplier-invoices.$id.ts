import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/supplier-invoices/$id")({
  server: { handlers: itemHandlers({ table: "supplier_invoices" }) },
});
