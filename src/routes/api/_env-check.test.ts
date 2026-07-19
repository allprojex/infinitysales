import { describe, expect, it } from "vitest";
import { serviceRoleKeyIssue } from "./_env-check";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fake-signature`;
}

describe("serviceRoleKeyIssue", () => {
  it("flags a key whose role claim is not service_role (the 2026-07-19 incident)", () => {
    const anonKey = fakeJwt({ iss: "supabase", ref: "vcgtjdkpgbkyzrbonkbs", role: "anon" });
    expect(serviceRoleKeyIssue(anonKey)).toMatch(/anon/);
  });

  it("accepts a genuine service_role key", () => {
    const serviceKey = fakeJwt({
      iss: "supabase",
      ref: "vcgtjdkpgbkyzrbonkbs",
      role: "service_role",
    });
    expect(serviceRoleKeyIssue(serviceKey)).toBeNull();
  });

  it("does not flag new-style sb_secret_/sb_publishable_ keys (not JWTs)", () => {
    expect(serviceRoleKeyIssue("sb_secret_abc123")).toBeNull();
  });

  it("does not throw on garbage input", () => {
    expect(serviceRoleKeyIssue("not.a.jwt")).toBeNull();
    expect(serviceRoleKeyIssue("")).toBeNull();
  });
});
