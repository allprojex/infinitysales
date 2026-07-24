// Shared logic for how the POS terminal reads the product catalog.
//
// GET /api/products caps every single page at 500 rows (see parseQuery in
// src/routes/api/_resource-helpers.ts) and orders by created_at desc. The POS
// used to fetch exactly one page at that cap, so once the catalog grew past
// 500 rows, every product ranked below the cutoff silently disappeared from
// POS while still showing correctly on the General Products page (which
// paginates its own table properly). fetchFullProductCatalog exhausts every
// page so the POS always reflects the complete shared catalog, regardless of
// how large it grows - this is a fetch-size fix, not a permission or
// ownership scope, and applies identically to every account.

export const PRODUCTS_PAGE_SIZE = 500;

export interface ProductPage<T> {
  data: T[];
  total: number;
}

/** Repeatedly calls fetchPage(1), fetchPage(2), ... until every row implied
 *  by the first page's `total` has been retrieved, then returns the
 *  concatenated result. A single-page catalog makes exactly one call. */
export async function fetchFullProductCatalog<T>(
  fetchPage: (page: number) => Promise<ProductPage<T>>,
  pageSize: number = PRODUCTS_PAGE_SIZE,
): Promise<ProductPage<T>> {
  const first = await fetchPage(1);
  const rows = [...first.data];
  const totalPages = Math.max(1, Math.ceil((first.total || rows.length) / pageSize));
  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchPage(page);
    rows.push(...next.data);
  }
  return { data: rows, total: first.total };
}

/** A product is eligible to appear (and be sold) at the POS unless it has
 *  been explicitly deactivated. Ownership/creator (user_id) is never part of
 *  this check - the catalog is shared across every account. */
export function isPosEligibleProduct(product: { isActive?: boolean | null }): boolean {
  return product.isActive !== false;
}
