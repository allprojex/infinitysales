import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "../_resource-helpers";

export const Route = createFileRoute("/api/admin/system-info")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireAdmin(request);
        if (!user) return response;
        return json({
          version: "1.0.0",
          environment: "production",
          uptime: 0,
          nodeVersion: "edge",
          timestamp: new Date().toISOString(),
        });
      },
    },
  },
});
