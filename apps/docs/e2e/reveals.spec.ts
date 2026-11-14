import { expect, type Page, test } from "playwright/test";

const DECK = [".vk-deck-command", ".vk-deck-card"] as const;

const ARTIFACTS = [...DECK, ".vk-faq-item", ".vk-final-install > div", ".vk-closer-proof"] as const;

const PHONE_WIDTH = 640;

function shown(width: number): ReadonlyArray<string> {
  const wide =
    width < 1024 ? ARTIFACTS.filter((selector) => !DECK.includes(selector as never)) : ARTIFACTS;
  return width < PHONE_WIDTH ? wide.filter((selector) => selector !== ".vk-faq-item") : wide;
}

const LOCK_CARDS = ".vk-lock .vk-lock-card";

const MAX_DISTANCE_PX = 16;
const MAX_DURATION_S = 0.56;
const MAX_DELAY_S = 0.35;

async function installShiftCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const holder = window as unknown as { shifts: number };
    holder.shifts = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Array<{
        value: number;
        hadRecentInput: boolean;
      }>)
        if (!entry.hadRecentInput) holder.shifts += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function walk(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.round(innerHeight * 0.5);
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  });
}

async function shifts(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { shifts: number }).shifts);
}

type State = { revealed: boolean; opacity: number; offset: number };

async function states(page: Page, selector: string): Promise<State[]> {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        revealed: node.hasAttribute("data-revealed"),
        opacity: Number(style.opacity),
        offset: Number.parseFloat(style.translate.split(" ")[1] ?? "0") || 0,
      };
    }),
  );
}

for (const [width, height] of [
  [1440, 900],
  [391, 844],
] as const) {
  test.describe(`lower third reveals at ${width}px`, () => {
    test.use({ viewport: { width, height }, reducedMotion: "no-preference" });

    test("hide each artifact below the fold, within 16px, then reveal it once in 560ms or less", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
      for (const selector of shown(width)) {
        const first = (await states(page, selector))[0];
        expect(first?.revealed, selector).toBe(false);
        expect(first?.opacity, selector).toBe(0);
        expect(first?.offset, selector).toBeGreaterThan(0);
        expect(first?.offset, selector).toBeLessThanOrEqual(MAX_DISTANCE_PX);
      }
      await walk(page);
      for (const selector of shown(width)) {
        await expect
          .poll(
            async () =>
              (await states(page, selector)).every(
                (state) => state.revealed && state.opacity === 1,
              ),
            {
              message: selector,
            },
          )
          .toBe(true);
        const timing = await page
          .locator(selector)
          .first()
          .evaluate((node) => {
            const style = getComputedStyle(node);
            return {
              duration: Number.parseFloat(style.transitionDuration.split(",")[0] ?? "0"),
              delay: Number.parseFloat(style.transitionDelay.split(",")[0] ?? "0"),
            };
          });
        expect(timing.duration, selector).toBeGreaterThan(0);
        expect(timing.duration, selector).toBeLessThanOrEqual(MAX_DURATION_S);
        expect(timing.delay, selector).toBeLessThanOrEqual(MAX_DELAY_S);
      }
    });

    test("chain the faq items and the closing parts within the stagger cap", async ({ page }) => {
      await page.goto("/");
      await walk(page);
      const chains =
        width < PHONE_WIDTH
          ? [".vk-final-install > div, .vk-closer-proof"]
          : [".vk-faq-item", ".vk-final-install > div, .vk-closer-proof"];
      for (const selector of chains) {
        const delays = await page
          .locator(selector)
          .evaluateAll((nodes) =>
            nodes.map((node) =>
              Number.parseFloat(getComputedStyle(node).transitionDelay.split(",")[0] ?? "0"),
            ),
          );
        expect(delays.length).toBeGreaterThan(1);
        expect([...delays].sort((a, b) => a - b)).toEqual(delays);
        expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_DELAY_S);
      }
    });

    test("keep the faq items in place on a phone and reveal them from 40rem", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
      const first = (await states(page, ".vk-faq-item"))[0];
      expect(first?.opacity).toBe(width < PHONE_WIDTH ? 1 : 0);
      expect(first?.offset === 0).toBe(width < PHONE_WIDTH);
    });

    test("shift no layout over a full scroll", async ({ page }) => {
      await installShiftCounter(page);
      await page.goto("/");
      await walk(page);
      expect(await shifts(page)).toBe(0);
    });
  });
}

