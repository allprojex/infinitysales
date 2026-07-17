import { customFetch } from "@/workspace/api-client-react";

export type ProductOption = {
  id: string | number;
  name: string;
  sku?: string | null;
  stock: number | string | null;
  reorder_point: number;
  categoryId?: string | null;
  category?: string | null;
};

type ProductPage = {
  data?: Array<Record<string, unknown>>;
  total?: number;
};

const PAGE_SIZE = 500;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const toProductOption = (row: Record<string, unknown>): ProductOption => ({
  id: row.id as string | number,
  name: String(row.name ?? ""),
  sku: (row.sku as string | null | undefined) ?? null,
  stock: (row.stock as number | string | null | undefined) ?? 0,
  reorder_point: Number(
    row.reorder_point ?? row.reorderPoint ?? row.reorder_level ?? row.reorderLevel ?? 0,
  ),
  categoryId: (row.categoryId as string | null | undefined) ?? null,
  category: (row.category as string | null | undefined) ?? null,
});

const sortProductsByName = (products: ProductOption[]) =>
  [...products].sort((a, b) => {
    const byName = collator.compare(a.name, b.name);
    if (byName !== 0) return byName;
    return collator.compare(String(a.sku ?? ""), String(b.sku ?? ""));
  });

export async function fetchAllProductOptions(): Promise<ProductOption[]> {
  const byId = new Map<string, ProductOption>();
  let page = 1;
  let total: number | null = null;

  while (page <= 100) {
    const response = await customFetch<ProductPage>(
      `/api/products?limit=${PAGE_SIZE}&page=${page}`,
    );
    const rows = Array.isArray(response) ? response : (response.data ?? []);
    total = typeof response.total === "number" ? response.total : total;

    for (const row of rows) {
      const product = toProductOption(row);
      if (product.id != null && product.name) byId.set(String(product.id), product);
    }

    if (rows.length < PAGE_SIZE) break;
    if (total != null && byId.size >= total) break;
    page += 1;
  }

  return sortProductsByName(Array.from(byId.values()));
}
