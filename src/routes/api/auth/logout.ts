import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getBearerUser, json } from "../_auth-helpers";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getBearerUser(request);
        if (user) {
          // Best-effort: revoke this user's sessions.
          try {
            await supabaseAdmin.auth.admin.signOut(user.id);
          } catch {
            /* noop */
          }
        }
        return json({ message: "Logged out" });
      },
    },
  },
});
