import { expect, type Page, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

const FLOW = "section#flow";
const PATH = `${FLOW} .vk-flow-path`;
const MARKS = `${FLOW} .vk-flow-mark`;
const DRAW_MARKER = "drawSVG";
const SCRAMBLE_MARKER = "scrambleText";

type Script = { url: string; draw: boolean; scramble: boolean };

function trackScripts(page: Page): () => Script[] {
  const scripts: Script[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "script") return;
    const body = await response.text().catch(() => "");
    scripts.push({
      url: response.url(),
      draw: body.includes(DRAW_MARKER),
      scramble: body.includes(SCRAMBLE_MARKER),
    });
  });
  return () => scripts;
}

async function observeLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shifts: number[] = [];
    Object.assign(window, { __flowShifts: shifts });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) shifts.push(shift.value);
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function totalShift(page: Page): Promise<number> {
  const shifts = await page.evaluate(
    () => (window as unknown as { __flowShifts?: number[] }).__flowShifts,
  );
  if (shifts === undefined) throw new Error("the layout-shift observer never started");
  return shifts.reduce((sum, value) => sum + value, 0);
}

async function waitForHydration(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
}

async function scrollToFraction(page: Page, fraction: number): Promise<void> {
  await page.evaluate(
    ([selector, share]) => {
      const list = document.querySelector(selector);
      if (!list) throw new Error("no flow list");
      const box = list.getBoundingClientRect();
      const top = window.scrollY + box.top;
      window.scrollTo(0, top + box.height * share - window.innerHeight * 0.7);
    },
    [`${FLOW} .vk-flow-list`, fraction] as const,
  );
}

async function expectDrawnStatically(page: Page): Promise<void> {
  await expect(page.locator(`${FLOW} [data-flow]`)).toHaveCount(0);
  await expect(page.locator(`${MARKS}[data-revealed]`)).toHaveCount(0);
  const dash = await page.locator(PATH).evaluate((path) => getComputedStyle(path).strokeDasharray);
  expect(dash).toBe("none");
  const items = page.locator(`${FLOW} ol.vk-flow-list > li`);
  expect(await items.count()).toBeGreaterThan(1);
  await expect(page.locator(MARKS)).toHaveCount(await items.count());
  for (const item of await items.all()) {
    await item.scrollIntoViewIfNeeded();
    await expect(item.locator("h3")).toBeVisible();
    await expect(item.locator(".vk-flow-snippet figure")).toBeVisible();
  }
  for (const mark of await page.locator(MARKS).all()) {
    expect(await mark.evaluate((node) => getComputedStyle(node, "::before").opacity)).toBe("1");
  }
}