test.describe("stacked lock demo cards on a phone", () => {
  test.use({ viewport: { width: 391, height: 844 }, reducedMotion: "no-preference" });

  test("reveal one by one from hidden", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
    const before = await states(page, LOCK_CARDS);
    expect(before).toHaveLength(3);
    expect(before.some((state) => !state.revealed && state.opacity === 0)).toBe(true);
    await walk(page);
    for (const state of await states(page, LOCK_CARDS)) {
      expect(state.revealed).toBe(true);
      expect(state.opacity).toBe(1);
    }
  });
});

test.describe("staged lock demo from 64rem", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  test("never hides its cards behind a reveal", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
    for (const state of await states(page, LOCK_CARDS)) {
      expect(state.opacity).toBe(1);
      expect(state.offset).toBe(0);
    }
  });
});

test.describe("lower third with reduced motion", () => {
  test.use({ viewport: { width: 391, height: 844 }, reducedMotion: "reduce" });

  test("shows every artifact in place at once", async ({ page }) => {
    await page.goto("/");
    for (const selector of [...ARTIFACTS, LOCK_CARDS]) {
      for (const state of await states(page, selector)) {
        expect(state.opacity, selector).toBe(1);
        expect(state.offset, selector).toBe(0);
      }
    }
  });
});

test.describe("lower third without JavaScript", () => {
  test("shows every artifact in place at once", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 391, height: 844 },
      javaScriptEnabled: false,
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    await page.goto("/");
    for (const selector of [...ARTIFACTS, LOCK_CARDS]) {
      for (const state of await states(page, selector)) {
        expect(state.opacity, selector).toBe(1);
        expect(state.offset, selector).toBe(0);
      }
    }
    await context.close();
  });
});

const TABBED = ".vk-deck-radio, .vk-deck-pane, .vk-lock-frame";

test.describe("print", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  test("shows every element of the landing at full opacity with the reveals pending, the tab panes of the deck and the lock demo aside", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
    await page.emulateMedia({ media: "print" });
    const faded = await page.evaluate(
      (tabbed) =>
        [...document.querySelectorAll("body *")]
          .filter((node) => !node.matches(tabbed))
          .filter((node) => Number(getComputedStyle(node).opacity) < 1)
          .map((node) => `${node.tagName.toLowerCase()}.${String(node.getAttribute("class"))}`),
      TABBED,
    );
    expect(faded).toEqual([]);
    const frames = await page
      .locator("section#gate .vk-gate-frame")
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).opacity));
    expect(frames).toEqual(["1", "1", "1"]);
  });
});

for (const [width, height] of [
  [1440, 2000],
  [2560, 1440],
] as const) {
  test.describe(`reveals on a tall viewport ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, reducedMotion: "no-preference" });

    test("reveals the proof row once the end of the document is reached", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(page.locator(".vk-closer-proof")).toHaveAttribute("data-revealed", "");
      await expect(page.locator(".vk-closer-proof")).toHaveCSS("opacity", "1");
    });
  });
}

test.describe("reveals when under a tenth of the viewport lies below the proof row", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  async function geometry(page: Page) {
    return page.evaluate(() => {
      const root = document.documentElement;
      const row = document.querySelector(".vk-closer-proof") as HTMLElement;
      const top = row.getBoundingClientRect().top + window.scrollY;
      const last = Math.max(0, root.scrollHeight - innerHeight);
      return { fold: innerHeight, top, atEnd: top - last, below: root.scrollHeight - top };
    });
  }

  test("reveals the proof row through the observer without the bottom inset", async ({ page }) => {
    await page.goto("/");
    const measured = await geometry(page);
    const height = Math.ceil(measured.below / 0.1) + 200;
    await page.setViewportSize({ width: 1440, height });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
    const tall = await geometry(page);
    expect(tall.top, "the row starts below the first screen").toBeGreaterThanOrEqual(tall.fold);
    expect(
      tall.atEnd,
      "under a tenth of the screen lies below the row at the end",
    ).toBeGreaterThanOrEqual(tall.fold * 0.9);
    await expect(page.locator(".vk-closer-proof")).not.toHaveAttribute("data-revealed", "");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator(".vk-closer-proof")).toHaveAttribute("data-revealed", "");
    await expect(page.locator(".vk-closer-proof")).toHaveCSS("opacity", "1");
  });
});
