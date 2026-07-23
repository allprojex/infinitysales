import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readReport = (name: string) =>
  readFileSync(resolve(root, `src/routes/api/reports/${name}.ts`), "utf8");

const sales = readReport("sales");
const categorySummary = readReport("category-summary");
const usersSummary = readReport("users-transaction-summary");

describe("Phase A historical report sources", () => {
  it.each([
    ["sales", sales],
    ["category summary", categorySummary],
    ["users transaction summary", usersSummary],
  ])("loads %s line facts from the canonical sale_lines relation", (_name, source) => {
    expect(source).toContain("loadCanonicalSaleLines(");
    expect(source).not.toMatch(/\b(?:sale|s)\.items\b/);
  });

  it("builds sales response items and historical categories from stored line snapshots", () => {
    expect(sales).toContain("saleLines.map(canonicalLineDto)");
    expect(sales).toContain("line.category_name");
    expect(sales).toContain("line.category_id");
    expect(sales).not.toContain('.from("products")');
  });

  it("aggregates historical category sales without a current-product fallback", () => {
    expect(categorySummary).toContain('"sale_id,category_id,category_name,quantity,total_amount"');
    expect(categorySummary).toContain("line.quantity == null");
    expect(categorySummary).toContain("line.total_amount == null");
    expect(categorySummary).toContain("line.category_name");
    expect(categorySummary).not.toMatch(/productCategoryMap\.get/);
  });

  it("uses exact stored quantity, total, category, and warehouse for cashier totals", () => {
    for (const fact of [
      "line.quantity",
      "line.total_amount",
      "line.category_name",
      "line.warehouse_id",
    ]) {
      expect(usersSummary).toContain(fact);
    }
    expect(usersSummary).not.toContain('.from("products")');
    expect(usersSummary).not.toContain("productMap");
    expect(usersSummary).not.toMatch(/saleTotal\s*\*/);
  });
});
