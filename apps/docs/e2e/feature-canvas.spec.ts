import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "playwright/test";
import { THEME_STORAGE_KEY, THEMES, type ThemeName } from "@/lib/theme";
import { expectNoHorizontalScroll, WCAG_TAGS } from "./support";

const CANVAS = "#features .vk-feature-visual canvas";
const COUNT = 5;
const SHOT = "#features .vk-feature-visual img";
const SHOWN_SHOT = `${SHOT} >> visible=true`;

async function openFeatures(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();
}

function snapshot(canvas: Locator): Promise<string> {
  return canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
}

function inkedPixels(canvas: Locator): Promise<number> {
  return canvas.evaluate((element) => {
    const source = element as HTMLCanvasElement;
    const context = source.getContext("2d");
    if (!context) return 0;
    const { data } = context.getImageData(0, 0, source.width, source.height);
    let inked = 0;
    for (let index = 3; index < data.length; index += 4) if ((data[index] ?? 0) > 0) inked += 1;
    return inked;
  });
}

test.describe("feature canvases", () => {
  test("draw visible pixels on every card but the studio card, and no text", async ({ page }) => {
    await openFeatures(page);
    const canvases = page.locator(CANVAS);
    await expect(canvases).toHaveCount(COUNT);
    for (let index = 0; index < COUNT; index += 1) {
      const canvas = canvases.nth(index);
      await expect(canvas).toHaveAttribute("aria-hidden", "true");
      await expect.poll(() => inkedPixels(canvas)).toBeGreaterThan(200);
    }
    await expect(page.locator("#features .vk-feature-visual")).toHaveText(["", "", "", "", "", ""]);
  });

  test("keep a fixed box so drawing shifts nothing", async ({ page }) => {
    await openFeatures(page);
    const visual = page.locator("#features .vk-feature-visual").first();
    const before = await visual.boundingBox();
    await expect.poll(() => inkedPixels(page.locator(CANVAS).first())).toBeGreaterThan(0);
    expect(await visual.boundingBox()).toEqual(before);
  });

  test("hold a static frame under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFeatures(page);
    const canvas = page.locator(CANVAS).nth(2);
    await expect.poll(() => inkedPixels(canvas)).toBeGreaterThan(200);
    const first = await snapshot(canvas);
    await page.waitForTimeout(700);
    expect(await snapshot(canvas)).toBe(first);
  });

  test("follow the reduced motion preference when it changes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openFeatures(page);
    const canvas = page.locator(CANVAS).nth(2);
    const moving = await snapshot(canvas);
    await expect.poll(() => snapshot(canvas)).not.toBe(moving);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(150);
    const held = await snapshot(canvas);
    await page.waitForTimeout(600);
    expect(await snapshot(canvas)).toBe(held);
  });

  test("redraw in the new colors when the theme changes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFeatures(page);
    const canvas = page.locator(CANVAS).first();
    await expect.poll(() => inkedPixels(canvas)).toBeGreaterThan(200);
    const before = await snapshot(canvas);
    await page.evaluate(() => document.documentElement.classList.toggle("light"));
    await expect.poll(() => snapshot(canvas)).not.toBe(before);
  });
});

test.describe("feature canvases in motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("animate on screen and stop drawing once scrolled away", async ({ page }) => {
    await openFeatures(page);
    const canvas = page.locator(CANVAS).nth(2);
    const first = await snapshot(canvas);
    await expect.poll(() => snapshot(canvas)).not.toBe(first);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const away = await snapshot(canvas);
    await page.waitForTimeout(700);
    expect(await snapshot(canvas)).toBe(away);

    await canvas.scrollIntoViewIfNeeded();
    await expect.poll(() => snapshot(canvas)).not.toBe(away);
  });
});

test.describe("feature canvases on the narrowest screen that shows them", () => {
  test("fit 640px without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    await openFeatures(page);
    await expectNoHorizontalScroll(page);
    const box = await page
      .locator("#features .vk-feature-visual:has(canvas)")
      .first()
      .boundingBox();
    const canvas = await page.locator(CANVAS).first().boundingBox();
    expect(canvas?.width).toBe(box?.width);
    expect(Math.abs((canvas?.height ?? 0) - (box?.height ?? 0))).toBeLessThanOrEqual(1);
    await expect.poll(() => inkedPixels(page.locator(CANVAS).first())).toBeGreaterThan(100);
  });
});

function shotRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    const match = /studio-overview-(dark|light)\.webp/.exec(decodeURIComponent(request.url()));
    if (match) seen.push(match[1] ?? "");
  });
  return seen;
}

