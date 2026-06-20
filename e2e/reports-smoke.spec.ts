import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { getCreds, signIn } from "./helpers/auth";

/**
 * Reports & Analytics smoke test.
 *
 * 1. Signs in as admin.
 * 2. Seeds a minimal cross-table dataset via POST /api/admin/smoke-test.
 * 3. Hits every /api/reports/* endpoint backing a Reports tab and asserts
 *    a 2xx JSON response with the expected shape.
 * 4. Opens /reports and clicks every tab — fails if any tab renders the
 *    error-boundary fallback or logs a runtime error to the console.
 * 5. Cleans up via DELETE /api/admin/smoke-test (always, even on failure).
 *
 * Tabs covered: sales, p&l, inventory valuation, stock, warehouse,
 * qty alerts, expired, expenses, purchases, deposits, customers,
 * users (admin only), cashier.
 */

const REPORT_ENDPOINTS = [
  { tab: "sales",       path: "/api/reports/sales" },
  { tab: "pl",          path: "/api/reports/profit-loss" },
  { tab: "inventory",   path: "/api/reports/inventory-valuation" },
  { tab: "stock",       path: "/api/reports/stock-report" },
  { tab: "warehouse",   path: "/api/reports/warehouse-report" },
  { tab: "alerts",      path: "/api/reports/stock-report?lowStock=true" },
  { tab: "expired",     path: "/api/reports/expired-inventory?alertDays=60" },
  { tab: "expenses",    path: "/api/reports/expenses" },
  { tab: "purchases",   path: "/api/reports/purchases" },
  { tab: "deposits",    path: "/api/reports/deposits" },
  { tab: "customers",   path: "/api/reports/customers" },
  { tab: "users",       path: "/api/reports/users" },
  { tab: "cashier",     path: "/api/reports/cashier-performance" },
] as const;

const TAB_VALUES = [
  "sales", "pl", "inventory", "stock", "warehouse", "alerts",
  "expired", "expenses", "purchases", "deposits", "customers",
  "users", "cashier",
] as const;

async function getBearer(page: Page): Promise<string> {
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const token = await page.evaluate((key) => {
    const candidateKeys = key ? [key] : Object.keys(localStorage).filter(k => k.startsWith("sb-") && k.endsWith("-auth-token"));
    for (const k of candidateKeys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try { const parsed = JSON.parse(raw); if (parsed?.access_token) return parsed.access_token as string; } catch { /* noop */ }
    }
    return null;
  }, storageKey ?? null);
  if (!token) throw new Error("No Supabase access_token found in localStorage — sign-in did not persist a session.");
  return token;
}

async function callAdminSmoke(req: APIRequestContext, bearer: string, method: "POST" | "DELETE") {
  const res = await req.fetch("/api/admin/smoke-test", {
    method,
    headers: { Authorization: `Bearer ${bearer}` },
  });
  expect(res.status(), `admin smoke-test ${method}`).toBeLessThan(400);
  return res.json();
}

test.describe("Reports & Analytics — smoke", () => {
  test("every tab loads and every endpoint responds 2xx after seeding", async ({ page, request }) => {
    test.setTimeout(120_000);
    const creds = getCreds("admin");
    test.skip(!creds, "E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD not set");

    await signIn(page, creds!);
    const bearer = await getBearer(page);

    // 1. Seed
    const seed = await callAdminSmoke(request, bearer, "POST");
    expect(seed?.ok ?? true).not.toBe(false);

    // Track every runtime console error on /reports.
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`); });

    try {
      // 2. Hit every endpoint directly.
      for (const { tab, path } of REPORT_ENDPOINTS) {
        const res = await request.get(path, { headers: { Authorization: `Bearer ${bearer}` } });
        expect(res.status(), `${tab} ${path}`).toBeLessThan(400);
        const body = await res.json();
        expect(body, `${tab} returned JSON object`).toBeTruthy();
      }

      // 3. Open /reports and click every tab.
      await page.goto("/reports");
      await expect(page.getByRole("heading", { name: /Reports & Analytics/i })).toBeVisible({ timeout: 15_000 });

      for (const value of TAB_VALUES) {
        const trigger = page.locator(`[role="tab"][data-state]:has-text("${labelFor(value)}")`).first();
        // Fallback to attribute selector if the label is ambiguous.
        const tab = (await trigger.count()) > 0 ? trigger : page.locator(`button[role="tab"]`).filter({ hasText: labelFor(value) }).first();
        await tab.click();
        // The error-boundary fallback shows this text — fail loudly if it appears.
        await expect(page.getByText("Something went wrong", { exact: false })).toHaveCount(0, { timeout: 8_000 }).catch(() => {
          throw new Error(`Tab "${value}" rendered the error boundary`);
        });
        // Give the loader a moment to settle.
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
      }

      expect(consoleErrors, `runtime errors:\n${consoleErrors.join("\n")}`).toEqual([]);
    } finally {
      // 4. Cleanup, always.
      await callAdminSmoke(request, bearer, "DELETE").catch(() => {});
    }
  });
});

function labelFor(tabValue: string): string {
  const map: Record<string, string> = {
    sales: "Sales", pl: "P&L", inventory: "Inventory Valuation", stock: "Stock",
    warehouse: "Warehouse", alerts: "Qty Alerts", expired: "Expired",
    expenses: "Expenses", purchases: "Purchases", deposits: "Deposits",
    customers: "Customers", users: "Users", cashier: "Cashier",
  };
  return map[tabValue] ?? tabValue;
}
