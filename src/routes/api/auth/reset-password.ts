import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, json } from "../_auth-helpers";

export const Route = createFileRoute("/api/auth/reset-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { resetToken?: string; newPassword?: string };
        try {
          body = await request.json();
        } catch {
          return errorJson(400, "Invalid JSON");
        }
        const token = (body.resetToken ?? "").trim();
        const newPassword = body.newPassword ?? "";
        if (!token) return errorJson(400, "Reset token required");
        if (newPassword.length < 8) return errorJson(400, "Password must be at least 8 characters");

        // The reset link Supabase sends carries a `token_hash` in the URL fragment.
        // The frontend passes that through as `resetToken`. Exchange it for a session,
        // then update the password using that session's user id.
        const { data, error } = await supabaseAdmin.auth.verifyOtp({
          token_hash: token,
          type: "recovery",
        });
        if (error || !data.user) return errorJson(400, "Invalid or expired reset link");

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
          password: newPassword,
        });
        if (updateError) return errorJson(400, updateError.message);

        await supabaseAdmin
          .from("profiles")
          .update({ must_change_password: false })
          .eq("auth_id", data.user.id);

        return json({ message: "Password has been reset" });
      },
    },
  },
});
