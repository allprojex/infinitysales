import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { getCreds, signIn } from "./helpers/auth";

/**
 * Reports & Analytics — response-shape snapshot test.
 *
 * For every /api/reports/* endpoint backing a Reports tab we validate the
 * subset of the payload the UI in src/pages/reports.tsx actually consumes:
 *
 *   1. HTTP 200 with a JSON object body.
 *   2. The array the UI reads (e.g. items / warehouses / users / cashiers) —
 *      detected by trying each alias the loader knows — is an Array if
 *      present, and at least one of the accepted keys exists.
 *   3. Every aliased numeric field (top-level OR item-level) is STRICTLY
 *      typed: when the backend emits the key under any alias, the value
 *      MUST be a real JS `number` and `Number.isFinite(value)` — null,
 *      strings (even numeric strings like "12.50"), booleans, NaN, and
 *      Infinity are all flagged. This catches drift where the backend
 *      starts returning `null` or stringified totals that `num()` would
 *      silently mask as 0 in the UI. A missing key is still tolerated —
 *      `num(undefined)` deliberately defaults to 0.
 *   4. Snapshot diagnostics: the test logs which alias each endpoint
 *      actually emitted, so drift between backend rename and UI alias map
 *      shows up in the test output.

 */

type NumericField = { canonical: string; aliases?: string[] };
type EndpointSpec = {
  tab: string;
  path: string;
  /** Any one of these keys must be present and an array (when the UI reads a list). */
  arrayKeys?: string[];
  topNumeric?: NumericField[];
  itemNumeric?: NumericField[];
};

const ENDPOINTS: EndpointSpec[] = [
  {
    tab: "sales",
    path: "/api/reports/sales?startDate=2025-01-01&endDate=2026-12-31",
    arrayKeys: ["items"],
    topNumeric: [
      { canonical: "totalRevenue" },
      { canonical: "totalSales", aliases: ["total"] },
    ],
    itemNumeric: [{ canonical: "total" }],
  },
  {
    tab: "pl",
    path: "/api/reports/profit-loss?startDate=2025-01-01&endDate=2026-12-31",
    topNumeric: [
      { canonical: "revenue" },
      { canonical: "expenses" },
      { canonical: "grossProfit", aliases: ["profit"] },
      { canonical: "grossMargin", aliases: ["margin"] },
      { canonical: "salesCount" },
    ],
  },
  {
    tab: "inventory",
    path: "/api/reports/inventory-valuation",
    arrayKeys: ["items"],
    topNumeric: [
      { canonical: "totalValue", aliases: ["totalRetail"] },
      { canonical: "totalUnits" },
      { canonical: "totalProducts", aliases: ["count"] },
    ],
    itemNumeric: [
      { canonical: "stock" },
      { canonical: "unitPrice", aliases: ["price"] },
      { canonical: "totalValue", aliases: ["retailValue"] },
    ],
  },
  {
    tab: "stock",
    path: "/api/reports/stock-report",
    arrayKeys: ["items"],
    topNumeric: [{ canonical: "total" }],
    itemNumeric: [
      { canonical: "stock" },
      { canonical: "price" },
      { canonical: "reorderPoint", aliases: ["reorder_level"] },
    ],
  },
  {
    tab: "alerts",
    path: "/api/reports/stock-report?lowStock=true",
    arrayKeys: ["items"],
    topNumeric: [{ canonical: "total" }],
    itemNumeric: [
      { canonical: "stock" },
      { canonical: "price" },
      { canonical: "reorderPoint", aliases: ["reorder_level"] },
    ],
  },
  {
    tab: "expired",
    path: "/api/reports/expired-inventory?alertDays=60",
    arrayKeys: ["items"],
    topNumeric: [
      { canonical: "total" },
      { canonical: "expiredCount" },
      { canonical: "expiringSoonCount" },
      { canonical: "expiredValue" },
    ],
    itemNumeric: [
      { canonical: "stock" },
      { canonical: "price" },
      { canonical: "stockValue" },
    ],
  },
  {
    tab: "warehouse",
    path: "/api/reports/warehouse-report",
    // UI: `d?.warehouses ?? d?.items`
    arrayKeys: ["warehouses", "items"],
    itemNumeric: [
      { canonical: "totalProducts", aliases: ["productCount"] },
      { canonical: "totalUnits", aliases: ["units"] },
      { canonical: "totalValue", aliases: ["retailValue"] },
    ],
  },
  {
    tab: "expenses",
    path: "/api/reports/expenses?startDate=2025-01-01&endDate=2026-12-31",
    arrayKeys: ["items"],
    topNumeric: [
      { canonical: "totalExpenses", aliases: ["total"] },
      { canonical: "totalOrders", aliases: ["count"] },
    ],
    itemNumeric: [{ canonical: "total", aliases: ["amount"] }],
  },
  {
    tab: "purchases",
    path: "/api/reports/purchases?startDate=2025-01-01&endDate=2026-12-31",
    arrayKeys: ["items"],
    topNumeric: [
      { canonical: "totalOrders" },
      { canonical: "totalSpend" },
      { canonical: "received" },
      { canonical: "pending" },
      { canonical: "avgOrderValue" },
    ],
    itemNumeric: [
      { canonical: "subtotal" },
      { canonical: "tax" },
      { canonical: "total" },
      { canonical: "itemCount" },
    ],
  },
  {
    tab: "deposits",
    path: "/api/reports/deposits?startDate=2025-01-01&endDate=2026-12-31",
    // UI tolerates a missing items array (defaults to []).
    arrayKeys: ["items"],
    topNumeric: [
      { canonical: "totalDeposits", aliases: ["total"] },
      { canonical: "totalTransactions", aliases: ["count"] },
    ],
    itemNumeric: [{ canonical: "total", aliases: ["paid"] }],
  },
  {
    tab: "customers",
    path: "/api/reports/customers",
    arrayKeys: ["items"],
    topNumeric: [{ canonical: "total" }, { canonical: "totalRevenue" }],
    itemNumeric: [{ canonical: "totalSpend" }, { canonical: "totalOrders" }],
  },
  {
    tab: "users",
    path: "/api/reports/users",
    // UI: `d?.users ?? d?.items`
    arrayKeys: ["users", "items"],
    topNumeric: [
      { canonical: "total" },
      { canonical: "adminCount" },
      { canonical: "userCount" },
      { canonical: "activeCount" },
    ],
  },
  {
    tab: "cashier",
    path: "/api/reports/cashier-performance?startDate=2025-01-01&endDate=2026-12-31",
    // UI: `d?.cashiers ?? d?.items`
    arrayKeys: ["cashiers", "items"],
    topNumeric: [
      { canonical: "totalRevenue" },
      { canonical: "totalSales", aliases: ["total"] },
      { canonical: "activeCashiers" },
    ],
    itemNumeric: [
      { canonical: "salesCount", aliases: ["totalSales"] },
      { canonical: "revenue", aliases: ["totalRevenue"] },
      { canonical: "avgSale" },
      { canonical: "maxSale" },
      { canonical: "minSale" },
    ],
  },
];

