// Shared server-only diagnostics for /api/healthz (not a route - see src/routes/README.md).

// Decodes the `role` claim of a legacy (JWT-format) Supabase API key without
// verifying its signature - a cheap, local sanity check only. It cannot prove
// the key is currently valid (revoked/rotated keys still decode fine), only
// that whoever configured it didn't paste in the wrong *kind* of key (e.g.
// the anon/publishable key in place of the service-role key). That mistake
// produces confusing RLS errors on writes instead of a clear auth failure -
// see PRODUCTION_FIX_REPORT.md for the incident this guards against.
export function serviceRoleKeyIssue(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null; // new-style sb_secret_/sb_publishable_ keys aren't JWTs
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (payload.role && payload.role !== "service_role") {
      return `SUPABASE_SERVICE_ROLE_KEY carries role "${payload.role}", not "service_role"`;
    }
    return null;
  } catch {
    return null; // not a decodable JWT - nothing to check
  }
}
