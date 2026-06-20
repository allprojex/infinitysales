import { test, expect, Page } from "@playwright/test";
import { getCreds, signIn } from "./helpers/auth";
import { readNumber } from "./helpers/totals";

/**
 * Verifies the POS "Today's cash" KPI eventually updates live (without a
 * manual refresh) even when the network is slow. We simulate latency by
 * delaying every /api/reports/* response — the realtime invalidation still
 * fires, but the refetch takes noticeably longer.
 */

const SLOW_MS = 2500;

async function apiFetch<T = unknown>(page: Page, path: string, init?: RequestInit): Promise<T> {
  return page.evaluate(async ({ path, init }) => {
    const token = localStorage.getItem("accessToken");
    const headers = new Headers(init?.headers as HeadersInit);
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const res = await fetch(path, { ...init, headers });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`);
    try { return JSON.parse(text); } catch { return text as unknown; }
  }, { path, init: init as any });
}

async function pickProductId(page: Page): Promise<string | number | null> {
  try {
    const list = await apiFetch<{ data?: Array<{ id: string | number }> }>(
      page,
      "/api/products?limit=1",
    );
    return list?.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function postCashSale(page: Page, productId: string | number) {
  return apiFetch(page, "/api/sales", {
    method: "POST",
    body: JSON.stringify({
      items: [{ productId, quantity: 1 }],
      tax: 0,
      status: "completed",
      channel: "pos",
      payment_method: "cash",
    }),
  });
}

async function liveCashTotal(page: Page): Promise<number> {
  return readNumber(page.locator('[data-testid="pos-today-cash-value"]'));
}

function runSlowNetworkTest(role: "admin" | "user") {
  test(`${role}: KPI eventually updates live on slow network (no refresh)`, async ({ page }) => {
    const creds = getCreds(role);
    test.skip(!creds, `Set E2E_${role.toUpperCase()}_EMAIL / E2E_${role.toUpperCase()}_PASSWORD to run.`);
    await signIn(page, creds!);
    await page.goto("/pos");

    const kpi = page.locator('[data-testid="pos-today-cash"]');
    await expect(kpi).toBeVisible();
    await expect(kpi).not.toHaveAttribute("data-scope", "loading", { timeout: 20_000 });

    const productId = await pickProductId(page);
    test.skip(productId == null, `No product available for the ${role} account to post a test sale.`);

    const before = await liveCashTotal(page);
    const urlBefore = page.url();

    // Throttle all KPI/report requests AFTER initial load so the refetch
    // triggered by the realtime invalidation is visibly slow.
    await page.route("**/api/reports/**", async (route) => {
      await new Promise((r) => setTimeout(r, SLOW_MS));
      await route.continue();
    });

    const sale = await postCashSale(page, productId!) as { total?: number };
    const saleTotal = Number(sale?.total ?? 0);

    // Generous timeout to absorb the simulated latency + realtime fan-out.
    await expect.poll(() => liveCashTotal(page), {
      message: "Today's cash KPI did not update on slow network",
      timeout: 45_000,
      intervals: [1000, 2000, 3000],
    }).toBeGreaterThan(before);

    const after = await liveCashTotal(page);
    if (saleTotal > 0) {
      expect(Math.abs((after - before) - saleTotal)).toBeLessThanOrEqual(0.02);
    } else {
      expect(after).toBeGreaterThan(before);
    }

    // No full-page navigation should have occurred.
    expect(page.url()).toBe(urlBefore);

    await page.unroute("**/api/reports/**");
  });
}

test.describe("POS Today's cash KPI — slow network live update", () => {
  runSlowNetworkTest("admin");
  runSlowNetworkTest("user");
});
