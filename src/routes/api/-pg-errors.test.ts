import { describe, expect, it } from "vitest";
import { isForeignKeyViolation } from "./-pg-errors";

describe("isForeignKeyViolation", () => {
  it("recognizes Postgres SQLSTATE 23503", () => {
    expect(isForeignKeyViolation({ code: "23503" })).toBe(true);
  });

  it("rejects other error codes", () => {
    expect(isForeignKeyViolation({ code: "23505" })).toBe(false);
    expect(isForeignKeyViolation({ code: "42501" })).toBe(false);
  });

  it("handles missing/null error safely", () => {
    expect(isForeignKeyViolation(null)).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
    expect(isForeignKeyViolation({})).toBe(false);
  });
});
