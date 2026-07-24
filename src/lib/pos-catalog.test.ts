import { describe, expect, it, vi } from "vitest";
import { fetchFullProductCatalog, isPosEligibleProduct, PRODUCTS_PAGE_SIZE } from "./pos-catalog";

describe("fetchFullProductCatalog", () => {
  it("makes a single call when the whole catalog fits on one page", async () => {
    const fetchPage = vi.fn(async () => ({ data: [{ id: "1" }, { id: "2" }], total: 2 }));

    const result = await fetchFullProductCatalog(fetchPage, 500);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual([{ id: "1" }, { id: "2" }]);
    expect(result.total).toBe(2);
  });

  it("keeps fetching until every page implied by total has been retrieved", async () => {
    // Regression case: 773 products at a 500-row page cap needs exactly 2
    // pages - the same shape as the live catalog that hid "Packed Biscuit"
    // (ranked 587th by created_at desc, past a single page's cutoff).
    const page1 = Array.from({ length: 500 }, (_, i) => ({ id: `p${i + 1}` }));
    const page2 = Array.from({ length: 273 }, (_, i) => ({ id: `p${i + 501}` }));
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 1) return { data: page1, total: 773 };
      if (page === 2) return { data: page2, total: 773 };
      throw new Error(`unexpected page ${page}`);
    });

    const result = await fetchFullProductCatalog(fetchPage, 500);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result.data).toHaveLength(773);
    // "Packed Biscuit" stand-in: a row that only exists on page 2 must
    // survive into the combined result, not be dropped like it was when the
    // POS fetched only page 1.
    expect(result.data.find((p) => p.id === "p587")).toBeTruthy();
  });

  it("handles an empty catalog without an infinite loop or extra calls", async () => {
    const fetchPage = vi.fn(async () => ({ data: [], total: 0 }));

    const result = await fetchFullProductCatalog(fetchPage, 500);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual([]);
  });

  it("defaults to the production page size (500) when none is passed", async () => {
    expect(PRODUCTS_PAGE_SIZE).toBe(500);
    const fetchPage = vi.fn(async () => ({ data: [{ id: "1" }], total: 1 }));
    await fetchFullProductCatalog(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe("isPosEligibleProduct", () => {
  it("includes a product with no isActive field at all (most rows predate the column being read this way)", () => {
    expect(isPosEligibleProduct({})).toBe(true);
  });

  it("includes an explicitly active product", () => {
    expect(isPosEligibleProduct({ isActive: true })).toBe(true);
  });

  it("excludes an explicitly inactive product", () => {
    expect(isPosEligibleProduct({ isActive: false })).toBe(false);
  });
});
