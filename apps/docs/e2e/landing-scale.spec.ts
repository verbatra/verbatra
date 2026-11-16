import { expect, test } from "playwright/test";
import { homeUrl, LOCALES } from "./support";

const DESKTOP_WIDTHS = [1024, 1366, 1440] as const;

for (const locale of LOCALES) {
  for (const width of DESKTOP_WIDTHS) {
    test(`wraps no demo code line that the 12px size did not wrap in ${locale} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(homeUrl(locale), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const { now, before, total } = await page.evaluate(() => {
        const lines = Array.from(document.querySelectorAll("main .vk-lock-code .vk-lock-line"));
        const wrapped = () =>
          lines.map((line) => {
            const style = getComputedStyle(line);
            const content =
              line.getBoundingClientRect().height -
              Number.parseFloat(style.paddingTop) -
              Number.parseFloat(style.paddingBottom);
            return content > Number.parseFloat(style.lineHeight) * 1.5;
          });
        const now = wrapped();
        const forced = document.createElement("style");
        forced.textContent = "main .vk-lock-code { font-size: 12px !important; }";
        document.head.append(forced);
        const before = wrapped();
        forced.remove();
        return { now, before, total: lines.length };
      });
      expect(total).toBeGreaterThan(100);
      const added = now
        .map((wrapsNow, index) => (wrapsNow && !before[index] ? index : -1))
        .filter((index) => index >= 0);
      expect(added).toEqual([]);
    });
  }
}

test.describe("the landing scale from 48rem", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sets section headings at 3.5rem and the lead at 22px", async ({ page }) => {
    await page.goto(homeUrl("en"));
    const sizes = await page.evaluate(() => ({
      h2: getComputedStyle(document.querySelector("#lock-demo h2") as Element).fontSize,
      lead: getComputedStyle(document.querySelector("#gate .vk-lead") as Element).fontSize,
    }));
    expect(sizes).toEqual({ h2: "56px", lead: "22px" });
  });

  test("sets code at 14px in the lock demo and the gate, 13px in a highlights pane", async ({
    page,
  }) => {
    await page.goto(homeUrl("en"));
    const sizes = await page.evaluate(() => {
      const size = (selector: string) =>
        getComputedStyle(document.querySelector(selector) as Element).fontSize;
      return {
        lock: size("#lock-demo .vk-lock-code"),
        gate: size("#gate .vk-lock-code"),
        features: size("#features .vk-lock-code"),
        pane: size("#highlights .vk-hl-pane .vk-lock-code"),
      };
    });
    expect(sizes).toEqual({ lock: "14px", gate: "14px", features: "14px", pane: "13px" });
  });

  test("keeps the wide column at 1285px", async ({ page }) => {
    await page.goto(homeUrl("en"));
    const width = await page.evaluate(
      () => (document.querySelector("#lock-demo") as Element).getBoundingClientRect().width,
    );
    expect(width).toBeLessThanOrEqual(1285);
  });
});

test.describe("the features pane between 48rem and 1366px", () => {
  test("sets code at 13px at 1024px", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(homeUrl("en"));
    const size = await page.evaluate(
      () => getComputedStyle(document.querySelector("#features .vk-lock-code") as Element).fontSize,
    );
    expect(size).toBe("13px");
  });
});

test.describe("the landing on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("keeps today's heading, lead and code sizes under 48rem", async ({ page }) => {
    await page.goto(homeUrl("en"));
    const sizes = await page.evaluate(() => {
      const size = (selector: string) =>
        getComputedStyle(document.querySelector(selector) as Element).fontSize;
      return {
        h2: size("#lock-demo h2"),
        lead: size("#gate .vk-lead"),
        code: size("#lock-demo .vk-lock-code"),
      };
    });
    expect(Number.parseFloat(sizes.h2)).toBeLessThanOrEqual(30.4 + 0.5);
    expect(Number.parseFloat(sizes.lead)).toBeLessThanOrEqual(18);
    expect(sizes.code).toBe("12px");
  });
});

for (const locale of LOCALES) {
  for (const width of [1024, 1440] as const) {
    test(`heads the FAQ aside at 3rem in at most three lines in ${locale} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(homeUrl(locale));
      const heading = await page.locator("#faq h2").evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          size: style.fontSize,
          lines: Math.round(
            node.getBoundingClientRect().height / Number.parseFloat(style.lineHeight),
          ),
        };
      });
      expect(heading.size).toBe("48px");
      expect(heading.lines).toBeLessThanOrEqual(3);
    });
  }
}
