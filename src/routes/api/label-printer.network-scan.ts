import { createFileRoute } from "@tanstack/react-router";
import { requireUser, json } from "./_resource-helpers";

// Worker runtime cannot open raw TCP sockets to scan LAN. Return empty list
// so the UI can fall back gracefully instead of erroring.
export const Route = createFileRoute("/api/label-printer/network-scan")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        return json([]);
      },
    },
  },
});
