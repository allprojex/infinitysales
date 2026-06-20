import { test, expect } from "@playwright/test";
import { getCreds, signIn, signOut } from "./helpers/auth";
import { readNumber } from "./helpers/totals";

const adminCreds = getCreds("admin");
const userCreds = getCreds("user");

test.describe("Dashboard cash totals scope by role", () => {
  test.skip(
    !adminCreds || !userCreds,
    "Set E2E_ADMIN_EMAIL/PASSWORD and E2E_USER_EMAIL/PASSWORD to run.",
  );

  test("admin sees system-wide totals with 'All users' badge", async ({ page }) => {
    await signIn(page, adminCreds!);

    const revenueCard = page.locator('[data-testid="kpi-total-revenue"]');
    const poCard = page.locator('[data-testid="kpi-purchase-orders"]');

    await expect(revenueCard).toHaveAttribute("data-scope", "all");
    await expect(poCard).toHaveAttribute("data-scope", "all");
    await expect(revenueCard.getByText("All users")).toBeVisible();
    await expect(poCard.getByText("All users")).toBeVisible();
  });

  test("standard user sees only own totals, no 'All users' badge", async ({ page }) => {
    await signIn(page, userCreds!);

    const revenueCard = page.locator('[data-testid="kpi-total-revenue"]');
    const poCard = page.locator('[data-testid="kpi-purchase-orders"]');

    await expect(revenueCard).toHaveAttribute("data-scope", "own");
    await expect(poCard).toHaveAttribute("data-scope", "own");
    await expect(revenueCard.getByText("All users")).toHaveCount(0);
    await expect(poCard.getByText("All users")).toHaveCount(0);
  });

  test("admin revenue >= standard user revenue (system-wide >= own)", async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const userCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const userPage = await userCtx.newPage();
    try {
      await signIn(adminPage, adminCreds!);
      await signIn(userPage, userCreds!);

      const adminRevenue = await readNumber(adminPage.locator('[data-testid="kpi-total-revenue-value"]'));
      const userRevenue = await readNumber(userPage.locator('[data-testid="kpi-total-revenue-value"]'));
      expect(adminRevenue).toBeGreaterThanOrEqual(userRevenue);

      const adminSpend = await readNumber(adminPage.locator('[data-testid="kpi-purchase-orders-spend"]'));
      const userSpend = await readNumber(userPage.locator('[data-testid="kpi-purchase-orders-spend"]'));
      expect(adminSpend).toBeGreaterThanOrEqual(userSpend);
    } finally {
      await signOut(adminPage);
      await signOut(userPage);
      await adminCtx.close();
      await userCtx.close();
    }
  });
});
