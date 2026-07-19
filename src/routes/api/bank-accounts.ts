import { createFileRoute } from "@tanstack/react-router";
import { listCreateHandlers } from "./_resource-helpers";

export const Route = createFileRoute("/api/bank-accounts")({
  server: {
    handlers: listCreateHandlers({
      table: "bank_accounts",
      searchColumns: ["name", "bank_name", "account_number"],
      required: ["name"],
    }),
  },
});
