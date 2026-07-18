import { customFetch } from "@/workspace/api-client-react";

export type CustomerOption = {
  id: number;
  uuidId: string;
  name: string;
  email?: string | null;
  company?: string | null;
};

type CustomerPage = { data?: Array<Record<string, unknown>>; total?: number };
const PAGE_SIZE = 500;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export async function fetchAllCustomerOptions(): Promise<CustomerOption[]> {
  const byId = new Map<string, CustomerOption>();
  let page = 1;
  let total: number | null = null;
  while (page <= 100) {
    const response = await customFetch<CustomerPage>(
      `/api/customers?limit=${PAGE_SIZE}&page=${page}`,
    );
    const rows = Array.isArray(response) ? response : (response.data ?? []);
    total = typeof response.total === "number" ? response.total : total;
    for (const row of rows) {
      const customer = {
        id: Number(row.id),
        uuidId: String(row.uuidId ?? ""),
        name: String(row.name ?? ""),
        email: (row.email as string | null | undefined) ?? null,
        company: (row.company as string | null | undefined) ?? null,
      };
      if (customer.uuidId && customer.name) byId.set(customer.uuidId, customer);
    }
    if (rows.length < PAGE_SIZE || (total != null && byId.size >= total)) break;
    page += 1;
  }
  return [...byId.values()].sort((a, b) => collator.compare(a.name, b.name));
}