/* Stricter than `num()` in src/pages/reports.tsx: every aliased numeric
 * field the UI normalizes MUST be either omitted (key absent) or an actual
 * finite JS `number`. Returning `null`, `"123"`, `"N/A"`, `true`, `NaN`,
 * `Infinity`, `[]`, `{}` all silently coerce to 0 or break the UI and are
 * flagged as contract violations. */
function classifyNumeric(present: boolean, value: unknown):
  | { kind: "absent" }
  | { kind: "ok"; n: number }
  | { kind: "bad"; reason: string }
{
  if (!present) return { kind: "absent" };
  if (typeof value !== "number") {
    return { kind: "bad", reason: `expected number, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}` };
  }
  if (!Number.isFinite(value)) {
    return { kind: "bad", reason: `non-finite number (${String(value)})` };
  }
  return { kind: "ok", n: value };
}

function pickAliasWithPresence(obj: Record<string, unknown>, spec: NumericField):
  | { matched: true; key: string; present: boolean; value: unknown }
  | { matched: false }
{
  const keys = [spec.canonical, ...(spec.aliases ?? [])];
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      return { matched: true, key: k, present: true, value: obj[k] };
    }
  }
  return { matched: false };
}

function validateNumeric(
  ctx: string,
  obj: Record<string, unknown>,
  fields: NumericField[] | undefined,
  failures: string[],
  emitted?: Set<string>,
  nonFinite?: string[],
) {
  for (const spec of fields ?? []) {
    const hit = pickAliasWithPresence(obj, spec);
    if (!hit.matched) continue; // key absent under every alias — UI defaults to 0
    const result = classifyNumeric(hit.present, hit.value);
    if (result.kind === "bad") {
      failures.push(`${ctx}: "${hit.key}" = ${JSON.stringify(hit.value)} — ${result.reason}`);
      // Dedicated bucket for NaN / Infinity / -Infinity — values num() passes
      // through unchanged and that break the UI's number rendering.
      if (
        nonFinite &&
        typeof hit.value === "number" &&
        !Number.isFinite(hit.value)
      ) {
        nonFinite.push(`${ctx}."${hit.key}" = ${String(hit.value)}`);
      }
    } else if (result.kind === "ok" && emitted) {
      emitted.add(`${spec.canonical}<-${hit.key}`);
    }
  }
}


