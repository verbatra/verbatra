import { expect, type Page, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  installShiftCounter,
  LOCALES,
  layoutShift,
} from "./support";

const HOSTS = ".vk-words";
const DIMMED = 0.15;
const LINE = 0.7;
const HOST_COUNT = 8;

type Words = { opacities: number[]; blur: number; done: boolean };

async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function words(page: Page, index: number): Promise<Words> {
  await frames(page);
  return page
    .locator(HOSTS)
    .nth(index)
    .evaluate((host) => {
      const spans = [...host.querySelectorAll<HTMLElement>(".vk-word")];
      return {
        opacities: spans.map((span) => Number(getComputedStyle(span).opacity)),
        blur: Math.max(
          ...spans.map((span) => Number.parseFloat(getComputedStyle(span).filter.slice(5)) || 0),
        ),
        done: host.hasAttribute("data-words-done"),
      };
    });
}

async function placeBottom(page: Page, index: number, offsetPx: number): Promise<void> {
  await page
    .locator(HOSTS)
    .nth(index)
    .evaluate(
      (host, [line, offset]) => {
        const bottom = host.getBoundingClientRect().bottom;
        window.scrollTo({
          top: window.scrollY + bottom - line * innerHeight + (offset ?? 0),
          behavior: "instant",
        });
      },
      [LINE, offsetPx] as const,
    );
}

async function scrubHost(page: Page, index: number): Promise<void> {
  if ((await words(page, index)).done) return;
  let previous = -1;
  for (const offset of [320, 120, 40, 3]) {
    await placeBottom(page, index, offset);
    const state = await words(page, index);
    const first = state.opacities[0] ?? 0;
    const last = state.opacities[state.opacities.length - 1] ?? 0;
    expect(first, `host ${index} offset ${offset}`).toBeGreaterThanOrEqual(last - 0.001);
    expect(first + last, `host ${index} offset ${offset}`).toBeGreaterThanOrEqual(previous - 0.001);
    previous = first + last;
  }
  for (const opacity of (await words(page, index)).opacities)
    expect(opacity, `host ${index}`).toBeGreaterThan(0.8);
  await placeBottom(page, index, 0);
  await expect
    .poll(async () => (await words(page, index)).done, { message: `host ${index}` })
    .toBe(true);
  const end = await words(page, index);
  for (const opacity of end.opacities) expect(opacity, `host ${index}`).toBe(1);
  expect(end.blur).toBe(0);
}

function clippingAncestors(hosts: Element[]): string[] {
  const found: string[] = [];
  for (const host of hosts) {
    for (
      let node = host.parentElement;
      node && node !== document.documentElement;
      node = node.parentElement
    ) {
      const style = getComputedStyle(node);
      const clips = [style.overflowX, style.overflowY].some((value) =>
        ["hidden", "auto", "scroll"].includes(value),
      );
      if (clips) found.push(`${node.tagName.toLowerCase()}.${String(node.getAttribute("class"))}`);
    }
  }
  return found;
}

async function ready(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
  await expect(page.locator(HOSTS)).toHaveCount(HOST_COUNT);
}

const VIEWPORTS = [
  [1440, 900],
  [391, 844],
] as const;

