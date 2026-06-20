import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/healthz")({
  server: {
    handlers: {
      GET: async () => new Response(JSON.stringify({ status: "ok", time: new Date().toISOString() }), {
        headers: { "content-type": "application/json" },
      }),
    },
  },
});