for (const locale of LOCALES) {
  test.describe(`feature flow ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await waitForHydration(page);
        await expectNoAxeViolations(page, FLOW);
      });
    }
  });
}

test.describe("feature flow under reduced motion", () => {
  test("shows the whole path, every node and mark, and never loads the drawing code", async ({
    page,
  }) => {
    const scripts = trackScripts(page);
    await page.goto("/");
    await waitForHydration(page);
    await page.locator(FLOW).scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    await expectDrawnStatically(page);
    expect(scripts().filter((script) => script.draw)).toEqual([]);
  });
});

test.describe("feature flow without JavaScript", () => {
  test.use({ javaScriptEnabled: false, reducedMotion: "no-preference" });

  test("serves the drawn path and every node", async ({ page }) => {
    await page.goto("/");
    await expectDrawnStatically(page);
  });
});

test.describe("feature flow at 320px", () => {
  test("reflows without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    await page.locator(FLOW).scrollIntoViewIfNeeded();
    await expectNoHorizontalScroll(page);
    const overflowing = await page
      .locator(`${FLOW} .vk-flow-node`)
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.scrollWidth > node.clientWidth + 1)
          .map((node) => node.getAttribute("data-flow-node")),
      );
    expect(overflowing).toEqual([]);
  });
});

test.describe("the Try it playground inside the flow", () => {
  for (const width of [375, 1024, 1440]) {
    test(`keeps every scenario control inside its panel at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const panel = page.locator(`${FLOW} .vk-showcase`);
      await panel.scrollIntoViewIfNeeded();
      const box = await panel.boundingBox();
      if (box === null) throw new Error("no panel");
      for (const control of await panel.locator("button, input").all()) {
        if (!(await control.isVisible())) continue;
        const own = await control.boundingBox();
        if (own === null) continue;
        expect(own.x).toBeGreaterThanOrEqual(box.x - 1);
        expect(own.x + own.width).toBeLessThanOrEqual(box.x + box.width + 1);
      }
    });
  }

  test("runs a scenario by keyboard and announces it", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    const scenario = page.locator(`${FLOW} .vk-showcase-scenario`).first();
    await scenario.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        scenario.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__react"))),
      )
      .toBe(true);
    const status = page.locator(`${FLOW} .vk-showcase [role="status"]`);
    const before = await status.textContent();
    await scenario.focus();
    await page.keyboard.press("Enter");
    await expect(scenario).toHaveAttribute("aria-pressed", "true");
    await expect(status).not.toHaveText(before ?? "");
    await page.keyboard.press("Tab");
    await expect(page.locator(`${FLOW} .vk-showcase-scenario`).nth(1)).toBeFocused();
  });
});

test.describe("feature flow drawing", () => {
  test.use({ reducedMotion: "no-preference" });

  test("loads GSAP only when the flow nears the viewport, then draws the path with the scroll", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const scripts = trackScripts(page);
    await observeLayoutShift(page);

    const response = await page.goto("/");
    const html = (await response?.text()) ?? "";
    const initial = [...html.matchAll(/<script[^>]*\bsrc="([^"]+\.js)"/g)].map((match) => match[1]);
    await waitForHydration(page);
    await page.waitForLoadState("networkidle");
    expect(scripts().filter((script) => script.draw)).toEqual([]);

    await scrollToFraction(page, 0);
    await expect(page.locator(`${FLOW} .vk-flow`)).toHaveAttribute("data-flow", "drawing");
    const drawing = scripts().filter((script) => script.draw);
    expect(drawing.length).toBeGreaterThan(0);
    for (const script of drawing) {
      expect(script.scramble, script.url).toBe(false);
      expect(
        initial.some((src) => script.url.endsWith(src ?? "")),
        script.url,
      ).toBe(false);
    }

    await scrollToFraction(page, 0.5);
    await expect.poll(() => page.locator(`${MARKS}[data-revealed]`).count()).toBeGreaterThan(0);
    const total = await page.locator(MARKS).count();
    const revealed = await page.locator(`${MARKS}[data-revealed]`).count();
    expect(revealed).toBeLessThan(total);
    const dash = await page
      .locator(PATH)
      .evaluate((path) => getComputedStyle(path).strokeDasharray);
    expect(dash).not.toBe("none");

    await page.locator(`${FLOW} .vk-flow-list > li`).last().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await expect(page.locator(`${MARKS}[data-revealed]`)).toHaveCount(total);

    expect(await totalShift(page)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("returns to the drawn state when reduced motion turns on", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await scrollToFraction(page, 0);
    await expect(page.locator(`${FLOW} .vk-flow`)).toHaveAttribute("data-flow", "drawing");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expectDrawnStatically(page);
  });
});

test.describe("feature flow focus", () => {
  test("keeps a focused link near the bottom of the flow in view, clear of the header", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const link = page.locator(`${FLOW} .vk-flow-list > li`).last().locator("a");
    await link.focus();
    await expect(link).toBeFocused();
    const box = await link.boundingBox();
    const header = await page.locator("header").first().boundingBox();
    if (box === null || header === null) throw new Error("no box");
    expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(box.y + box.height).toBeLessThanOrEqual(667);
    const hit = await link.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return top !== null && node.contains(top);
    });
    expect(hit).toBe(true);
  });
});