for (const [width, height] of VIEWPORTS) {
  test.describe(`headline word reveal at ${width}px`, () => {
    test.use({ viewport: { width, height }, reducedMotion: "no-preference" });

    test("starts every host below the fold dimmed and blurred, and the hosts hold no reveal mark", async ({
      page,
    }) => {
      await page.goto("/");
      await ready(page);
      const marked = await page
        .locator(HOSTS)
        .evaluateAll((hosts) => hosts.filter((host) => host.closest("[data-reveal]")).length);
      expect(marked).toBe(0);
      const closing = await words(page, HOST_COUNT - 1);
      expect(closing.done).toBe(false);
      for (const opacity of closing.opacities) expect(opacity).toBeCloseTo(DIMMED, 2);
      expect(closing.blur).toBeCloseTo(4, 1);
    });

    test("scrubs each host with the scroll, first word ahead of the last, and ends sharp on the 70 percent line", async ({
      page,
    }) => {
      await page.goto("/");
      await ready(page);
      for (let index = 0; index < HOST_COUNT; index += 1) await scrubHost(page, index);
    });

    test("keeps a finished host sharp when it is scrolled back out of view", async ({ page }) => {
      await page.goto("/");
      await ready(page);
      await placeBottom(page, 0, 0);
      await expect.poll(async () => (await words(page, 0)).done).toBe(true);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.evaluate(() =>
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
      );
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      const state = await words(page, 0);
      for (const opacity of state.opacities) expect(opacity).toBe(1);
    });

    test("shifts no layout over a full scroll", async ({ page }) => {
      await installShiftCounter(page);
      await page.goto("/");
      await ready(page);
      await page.evaluate(async () => {
        const step = Math.round(innerHeight * 0.5);
        for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
      });
      expect(await layoutShift(page)).toBe(0);
    });

    test("has no axe violations and no sideways scroll once every host is sharp", async ({
      page,
    }) => {
      await page.goto("/");
      await ready(page);
      for (let index = 0; index < HOST_COUNT; index += 1) {
        if ((await words(page, index)).done) continue;
        await placeBottom(page, index, 0);
        await expect.poll(async () => (await words(page, index)).done).toBe(true);
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation instanceof CSSTransition)
            .map((animation) => animation.finished),
        ),
      );
      await expectNoAxeViolations(page);
      await expectNoHorizontalScroll(page);
    });

    test("puts no hidden, auto or scroll overflow on any ancestor of a host", async ({ page }) => {
      await page.goto("/");
      await ready(page);
      const clipping = await page.locator(HOSTS).evaluateAll(clippingAncestors);
      expect(clipping).toEqual([]);
    });
  });
}

test.describe("word reveal in every locale", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  for (const locale of LOCALES) {
    test(`reaches the end state on the longest heading of ${locale}`, async ({ page }) => {
      await page.goto(homeUrl(locale));
      await ready(page);
      const counts = await page
        .locator(HOSTS)
        .evaluateAll((hosts) => hosts.map((host) => host.querySelectorAll(".vk-word").length));
      const longest = counts.indexOf(Math.max(...counts));
      const lead = await words(page, longest);
      if (!lead.done) {
        await placeBottom(page, longest, 3);
        const near = await words(page, longest);
        for (const opacity of near.opacities)
          expect(opacity, `${locale} host ${longest}`).toBeGreaterThan(0.8);
        await placeBottom(page, longest, 0);
        await expect.poll(async () => (await words(page, longest)).done).toBe(true);
      }
      for (const opacity of (await words(page, longest)).opacities) expect(opacity).toBe(1);
    });
  }

  for (const locale of ["ja", "zh-CN"] as const) {
    test(`splits ${locale} per word, keeps every host whole, and scrubs from dimmed to sharp`, async ({
      page,
    }) => {
      await page.goto(homeUrl(locale));
      await ready(page);
      const split = await page.locator(HOSTS).evaluateAll((hosts) =>
        hosts.map((host) => ({
          text: host.textContent ?? "",
          spans: [...host.querySelectorAll(".vk-word")].map((span) => span.textContent ?? ""),
        })),
      );
      for (const { text, spans } of split) {
        expect(spans.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
        for (const span of spans) expect(/^\p{Script=Han}$/u.test(span)).toBe(false);
      }
      expect(split.some(({ spans }) => spans.length > 1)).toBe(true);
      const index = split.findIndex(({ spans }) => spans.length > 1);
      await placeBottom(page, index, 320);
      const dim = await words(page, index);
      if (!dim.done) expect(dim.opacities[0]).toBeLessThan(1);
      await placeBottom(page, index, 0);
      await expect.poll(async () => (await words(page, index)).done).toBe(true);
      for (const opacity of (await words(page, index)).opacities) expect(opacity).toBe(1);
    });
  }
});

