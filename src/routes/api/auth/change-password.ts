import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, getBearerUser, json } from "../_auth-helpers";

export const Route = createFileRoute("/api/auth/change-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getBearerUser(request);
        if (!user || !user.email) return errorJson(401, "Unauthorized");

        let body: { currentPassword?: string; newPassword?: string };
        try {
          body = await request.json();
        } catch {
          return errorJson(400, "Invalid JSON");
        }
        const currentPassword = body.currentPassword ?? "";
        const newPassword = body.newPassword ?? "";
        if (!currentPassword || !newPassword) return errorJson(400, "Both passwords required");
        if (newPassword.length < 8) return errorJson(400, "Password must be at least 8 characters");

        // Verify current password by attempting sign-in.
        const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (signInError) return errorJson(400, "Current password is incorrect");

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
          password: newPassword,
        });
        if (updateError) return errorJson(400, updateError.message);

        await supabaseAdmin
          .from("profiles")
          .update({ must_change_password: false })
          .eq("auth_id", user.id);

        return json({ message: "Password updated" });
      },
    },
  },
});
