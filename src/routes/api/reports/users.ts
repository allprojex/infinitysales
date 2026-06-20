import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser } from "./_helpers";

export const Route = createFileRoute("/api/reports/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        return json({ items: [{ id: user.id, name: user.email, email: user.email }], total: 1 });
      },
    },
  },
});
