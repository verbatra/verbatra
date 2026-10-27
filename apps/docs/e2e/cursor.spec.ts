import { expect, test } from "playwright/test";

test.describe("pointer cursor on controls", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("shows a pointer on the docs sidebar, header, code and theme controls", async ({ page }) => {
    await page.goto("/docs/cli/translate");
    await expect(page.locator("#nd-page")).toBeVisible();
    await expect(page.locator("#nd-sidebar button[aria-expanded]").first()).toHaveCSS(
      "cursor",
      "pointer",
    );
    await expect(page.locator("#nd-subnav [data-search], .vk-header-search").first()).toHaveCSS(
      "cursor",
      "pointer",
    );
    await expect(page.locator("figure.shiki button").first()).toHaveCSS("cursor", "pointer");
    await expect(page.locator("[data-theme-toggle]").first()).toHaveCSS("cursor", "pointer");
  });

  test("shows a pointer on a search result row", async ({ page }) => {
    await page.goto("/docs/cli/translate");
    await page.locator(".vk-header-search").first().click();
    await page.getByRole("combobox").fill("translate");
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible();
    await expect(option).toHaveCSS("cursor", "pointer");
  });
});
