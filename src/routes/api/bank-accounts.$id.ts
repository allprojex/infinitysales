import { createFileRoute } from "@tanstack/react-router";
import { itemHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/bank-accounts/$id")({
  server: { handlers: itemHandlers({ table: "bank_accounts" }) },
});
