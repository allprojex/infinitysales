import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260722183000_sales_engine_historical_snapshot.sql"),
  "utf8",
);

describe("historical sale snapshot migration contract", () => {
  it("creates stable canonical line identities and exact snapshot columns", () => {
    expect(migration).toMatch(/CREATE TABLE public\.sale_lines/);
    expect(migration).toMatch(/id uuid PRIMARY KEY/);
    for (const column of [
      "unit_price",
      "unit_cost",
      "gross_amount",
      "discount_amount",
      "tax_amount",
      "total_amount",
      "cogs_amount",
      "warehouse_id",
      "branch_id",
      "sold_at",
      "batch_number",
      "expiry_date",
      "serial_numbers",
      "promotion_snapshot",
      "pricing_snapshot",
      "product_snapshot",
      "source_payload",
      "known_fields",
    ]) {
      expect(migration).toContain(column);
    }
  });

  it("marks unknown legacy history without consulting the current catalogue", () => {
    expect(migration).toContain("'legacy_partial'");
    expect(migration).toMatch(/source_payload[\s\S]*snapshot_completeness/);
    expect(migration).toMatch(/source_system = 'legacy'[\s\S]*return_eligible = false/);
    const legacyBackfill = migration.slice(
      migration.indexOf("WITH legacy AS"),
      migration.indexOf("DROP FUNCTION public.try_sale_snapshot_numeric"),
    );
    expect(legacyBackfill).not.toContain("'Unknown product'");
    expect(legacyBackfill).not.toMatch(/GREATEST\([\s\S]*0\.001/);
    expect(legacyBackfill).toContain("ELSE NULL");
    expect(legacyBackfill).toContain("known_fields");
  });

  it("enforces a single service-only creation engine and immutable history", () => {
    expect(migration).toMatch(
      /CREATE FUNCTION public\.create_sale_atomic\(p_actor uuid, p_sale jsonb, p_lines jsonb\)/,
    );
    expect(migration).toMatch(
      /DROP FUNCTION IF EXISTS public\.create_sale_atomic\(uuid, jsonb, numeric\)/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_sale_atomic\(uuid, jsonb, jsonb\) FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toContain("Sales must be created through create_sale_atomic");
    expect(migration).toContain("Canonical sale lines are immutable");
    expect(migration).toContain("Sale lines may only be inserted by a canonical sales function");
    expect(migration).toMatch(/CREATE TRIGGER sale_lines_require_canonical_insert/);
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.sales FROM authenticated/);
  });

  it("requires logical idempotency and provides an exact canonical restore path", () => {
    expect(migration).toContain("A logical transaction idempotency key is required");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toMatch(/CREATE FUNCTION public\.restore_canonical_sale/);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.restore_canonical_sale\(uuid, jsonb, jsonb\) FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toContain("'app.sale_line_insert_mode', 'restore'");
    const retryReturn = migration.indexOf("IF FOUND THEN\n    IF v_existing.user_id");
    const firstInventoryEffect = migration.indexOf("UPDATE public.products SET stock");
    expect(retryReturn).toBeGreaterThan(0);
    expect(retryReturn).toBeLessThan(firstInventoryEffect);
  });

  it("keeps historical imports non-posting and exposes only narrow smoke cleanup", () => {
    expect(migration).toContain("historical_no_post");
    expect(migration).toMatch(/CREATE FUNCTION public\.purge_smoke_test_sales/);
    expect(migration).toMatch(
      /source_system = 'smoke_test'[\s\S]*effects_mode = 'historical_no_post'/,
    );
  });
});

describe("application sale writer inventory", () => {
  const salesRoute = readFileSync(resolve(root, "src/routes/api/sales.ts"), "utf8");
  const importRoute = readFileSync(resolve(root, "src/routes/api/import.$type.ts"), "utf8");
  const smokeRoute = readFileSync(resolve(root, "src/routes/api/admin.smoke-test.ts"), "utf8");
  const detailRoute = readFileSync(resolve(root, "src/routes/api/sales.$id.ts"), "utf8");
  const backupRoute = readFileSync(resolve(root, "src/routes/api/admin.backup.ts"), "utf8");
  const restoreRoute = readFileSync(
    resolve(root, "src/routes/api/admin.backup.$id.restore.ts"),
    "utf8",
  );
  const posPage = readFileSync(resolve(root, "src/pages/pos.tsx"), "utf8");
  const manualPage = readFileSync(resolve(root, "src/pages/sales.tsx"), "utf8");

  it.each([
    ["normal API", salesRoute],
    ["historical import", importRoute],
    ["smoke seeding", smokeRoute],
  ])("routes the %s writer through the canonical application engine", (_name, source) => {
    expect(source).toContain("createSaleThroughEngine(");
    expect(source).not.toMatch(/\.from\(["']sales["']\)\s*\.insert/);
  });

  it("backs up canonical lines and restores sales only through the canonical restore RPC", () => {
    expect(backupRoute).toContain('"sale_lines"');
    expect(restoreRoute).toContain('table === "sales" || table === "sale_lines"');
    expect(restoreRoute).toContain('rpc("restore_canonical_sale"');
  });

  it("originates retry-stable logical keys in every application sale source", () => {
    expect(posPage).toContain('getLogicalTransactionKey(sessionStorage, "pos-checkout"');
    expect(manualPage).toContain('getLogicalTransactionKey(sessionStorage, "manual-sale"');
    expect(importRoute).toContain("deterministicTransactionKey(");
    expect(smokeRoute).toContain("deterministicTransactionKey(");
  });

  it("allows only note updates and blocks generic deletion", () => {
    expect(detailRoute).toContain('key !== "notes"');
    expect(detailRoute).toContain("Sales are immutable and cannot be deleted");
    expect(detailRoute).not.toMatch(/\.from\(["']sales["']\)\.delete/);
  });
});
