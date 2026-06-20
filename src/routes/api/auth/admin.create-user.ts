import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, json } from "../_auth-helpers";
import { requireAdmin } from "./_admin-guard";

const ALLOWED_ROLES = ["admin", "manager", "cashier", "accountant", "user"] as const;

export const Route = createFileRoute("/api/auth/admin/create-user")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        let body: { name?: string; email?: string; password?: string; role?: string; city?: string };
        try { body = await request.json(); } catch { return errorJson(400, "Invalid JSON"); }

        const name = (body.name ?? "").trim();
        const email = (body.email ?? "").trim().toLowerCase();
        const password = body.password ?? "";
        const role = (body.role ?? "user") as (typeof ALLOWED_ROLES)[number];

        if (!name) return errorJson(400, "Name is required");
        if (!email) return errorJson(400, "Email is required");
        if (password.length < 8) return errorJson(400, "Password must be at least 8 characters");
        if (!ALLOWED_ROLES.includes(role)) return errorJson(400, "Invalid role");

        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            name,
            role,
            must_change_password: true,
            city: body.city ?? null,
          },
        });
        if (error || !created.user) return errorJson(400, error?.message ?? "Failed to create user");

        // Ensure role exists (trigger handles it but be defensive).
        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: created.user.id, role: role as any }, { onConflict: "user_id,role" });

        return json({ message: "User created", id: created.user.id, email });
      },
    },
  },
});
