import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, getBearerUser, json } from "../_auth-helpers";

export const Route = createFileRoute("/api/sessions/end")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authUser = await getBearerUser(request);
        if (!authUser) return errorJson(401, "Unauthorized");
        await supabaseAdmin.from("user_sessions").delete().eq("user_id", authUser.id);
        return json({ ok: true });
      },
    },
  },
});
