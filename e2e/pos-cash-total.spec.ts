import { test, expect } from "@playwright/test";
import { getCreds, signIn, signOut } from "./helpers/auth";
import { readNumber } from "./helpers/totals";

const adminCreds = getCreds("admin");
const userCreds = getCreds("user");

test.describe("POS Terminal 'Today's cash' KPI scope by role", () => {
  test.skip(
    !adminCreds || !userCreds,
    "Set E2E_ADMIN_EMAIL/PASSWORD and E2E_USER_EMAIL/PASSWORD to run.",
  );

  test("admin POS shows 'All users' badge on Today's cash", async ({ page }) => {
    await signIn(page, adminCreds!);
    await page.goto("/pos");
    const kpi = page.locator('[data-testid="pos-today-cash"]');
    await expect(kpi).toBeVisible();
    await expect(kpi).toHaveAttribute("data-scope", "all", { timeout: 15_000 });
    await expect(kpi.getByText("All users")).toBeVisible();
  });

  test("standard user POS shows own-only Today's cash, no badge", async ({ page }) => {
    await signIn(page, userCreds!);
    await page.goto("/pos");
    const kpi = page.locator('[data-testid="pos-today-cash"]');
    await expect(kpi).toBeVisible();
    await expect(kpi).toHaveAttribute("data-scope", "own", { timeout: 15_000 });
    await expect(kpi.getByText("All users")).toHaveCount(0);
  });

  test("admin Today's cash >= standard user Today's cash", async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const userCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const userPage = await userCtx.newPage();
    try {
      await signIn(adminPage, adminCreds!);
      await adminPage.goto("/pos");
      await signIn(userPage, userCreds!);
      await userPage.goto("/pos");

      const adminVal = await readNumber(adminPage.locator('[data-testid="pos-today-cash-value"]'));
      const userVal = await readNumber(userPage.locator('[data-testid="pos-today-cash-value"]'));
      expect(adminVal).toBeGreaterThanOrEqual(userVal);
    } finally {
      await signOut(adminPage);
      await signOut(userPage);
      await adminCtx.close();
      await userCtx.close();
    }
  });
});
