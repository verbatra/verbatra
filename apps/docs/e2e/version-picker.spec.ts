import { expect, type Page, test } from "playwright/test";
import { VERSION_STORAGE_KEY } from "@/lib/release-lines.mjs";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNothingPastRightEdge,
  openInTheme,
  pageUrl,
  THEMES,
} from "./support";

const PAGE = "/docs/cli/translate";
const OLDER_CLI = "0.9";
const PILLS = ".vk-available-from[data-vk-pkg]";
const NOTICE = "#nd-page .vk-version-notice";

async function storeChoices(page: Page, choices: Record<string, string>): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
    },
    [VERSION_STORAGE_KEY, JSON.stringify(choices)] as const,
  );
}

async function withoutScripts(page: Page): Promise<void> {
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
}

async function visiblePills(page: Page): Promise<number> {
  return page
    .locator(PILLS)
    .evaluateAll((nodes) => nodes.filter((n) => n.checkVisibility()).length);
}

test.describe("version picker", () => {
  test("shows no version pill and no notice on Latest", async ({ page }) => {
    await page.goto(PAGE);
    expect(await page.locator(PILLS).count()).toBeGreaterThan(0);
    expect(await visiblePills(page)).toBe(0);
    await expect(page.locator(NOTICE)).toBeHidden();
    await expect(page.locator("#nd-subnav .vk-version-select").first()).toHaveValue("latest");
  });

  test("shows no pill without JavaScript either", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(PAGE);
    expect(await visiblePills(page)).toBe(0);
    await expect(page.locator(".vk-version-picker").first()).toBeHidden();
    await context.close();
  });

  test("picking an older line shows the newer pills and the page notice", async ({ page }) => {
    await page.goto(PAGE);
    const select = page.locator("#nd-subnav .vk-version-select").first();
    await select.selectOption(OLDER_CLI);
    await expect(page.locator("html")).toHaveAttribute("data-vk-cli", OLDER_CLI);
    await expect(page.locator(NOTICE)).toBeVisible();
    const shown = await page
      .locator(PILLS)
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.checkVisibility())
          .map((node) => node.getAttribute("data-vk-since")),
      );
    expect(shown.length).toBeGreaterThan(0);
    const minors = shown.map((since) => Number((since ?? "").split(".")[1]));
    for (const minor of minors) expect(minor).toBeGreaterThan(9);
    const hidden = await page
      .locator(`${PILLS}[data-vk-since="0.9.0"]`)
      .evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length);
    expect(hidden).toBe(0);
    await expect(page.locator(PILLS).filter({ visible: true }).first()).toHaveAttribute(
      "title",
      /.+/,
    );
  });

  test("picking Latest hides them again", async ({ page }) => {
    await storeChoices(page, { cli: OLDER_CLI });
    await page.goto(PAGE);
    expect(await visiblePills(page)).toBeGreaterThan(0);
    await page.locator("#nd-subnav .vk-version-select").first().selectOption("latest");
    expect(await visiblePills(page)).toBe(0);
    await expect(page.locator(NOTICE)).toBeHidden();
  });

  test("applies a stored choice on first paint, before any script bundle loads", async ({
    page,
  }) => {
    await storeChoices(page, { cli: OLDER_CLI });
    await withoutScripts(page);
    await page.goto(PAGE);
    expect(await visiblePills(page)).toBeGreaterThan(0);
    await expect(page.locator(NOTICE)).toBeVisible();
  });

  test("applies a stored choice for Studio and MCP independently", async ({ page }) => {
    await storeChoices(page, { studio: "0.5" });
    await withoutScripts(page);
    await page.goto("/docs/cli/studio");
    const packages = await page
      .locator(PILLS)
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.checkVisibility())
          .map((node) => node.getAttribute("data-vk-pkg")),
      );
    expect(packages.length).toBeGreaterThan(0);
    expect(new Set(packages)).toEqual(new Set(["studio"]));
  });

  test("keeps the choice across reload and client navigation", async ({ page }) => {
    await page.goto(PAGE);
    const select = page.locator("#nd-subnav .vk-version-select").first();
    await select.selectOption(OLDER_CLI);
    await page.reload();
    await expect(page.locator("#nd-subnav .vk-version-select").first()).toHaveValue(OLDER_CLI);
    expect(await visiblePills(page)).toBeGreaterThan(0);
    await page.locator('#nd-sidebar a[href="/docs/cli/check"]').first().click();
    await expect(page).toHaveURL(/\/docs\/cli\/check$/);
    await expect(page.locator("html")).toHaveAttribute("data-vk-cli", OLDER_CLI);
    expect(await visiblePills(page)).toBeGreaterThan(0);
  });

  test("falls back to Latest when the stored value is not a known line", async ({ page }) => {
    await storeChoices(page, { cli: "0.99" });
    await page.goto(PAGE);
    expect(await visiblePills(page)).toBe(0);
    await expect(page.locator("#nd-subnav .vk-version-select").first()).toHaveValue("latest");
  });

  test("keeps the choice out of the URL", async ({ page }) => {
    await page.goto(PAGE);
    await page.locator("#nd-subnav .vk-version-select").first().selectOption(OLDER_CLI);
    expect(new URL(page.url()).search).toBe("");
    expect(new URL(page.url()).pathname).toBe(PAGE);
  });

  test("moves nothing in the header when the picker hydrates", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withoutScripts(page);
    await page.goto(PAGE);
    const select = page.locator("#nd-subnav .vk-version-select").first();
    const before = await select.boundingBox();
    const headerBefore = await page.locator("#nd-subnav").boundingBox();
    await page.unroute("**/_next/static/**/*.js");
    await page.goto(PAGE);
    await expect(page.locator("html"))
      .toHaveAttribute("data-motion-ready", /.*/)
      .catch(() => {});
    await page.waitForLoadState("networkidle");
    const after = await page.locator("#nd-subnav .vk-version-select").first().boundingBox();
    const headerAfter = await page.locator("#nd-subnav").boundingBox();
    expect(after).toEqual(before);
    expect(headerAfter?.height).toBe(headerBefore?.height);
  });

  test("keeps Studio and MCP behind a disclosure that opens and closes by keyboard", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PAGE);
    const toggle = page.locator("#nd-subnav .vk-version-more-toggle");
    const studio = page.locator("#nd-subnav .vk-version-panel .vk-version-select").first();
    await expect(studio).toBeHidden();
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(studio).toBeVisible();
    await expect(page.locator("#nd-subnav .vk-version-panel label").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(studio).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  for (const theme of THEMES) {
    test(`has no axe violations in the ${theme} theme with the pills visible`, async ({ page }) => {
      await storeChoices(page, { cli: OLDER_CLI });
      await openInTheme(page, PAGE, theme);
      await expect(page.locator(NOTICE)).toBeVisible();
      expect(await visiblePills(page)).toBeGreaterThan(0);
      await expectNoAxeViolations(page);
    });
  }

  test("is reachable in the mobile navigation at 320px without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(PAGE);
    await expect(page.locator("#nd-subnav .vk-version-picker").first()).toBeHidden();
    await page.locator('#nd-subnav button[aria-controls="nd-sidebar-mobile"]').click();
    const drawer = page.locator("#nd-sidebar-mobile");
    const select = drawer.locator(".vk-version-select").first();
    await expect(select).toBeVisible();
    await expect(drawer.locator("label", { hasText: "CLI/SDK" })).toBeVisible();
    const box = await select.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    await select.selectOption(OLDER_CLI);
    await expect(page.locator("html")).toHaveAttribute("data-vk-cli", OLDER_CLI);
    await expectNoHorizontalScroll(page);
  });

  test("keeps the phone drawer open when Escape closes the disclosure", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(PAGE);
    await page.locator('#nd-subnav button[aria-controls="nd-sidebar-mobile"]').click();
    const drawer = page.locator("#nd-sidebar-mobile");
    const toggle = drawer.locator(".vk-version-more-toggle");
    await toggle.click();
    await expect(drawer.locator(".vk-version-panel .vk-version-select").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer.locator(".vk-version-panel .vk-version-select").first()).toBeHidden();
    await expect(drawer).toBeVisible();
    await expect(toggle).toBeFocused();
    const box = await toggle.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test("places a revealed pill inside its heading and inside a table cell", async ({ page }) => {
    await storeChoices(page, { cli: "0.5" });
    await page.goto(PAGE);
    const inHeading = page.locator(`:is(h2, h3, h4) ${PILLS}`).filter({ visible: true });
    expect(await inHeading.count()).toBeGreaterThan(0);
    await storeChoices(page, { cli: "0.12" });
    await page.goto("/docs/cli/doctor");
    const inCell = await page
      .locator(`:is(td, th) ${PILLS}`)
      .evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length);
    expect(inCell).toBeGreaterThan(0);
  });

  test("reflows at 320px with pills visible", async ({ page }) => {
    await storeChoices(page, { cli: "0.5" });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(pageUrl("en", PAGE));
    expect(await visiblePills(page)).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page);
    await expectNothingPastRightEdge(page);
  });

  test("keeps the selects labelled and inside the viewport in the header from 1024px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto(PAGE);
    const select = page.locator("#nd-subnav .vk-version-select").first();
    await expect(select).toBeVisible();
    await expect(page.locator("#nd-subnav label", { hasText: "CLI/SDK" })).toBeVisible();
    await expectNothingPastRightEdge(page);
  });
});

test.describe("markdown output", () => {
  test("states every version in full whatever the picker holds", async ({ request }) => {
    const response = await request.get(`${PAGE}.md`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('<AvailableFrom version="0.12.0" />');
    expect(body).not.toContain("data-vk-");
    expect(body).not.toContain("vk-version");
  });
});
