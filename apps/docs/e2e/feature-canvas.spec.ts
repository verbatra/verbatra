import { expect, type Locator, type Page, test } from "playwright/test";
import { expectNoHorizontalScroll } from "./support";

const CANVAS = "#features .vk-feature-visual canvas";
const COUNT = 6;

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
  test("draw visible pixels on every card and no text", async ({ page }) => {
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
    const canvas = page.locator(CANVAS).nth(3);
    await expect.poll(() => inkedPixels(canvas)).toBeGreaterThan(200);
    const first = await snapshot(canvas);
    await page.waitForTimeout(700);
    expect(await snapshot(canvas)).toBe(first);
  });

  test("follow the reduced motion preference when it changes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openFeatures(page);
    const canvas = page.locator(CANVAS).nth(3);
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
    const canvas = page.locator(CANVAS).nth(3);
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

test.describe("feature canvases on a narrow screen", () => {
  test("fit 320px without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openFeatures(page);
    await expectNoHorizontalScroll(page);
    const box = await page.locator("#features .vk-feature-visual").first().boundingBox();
    const canvas = await page.locator(CANVAS).first().boundingBox();
    expect(canvas?.width).toBe(box?.width);
    expect(Math.abs((canvas?.height ?? 0) - (box?.height ?? 0))).toBeLessThanOrEqual(1);
    await expect.poll(() => inkedPixels(page.locator(CANVAS).first())).toBeGreaterThan(100);
  });
});
