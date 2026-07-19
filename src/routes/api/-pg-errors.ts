// Small helpers for turning raw Postgres/PostgREST errors into safe, friendly
// API responses instead of leaking internal schema details (table/constraint
// names) straight to the client.

/** Postgres SQLSTATE for a foreign-key violation. */
const FOREIGN_KEY_VIOLATION = "23503";

export function isForeignKeyViolation(error: { code?: string | null } | null | undefined) {
  return error?.code === FOREIGN_KEY_VIOLATION;
}
