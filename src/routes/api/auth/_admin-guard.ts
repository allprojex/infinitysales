// Server-only helper to require an admin caller for /api/auth/admin/* routes.
import { errorJson, getBearerUser, roleFromUserMetadata, userHasRole } from "../_auth-helpers";

export async function requireAdmin(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return { user: null as null, response: errorJson(401, "Unauthorized") };
  if (roleFromUserMetadata(user) !== "admin" && !(await userHasRole(user.id, "admin"))) {
    return { user: null as null, response: errorJson(403, "Admin access required") };
  }
  return { user, response: null as null };
}
