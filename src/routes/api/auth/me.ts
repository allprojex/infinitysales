import { createFileRoute } from "@tanstack/react-router";
import { errorJson, getBearerUser, json, loadUserShape } from "../_auth-helpers";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getBearerUser(request);
        if (!user) return errorJson(401, "Unauthorized");
        const shape = await loadUserShape(user.id, user.email ?? "");
        return json(shape);
      },
    },
  },
});