async function getBearer(page: Page): Promise<string> {
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const token = await page.evaluate((key) => {
    const candidates = key
      ? [key]
      : Object.keys(localStorage).filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    for (const k of candidates) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.access_token) return parsed.access_token as string;
      } catch { /* noop */ }
    }
    return localStorage.getItem("accessToken");
  }, storageKey ?? null);
  if (!token) throw new Error("No access token in localStorage — sign-in did not persist a session.");
  return token;
}

async function adminSmoke(req: APIRequestContext, bearer: string, method: "POST" | "DELETE") {
  const res = await req.fetch("/api/admin/smoke-test", {
    method,
    headers: { Authorization: `Bearer ${bearer}` },
  });
  expect(res.status(), `admin smoke-test ${method}`).toBeLessThan(400);
  return res.json();
}

test.describe("Reports & Analytics — response shape", () => {
  test("every endpoint matches the aliases and num()-coercible fields the UI reads", async ({ page, request }) => {
    test.setTimeout(120_000);
    const creds = getCreds("admin");
    test.skip(!creds, "E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD not set");

    await signIn(page, creds!);
    const bearer = await getBearer(page);
    await adminSmoke(request, bearer, "POST");

    const failures: string[] = [];
    const nonFinite: string[] = [];
    const snapshot: Record<string, { topAliases: string[]; arrayKey: string | null; arrayLen: number | null; itemAliases: string[] }> = {};

    try {
      for (const spec of ENDPOINTS) {
        const res = await request.get(spec.path, { headers: { Authorization: `Bearer ${bearer}` } });
        expect(res.status(), `${spec.tab} ${spec.path}`).toBe(200);
        const body = (await res.json()) as Record<string, unknown>;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          failures.push(`${spec.tab}: body is not a JSON object`);
          continue;
        }

        const topEmitted = new Set<string>();
        validateNumeric(`${spec.tab} top`, body, spec.topNumeric, failures, topEmitted, nonFinite);

        let chosenArrayKey: string | null = null;
        let arr: unknown[] | null = null;
        if (spec.arrayKeys?.length) {
          for (const k of spec.arrayKeys) {
            if (Array.isArray(body[k])) { chosenArrayKey = k; arr = body[k] as unknown[]; break; }
          }
          if (!chosenArrayKey) {
            for (const k of spec.arrayKeys) {
              if (body[k] !== undefined && body[k] !== null && !Array.isArray(body[k])) {
                failures.push(`${spec.tab}: expected "${k}" to be an array, got ${typeof body[k]}`);
              }
            }
          }
        }

        const itemEmitted = new Set<string>();
        if (arr && spec.itemNumeric) {
          arr.forEach((row, i) => {
            if (!row || typeof row !== "object" || Array.isArray(row)) {
              failures.push(`${spec.tab}.${chosenArrayKey}[${i}]: not an object`);
              return;
            }
            validateNumeric(`${spec.tab}.${chosenArrayKey}[${i}]`, row as Record<string, unknown>, spec.itemNumeric, failures, itemEmitted, nonFinite);
          });
        }

        snapshot[spec.tab] = {
          topAliases: [...topEmitted].sort(),
          arrayKey: chosenArrayKey,
          arrayLen: arr ? arr.length : null,
          itemAliases: [...itemEmitted].sort(),
        };
      }
    } finally {
      await adminSmoke(request, bearer, "DELETE").catch(() => {});
    }

    // eslint-disable-next-line no-console
    console.log("REPORTS_SHAPE_SNAPSHOT", JSON.stringify(snapshot, null, 2));

    // Dedicated assertion: NaN / Infinity must NEVER appear in any UI-normalized
    // numeric field. num() passes these through unchanged and they render as
    // "NaN" / "∞" in the UI, so they are a hard contract violation.
    expect(
      nonFinite,
      `Endpoints returned NaN/Infinity for num()-normalized fields:\n  - ${nonFinite.join("\n  - ")}`,
    ).toEqual([]);

    expect(failures, `Response-shape mismatches:\n  - ${failures.join("\n  - ")}`).toEqual([]);
  });
});
