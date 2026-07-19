// Pure logic for admin.smoke-test.ts, split out so it's unit-testable without
// a live Supabase connection.

// Marker prefix used to identify smoke-test rows across tables. Each run gets
// its own marker ("[SMOKE_TEST:<stamp>]") so cleanup can be scoped to the
// exact run that created a row, instead of sweeping every smoke-test row for
// the admin regardless of which run created it. Legacy rows created before
// this per-run marker existed only carry the bare "[SMOKE_TEST]" tag - the
// unscoped cleanup path (no ?stamp=) still matches those too.
export const MARKER_PREFIX = "[SMOKE_TEST";
export const LEGACY_MARKER = "[SMOKE_TEST]";

export const markerFor = (stamp: number) => `${MARKER_PREFIX}:${stamp}]`;

/** Parses a `?stamp=` query param into a run-scoped marker, or null if absent/invalid. */
export function scopedMarkerFromParam(stampParam: string | null): string | null {
  if (!stampParam || !/^\d+$/.test(stampParam)) return null;
  return markerFor(Number(stampParam));
}

/** Builds the PostgREST `.or()` filter string for cleanup, scoped or not. */
export function cleanupFilter(column: string, scopedMarker: string | null): string {
  return scopedMarker
    ? `${column}.eq.${scopedMarker}`
    : `${column}.eq.${LEGACY_MARKER},${column}.like.${MARKER_PREFIX}:%`;
}
