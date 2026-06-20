// Catch-all for unmigrated /api/* endpoints during the Lovable Cloud migration.
// Returns a clear 501 so the UI can show a "Not migrated yet" toast instead of
// silently falling through to the SPA and parsing HTML as JSON.
import { createFileRoute } from "@tanstack/react-router";

function notMigrated({ request, params }: { request: Request; params: { _splat?: string } }) {
  const path = params._splat ?? "";
  return new Response(
    JSON.stringify({
      message: `This endpoint (/api/${path}) has not been migrated to Lovable Cloud yet.`,
      migrationStatus: "pending",
      method: request.method,
    }),
    { status: 501, headers: { "content-type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: notMigrated,
      POST: notMigrated,
      PUT: notMigrated,
      PATCH: notMigrated,
      DELETE: notMigrated,
    },
  },
});
