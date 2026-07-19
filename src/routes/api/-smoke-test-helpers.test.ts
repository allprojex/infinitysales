import { describe, expect, it } from "vitest";
import {
  cleanupFilter,
  LEGACY_MARKER,
  markerFor,
  scopedMarkerFromParam,
} from "./-smoke-test-helpers";

describe("markerFor", () => {
  it("produces a unique, stamp-scoped marker", () => {
    expect(markerFor(123)).toBe("[SMOKE_TEST:123]");
    expect(markerFor(123)).not.toBe(markerFor(456));
  });
});

describe("scopedMarkerFromParam", () => {
  it("returns null when no stamp is provided", () => {
    expect(scopedMarkerFromParam(null)).toBeNull();
  });

  it("returns null for a non-numeric stamp (rejects injection attempts)", () => {
    expect(scopedMarkerFromParam("abc")).toBeNull();
    expect(scopedMarkerFromParam("123,456")).toBeNull();
    expect(scopedMarkerFromParam("123]; drop table products;--")).toBeNull();
  });

  it("returns the run-scoped marker for a valid numeric stamp", () => {
    expect(scopedMarkerFromParam("123")).toBe("[SMOKE_TEST:123]");
  });
});

describe("cleanupFilter", () => {
  it("matches only the exact run when scoped", () => {
    const filter = cleanupFilter("notes", "[SMOKE_TEST:123]");
    expect(filter).toBe("notes.eq.[SMOKE_TEST:123]");
    // A different run's marker must not satisfy this filter string.
    expect(filter).not.toContain("[SMOKE_TEST:456]");
  });

  it("matches the legacy marker and every run when unscoped", () => {
    const filter = cleanupFilter("notes", null);
    expect(filter).toBe(`notes.eq.${LEGACY_MARKER},notes.like.[SMOKE_TEST:%`);
  });
});
