import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { serviceRoleKeyIssue } from "./_env-check";

export const Route = createFileRoute("/api/healthz")({
  server: {
    handlers: {
      GET: async () => {
        const time = new Date().toISOString();

        // process.env must be read inside the handler, not at module scope
        // (Cloudflare Workers binds it per-request - see src/lib/config.server.ts).
        const keyIssue = process.env.SUPABASE_SERVICE_ROLE_KEY
          ? serviceRoleKeyIssue(process.env.SUPABASE_SERVICE_ROLE_KEY)
          : "SUPABASE_SERVICE_ROLE_KEY is not set";
        if (keyIssue) {
          return new Response(JSON.stringify({ status: "error", time, error: keyIssue }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }

        // Exercises the same GoTrue admin call that failed with "Invalid API
        // key" during the 2026-07-19 incident, so a wrong/rejected key is
        // caught here instead of surfacing later as unrelated RLS errors.
        try {
          const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
          if (error) {
            return new Response(JSON.stringify({ status: "error", time, error: error.message }), {
              status: 503,
              headers: { "content-type": "application/json" },
            });
          }
        } catch (e) {
          return new Response(
            JSON.stringify({
              status: "error",
              time,
              error: e instanceof Error ? e.message : "Supabase connectivity check failed",
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(JSON.stringify({ status: "ok", time }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
