import { expect, type Page, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNothingPastRightEdge,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

for (const locale of LOCALES) {
  test.describe(`landing ${homeUrl(locale)}`, () => {
    test("sets html lang to the locale", async ({ page }) => {
      await page.goto(homeUrl(locale));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
    });

    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await expectNoAxeViolations(page);
      });
    }

    test("names every landing section by its heading or label", async ({ page }) => {
      await page.goto(homeUrl(locale));
      const sections = await page.locator(".vk-home > section").evaluateAll((nodes) =>
        nodes.map((node) => {
          const ids = node.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
          const labelled = ids
            .map((id) => node.ownerDocument.getElementById(id))
            .filter((label) => label !== null && node.contains(label))
            .map((label) => label?.textContent?.trim() ?? "")
            .join(" ");
          return {
            id: node.id || node.getAttribute("aria-labelledby") || "",
            name: labelled || node.getAttribute("aria-label") || "",
          };
        }),
      );
      expect(sections.map((section) => section.id)).toEqual([
        "hero-title",
        "marquee",
        "statement",
        "highlights",
        "playground",
        "features",
        "faq",
        "closing-heading",
      ]);
      expect(sections.filter((section) => section.name === "")).toEqual([]);
    });

    for (const width of [320, 375]) {
      test(`reflows at ${width}px with every visible element inside the viewport`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(homeUrl(locale));
        await expectNoHorizontalScroll(page);
        await expectNothingPastRightEdge(page);
      });
    }
  });
}

test.describe("code frames", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("draw the focus ring of every focusable code block inside its frame", async ({ page }) => {
    await page.goto("/");
    const blocks = page.locator('.vk-code-frame-body pre[tabindex="0"]');
    const count = await blocks.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const block = blocks.nth(index);
      if (!(await block.isVisible())) continue;
      await block.focus();
      expect(await block.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
      await expect(block, `code block ${index}`).toHaveCSS("outline-offset", "-2px");
      await expect(block).toHaveCSS("outline-style", "solid");
    }
  });
});

test.describe("forced colors", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const PRIMARY = ".vk-btn-primary";

  async function primarySizes(page: Page) {
    return page.locator(PRIMARY).evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return [box.width, box.height] as const;
      }),
    );
  }

  test("paints the hero title in solid text instead of the gradient", async ({ page }) => {
    await page.goto("/");
    await page.emulateMedia({ forcedColors: "active" });
    const title = page.locator("section.vk-banner h1 .vk-banner-title-lit");
    await expect(title).toHaveCSS("background-image", "none");
    await expect(title).not.toHaveCSS("-webkit-text-fill-color", "rgba(0, 0, 0, 0)");
  });

  test("keeps a boundary on every primary button without changing its size", async ({ page }) => {
    await page.goto("/");
    const buttons = page.locator(PRIMARY);
    expect(await buttons.count()).toBeGreaterThanOrEqual(1);
    await expect(buttons.first()).toHaveCSS("outline-style", "none");
    await expect(buttons.first()).toHaveCSS("border-top-width", "0px");
    const normal = await primarySizes(page);
    await page.emulateMedia({ forcedColors: "active" });
    for (let index = 0; index < (await buttons.count()); index += 1) {
      await expect(buttons.nth(index)).toHaveCSS("outline-style", "solid");
      await expect(buttons.nth(index)).toHaveCSS("outline-width", "1px");
    }
    expect(await primarySizes(page)).toEqual(normal);
  });

  test("marks the Verbatra comparison column with a bar", async ({ page }) => {
    await page.goto("/compare");
    await page.emulateMedia({ forcedColors: "active" });
    const marks = page.locator(".vk-compare-mark");
    expect(await marks.count()).toBeGreaterThan(1);
    for (let index = 0; index < (await marks.count()); index += 1) {
      await expect(marks.nth(index)).toHaveCSS("border-left-width", "3px");
      await expect(marks.nth(index)).toHaveCSS("border-left-style", "solid");
    }
  });
});

test.describe("landing search", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const locale of LOCALES) {
    test(`opens the search dialog from the header trigger on ${homeUrl(locale)}`, async ({
      page,
    }) => {
      await page.goto(homeUrl(locale));
      await page.locator(".vk-header-search").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test(`opens the search dialog from the keyboard on ${homeUrl(locale)}`, async ({ page }) => {
      await page.goto(homeUrl(locale));
      await expect(page.locator(".vk-header-search")).toBeVisible();
      await page.keyboard.press("ControlOrMeta+k");
      await expect(page.getByRole("dialog")).toBeVisible();
    });
  }
});
