import { expect, type Page, test } from "playwright/test";
import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import es from "../messages/es.json" with { type: "json" };
import fr from "../messages/fr.json" with { type: "json" };
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

const FAB = "button.vk-scroll-top";
const LABELS = { en, de, es, fr } as const;

async function ready(page: Page, url = "/"): Promise<void> {
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
  await expect(page.locator(".vk-scroll-top-sentinel")).toHaveCount(1);
}

async function scrollPastFirstViewport(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
}

for (const locale of LOCALES) {
  test(`back to top on ${homeUrl(locale)} is named in the reader's language`, async ({ page }) => {
    await ready(page, homeUrl(locale));
    await scrollPastFirstViewport(page);
    await expect(page.locator(FAB)).toHaveAccessibleName(LABELS[locale].landing.fab.label);
  });

  for (const theme of THEMES) {
    test(`back to top on ${homeUrl(locale)} has no axe violations while shown in the ${theme} theme`, async ({
      page,
    }) => {
      await openInTheme(page, homeUrl(locale), theme);
      await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
      await scrollPastFirstViewport(page);
      await expect(page.locator(FAB)).toBeVisible();
      await expectNoAxeViolations(page, FAB);
    });
  }

  test(`back to top on ${homeUrl(locale)} reflows at 320px while shown`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ready(page, homeUrl(locale));
    await scrollPastFirstViewport(page);
    const box = await page.locator(FAB).boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    await expectNoHorizontalScroll(page);
  });
}

test("wraps the back to top sentinel in a block island, never a span", async ({ page }) => {
  await ready(page);
  await expect(page.locator("span .vk-scroll-top-sentinel")).toHaveCount(0);
  await expect(page.locator("div.vk-island > .vk-scroll-top-sentinel")).toHaveCount(1);
});

test.describe("back to top", () => {
  test("stays hidden in the first viewport and appears after it", async ({ page }) => {
    await ready(page);
    await expect(page.locator(FAB)).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 0.9));
    await expect(page.locator(FAB)).toHaveCount(0);
    await scrollPastFirstViewport(page);
    await expect(page.locator(FAB)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator(FAB)).toHaveCount(0);
  });

  test("jumps to the top at once under reduced motion and moves focus to main", async ({
    page,
  }) => {
    await ready(page);
    await scrollPastFirstViewport(page);
    await page.locator(FAB).click();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator("main#main-content")).toBeFocused();
    await expect(page.locator(FAB)).toHaveCount(0);
  });

  test("works from the keyboard", async ({ page }) => {
    await ready(page);
    await scrollPastFirstViewport(page);
    await page.locator(FAB).focus();
    await expect(page.locator(FAB)).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main-content")).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("is a 44px target in the end corner, inside the safe area, at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await ready(page);
    await scrollPastFirstViewport(page);
    const box = await page.locator(FAB).boundingBox();
    if (!box) throw new Error("no button");
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(375 - 16 + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(700 - 16 + 0.5);
  });

  test("never covers a focused element from the FAQ to the end of the page at 375px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await ready(page);
    await page.locator("section#faq summary").first().focus();
    let checked = 0;
    for (let step = 0; step < 120; step += 1) {
      await page.keyboard.press("Tab");
      const result = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return { done: true, overlap: false, name: "" };
        const fab = document.querySelector("button.vk-scroll-top");
        if (!fab || active === fab) return { done: false, overlap: false, name: "fab" };
        const a = active.getBoundingClientRect();
        const b = fab.getBoundingClientRect();
        const overlap =
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return { done: false, overlap, name: active.outerHTML.slice(0, 80) };
      });
      if (result.done) break;
      expect(result.overlap, result.name).toBe(false);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
  });
});

test.describe("back to top with motion welcome", () => {
  test.use({ reducedMotion: "no-preference" });

  test("scrolls smoothly to the top and then moves focus to main", async ({ page }) => {
    await ready(page);
    const start = await page.evaluate(() => {
      window.scrollTo(0, window.innerHeight * 4);
      return window.scrollY;
    });
    await page.evaluate(() => {
      const seen: number[] = [];
      (window as unknown as { seenScroll: number[] }).seenScroll = seen;
      const record = () => {
        seen.push(window.scrollY);
        if (window.scrollY > 0) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });
    await page.locator(FAB).click();
    await expect(page.locator("main#main-content")).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const seen = await page.evaluate(
      () => (window as unknown as { seenScroll: number[] }).seenScroll,
    );
    expect(seen.some((y) => y > 0 && y < start)).toBe(true);
  });
});

async function interruptOnceInFlow(page: Page): Promise<void> {
  await page.evaluate(() => {
    let armed = true;
    const interrupt = () => {
      const flow = document.querySelector(".vk-flow");
      if (!armed || !flow || flow.getBoundingClientRect().top < -200) return;
      armed = false;
      removeEventListener("scroll", interrupt);
      const scroller = document.scrollingElement;
      if (scroller) scroller.scrollTop = window.scrollY;
    };
    addEventListener("scroll", interrupt, { passive: true });
  });
}

test.describe("back to top when a scroll-linked island resets the scroll on the way up", () => {
  test.use({ reducedMotion: "no-preference", colorScheme: "dark" });

  for (const locale of ["en", "es"] as const) {
    test(`still reaches the top from the footer of ${homeUrl(locale)} at 1440px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await ready(page, homeUrl(locale));
      await page.keyboard.press("End");
      await expect
        .poll(() =>
          page.evaluate(
            () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
          ),
        )
        .toBe(true);
      await interruptOnceInFlow(page);
      await page.locator(FAB).click();
      await expect(page.locator("main#main-content")).toBeFocused();
      await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 8000 }).toBe(0);
    });
  }
});

test.describe("back to top without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("renders no button and keeps no room clear for one", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(FAB)).toHaveCount(0);
    await expect(page.locator(".vk-scroll-top-sentinel")).toHaveCount(1);
    await expect(page.locator("footer.vk-footer")).toHaveCSS("padding-bottom", "0px");
    await expect(page.locator("html")).toHaveCSS("scroll-padding-bottom", "auto");
  });
});

test("clears room for the button under the footer once it can render", async ({ page }) => {
  await ready(page);
  await expect(page.locator("footer.vk-footer")).not.toHaveCSS("padding-bottom", "0px");
  await expect(page.locator("html")).not.toHaveCSS("scroll-padding-bottom", "auto");
});