test.describe("word reveal end state when a heading cannot reach the line", () => {
  test.use({ viewport: { width: 1440, height: 7000 }, reducedMotion: "no-preference" });

  test("shows the closing heading sharp at once", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const room = await page
      .locator(HOSTS)
      .nth(HOST_COUNT - 1)
      .evaluate((host) => {
        const root = document.documentElement;
        return {
          below: root.scrollHeight - (host.getBoundingClientRect().bottom + window.scrollY),
          fold: innerHeight,
        };
      });
    expect(room.below, "under 30 percent of the screen lies below the heading").toBeLessThan(
      room.fold * (1 - LINE),
    );
    const state = await words(page, HOST_COUNT - 1);
    expect(state.done).toBe(true);
    for (const opacity of state.opacities) expect(opacity).toBe(1);
  });
});

test.describe("word reveal after a reload in the middle of the page", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  test("reveals from a fresh load at the top", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const state = await words(page, 3);
    expect(state.done).toBe(false);
    expect(state.opacities[0]).toBeCloseTo(DIMMED, 2);
  });

  test("keeps the headings above the fold sharp and still reveals the ones below it", async ({
    page,
  }) => {
    await page.goto("/");
    await ready(page);
    await page
      .locator(HOSTS)
      .nth(3)
      .evaluate((host) => {
        const top = host.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: top - 100, behavior: "instant" });
      });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(2000);
    await page.reload();
    await ready(page);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(2000);
    for (const above of [0, 1, 2]) {
      await expect
        .poll(async () => (await words(page, above)).done, { message: `host ${above}` })
        .toBe(true);
      for (const opacity of (await words(page, above)).opacities) expect(opacity).toBe(1);
    }
    const below = await words(page, HOST_COUNT - 1);
    expect(below.done).toBe(false);
    expect(below.opacities[0]).toBeCloseTo(DIMMED, 2);
    await placeBottom(page, HOST_COUNT - 1, 0);
    await expect.poll(async () => (await words(page, HOST_COUNT - 1)).done).toBe(true);
  });
});

test.describe("word reveal as static text", () => {
  async function expectStatic(page: Page): Promise<void> {
    await expect(page.locator(HOSTS)).toHaveCount(HOST_COUNT);
    const state = await page.locator(`${HOSTS} .vk-word`).evaluateAll((spans) =>
      spans.map((span) => {
        const style = getComputedStyle(span);
        return { opacity: style.opacity, filter: style.filter, animation: style.animationName };
      }),
    );
    expect(state.length).toBeGreaterThan(HOST_COUNT);
    for (const word of state)
      expect(word).toEqual({ opacity: "1", filter: "none", animation: "none" });
  }

  test.describe("with reduced motion", () => {
    test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

    test("shows every word sharp at once", async ({ page }) => {
      await page.goto("/");
      await expectStatic(page);
    });
  });

  test("without JavaScript shows every word sharp at once", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled: false,
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    await page.goto("/");
    await expectStatic(page);
    await context.close();
  });

  test("without scroll timeline support shows every word sharp at once", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
    });
    await context.route("**/*.css", async (route) => {
      const response = await route.fetch();
      const css = await response.text();
      await route.fulfill({
        response,
        body: css
          .replaceAll(
            "@supports (animation-timeline:view())",
            "@supports (animation-timeline:vk-none())",
          )
          .replaceAll(
            "@supports (animation-timeline: view())",
            "@supports (animation-timeline: vk-none())",
          ),
      });
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
    await expectStatic(page);
    await context.close();
  });

  test.describe("when printed", () => {
    test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

    test("shows every word sharp", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
      await page.emulateMedia({ media: "print" });
      await expectStatic(page);
    });
  });
});