async function storeTheme(page: Page, theme: ThemeName): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    [THEME_STORAGE_KEY, theme],
  );
}

test.describe("studio card screenshot", () => {
  test("is decorative, lazy, at its intrinsic size, with exactly one image showing", async ({
    page,
  }) => {
    await openFeatures(page);
    const images = page.locator(SHOT);
    await expect(images).toHaveCount(2);
    for (const image of await images.all()) {
      await expect(image).toHaveAttribute("alt", "");
      await expect(image).toHaveAttribute("aria-hidden", "true");
      await expect(image).toHaveAttribute("loading", "lazy");
      await expect(image).toHaveAttribute("width", "2880");
      await expect(image).toHaveAttribute("height", "1280");
    }
    const shown = page.locator(SHOWN_SHOT);
    await expect(shown).toHaveCount(1);
    await expect
      .poll(() => shown.evaluate((element) => (element as HTMLImageElement).complete))
      .toBe(true);
    expect(
      await shown.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
  });

  test("has the height of its row neighbours and of every other visual", async ({ page }) => {
    await openFeatures(page);
    const cards = page.locator("#features .vk-feature");
    const studio = await cards.first().boundingBox();
    const neighbour = await cards.nth(1).boundingBox();
    expect(studio?.y).toBe(neighbour?.y);
    expect(studio?.height).toBe(neighbour?.height);
    const visuals = await page
      .locator("#features .vk-feature-visual")
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    expect(new Set(visuals).size).toBe(1);
  });

  test("requests nothing from another host and shifts no layout", async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? "http://127.0.0.1:3107").origin;
    const foreign: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith("data:") && new URL(url).origin !== origin) foreign.push(url);
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __shift: number };
      w.__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as Array<{
          value: number;
          hadRecentInput: boolean;
        }>) {
          if (!entry.hadRecentInput) w.__shift += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await openFeatures(page);
    await expect
      .poll(() =>
        page.locator(SHOWN_SHOT).evaluate((element) => (element as HTMLImageElement).complete),
      )
      .toBe(true);
    await page.waitForTimeout(300);
    expect(foreign).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __shift: number }).__shift)).toBe(0);
  });

  for (const theme of THEMES) {
    for (const entry of ["scrolled to", "opened at the anchor of"] as const) {
      test(`requests only the ${theme} file when ${entry} the section`, async ({ page }) => {
        await storeTheme(page, theme);
        const seen = shotRequests(page);
        if (entry === "scrolled to") {
          await openFeatures(page);
        } else {
          await page.goto("/#features");
        }
        await expect
          .poll(() =>
            page.locator(SHOWN_SHOT).evaluate((element) => (element as HTMLImageElement).complete),
          )
          .toBe(true);
        await page.waitForTimeout(500);
        expect(new Set(seen)).toEqual(new Set([theme]));
      });
    }
  }

  test("follows the site theme through the stylesheet alone", async ({ page }) => {
    await openFeatures(page);
    const shown = () =>
      page
        .locator(SHOWN_SHOT)
        .evaluate((element) => decodeURIComponent((element as HTMLImageElement).currentSrc));
    await expect.poll(shown).toContain("studio-overview-dark");
    await page.getByRole("button", { name: "Light theme" }).first().click();
    await expect.poll(shown).toContain("studio-overview-light");
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("renders exactly one image", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(SHOWN_SHOT)).toHaveCount(1);
    });
  });

  test("fits 320px without horizontal overflow, the image box inside its visual", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openFeatures(page);
    await expectNoHorizontalScroll(page);
    const visual = await page.locator("#features .vk-feature-visual:has(img)").boundingBox();
    const box = await page.locator(SHOWN_SHOT).boundingBox();
    expect(box?.x).toBe(visual?.x);
    expect(box?.y).toBe(visual?.y);
    expect(box?.width).toBe(visual?.width);
    expect(box?.height).toBeLessThanOrEqual(visual?.height ?? 0);
  });

  for (const path of ["/", "/de"]) {
    test(`leaves no color contrast of ${path} features unverified`, async ({ page }) => {
      await page.goto(path);
      await page.locator("#features").scrollIntoViewIfNeeded();
      const { incomplete } = await new AxeBuilder({ page })
        .withTags([...WCAG_TAGS])
        .include("#features")
        .analyze();
      expect(
        incomplete
          .filter(({ id }) => id === "color-contrast")
          .flatMap(({ nodes }) => nodes.map((node) => node.target.join(" "))),
      ).toEqual([]);
    });
  }
});
