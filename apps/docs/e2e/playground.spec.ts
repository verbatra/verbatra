import { expect, type Page, type Request, type Route, test } from "playwright/test";
import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_ITEMS,
  PLAYGROUND_LANGUAGES,
  PLAYGROUND_PICKS,
  PLAYGROUND_TRANSLATIONS,
} from "../lib/landing-playground";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

const PLAYGROUND = "section#playground";
const DEMO = `${PLAYGROUND} [data-playground-demo]`;
const ROWS = `${DEMO} .vk-playground-row`;
const PICKS = `${DEMO} .vk-playground-pick`;
const LIVE = `${PLAYGROUND} [data-playground-live]`;
const PAUSE = `${DEMO} .vk-playground-pause`;
const CYCLE_SHIFT_BUDGET = 0.002;
const ISLAND_MARKER = "data-playground-demo";

async function waitForIsland(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
  await expect
    .poll(() =>
      page
        .locator(PICKS)
        .first()
        .evaluate((button) => Object.keys(button).some((key) => key.startsWith("__react"))),
    )
    .toBe(true);
}

function finalTexts(item: string): string[] {
  return PLAYGROUND_LANGUAGES.map((code) => PLAYGROUND_TRANSLATIONS[code]?.[item] ?? "");
}

async function srTexts(page: Page): Promise<string[]> {
  return page.locator(`${ROWS} .sr-only`).allTextContents();
}

async function dataset(page: Page, name: "item" | "phase"): Promise<string | undefined> {
  return page.locator(DEMO).evaluate((node, key) => (node as HTMLElement).dataset[key], name);
}

async function observeLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shifts: Array<{ startTime: number; value: number }> = [];
    Object.assign(window, { __playgroundShifts: shifts });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          sources: ReadonlyArray<{ node: Node | null }>;
        };
        const section = document.querySelector("section#playground");
        const inside = shift.sources.some(
          (source) => source.node !== null && section?.contains(source.node) === true,
        );
        if (inside) shifts.push({ startTime: shift.startTime, value: shift.value });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function shiftSince(page: Page, since: number): Promise<number> {
  const shifts = await page.evaluate(
    () =>
      (window as unknown as { __playgroundShifts?: Array<{ startTime: number; value: number }> })
        .__playgroundShifts,
  );
  if (shifts === undefined) throw new Error("the layout-shift observer never started");
  return shifts
    .filter((shift) => shift.startTime >= since)
    .reduce((sum, shift) => sum + shift.value, 0);
}

function trackHosts(page: Page): () => string[] {
  const hosts = new Set<string>();
  page.on("request", (request: Request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" || url.protocol === "https:") hosts.add(url.hostname);
  });
  return () => [...hosts];
}

async function holdScripts(page: Page): Promise<() => Promise<void>> {
  const held: Route[] = [];
  let holding = true;
  await page.route("**/_next/static/**", (route) => {
    if (holding && route.request().resourceType() === "script") held.push(route);
    else void route.continue();
  });
  return async () => {
    holding = false;
    await Promise.all(held.splice(0).map((route) => route.continue()));
  };
}

for (const locale of LOCALES) {
  test.describe(`playground ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await waitForIsland(page);
        await expectNoAxeViolations(page, PLAYGROUND);
      });
    }
  });
}

test.describe("playground under reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("shows the final state, never types or cycles and offers no pause control", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForIsland(page);
    await page.locator(PLAYGROUND).scrollIntoViewIfNeeded();
    expect(await dataset(page, "phase")).toBe("done");
    expect(await dataset(page, "item")).toBe(PLAYGROUND_DEFAULT_ITEM);
    await expect(page.locator(PAUSE)).toBeHidden();
    expect(
      await page
        .locator(`${DEMO} .vk-playground-source-text .vk-playground-live`)
        .evaluate((node) => getComputedStyle(node, "::after").display),
    ).toBe("none");
    expect(await srTexts(page)).toEqual(finalTexts(PLAYGROUND_DEFAULT_ITEM));
    await page.waitForTimeout(5000);
    expect(await dataset(page, "phase")).toBe("done");
    expect(await dataset(page, "item")).toBe(PLAYGROUND_DEFAULT_ITEM);
    await expect(page.locator(`${ROWS} .vk-playground-skeleton`)).toHaveCount(0);
    for (const code of PLAYGROUND_LANGUAGES) {
      await expect(page.locator(`${ROWS}[data-lang="${code}"] .vk-ph`)).toHaveText("{name}");
    }
  });

  test("shows a picked string's translations at once", async ({ page }) => {
    await page.goto("/");
    await waitForIsland(page);
    const pick = PLAYGROUND_PICKS[1];
    await page.locator(PICKS).nth(1).click();
    await expect(page.locator(DEMO)).toHaveAttribute("data-item", pick?.id ?? "");
    await expect(page.locator(DEMO)).toHaveAttribute("data-phase", "done");
    expect(await srTexts(page)).toEqual(finalTexts(pick?.id ?? ""));
    await expect(page.locator(`${ROWS}[data-lang="de"] .vk-playground-live`)).toHaveText(
      PLAYGROUND_TRANSLATIONS.de?.[pick?.id ?? ""] ?? "",
    );
  });
});

test.describe("playground animation", () => {
  test.use({ reducedMotion: "no-preference" });
  test.setTimeout(60_000);

  test("types, decodes, then cycles to the next string once it is in view", async ({ page }) => {
    await page.goto("/");
    await waitForIsland(page);
    expect(await dataset(page, "item")).toBe(PLAYGROUND_DEFAULT_ITEM);
    await page.locator(PLAYGROUND).scrollIntoViewIfNeeded();
    const second = PLAYGROUND_PICKS[1]?.id ?? "";
    await expect(page.locator(DEMO)).toHaveAttribute("data-item", second, { timeout: 15_000 });
    const phases = new Set<string>();
    await expect
      .poll(
        async () => {
          phases.add((await dataset(page, "phase")) ?? "");
          return await dataset(page, "phase");
        },
        { timeout: 15_000, intervals: [60] },
      )
      .toBe("done");
    expect([...phases]).toContain("typing");
    expect(phases.has("running") || phases.has("typing")).toBe(true);
    expect(await srTexts(page)).toEqual(finalTexts(second));
    await expect(page.locator(`${PLAYGROUND} [aria-live]:not(figure [aria-live])`)).toHaveCount(1);
    await expect(page.locator(LIVE)).toHaveText("");
  });

  test("keeps every placeholder verbatim while a translation decodes", async ({ page }) => {
    await page.goto("/");
    await waitForIsland(page);
    await page.locator(PLAYGROUND).scrollIntoViewIfNeeded();
    await expect(page.locator(DEMO)).toHaveAttribute("data-phase", "running", {
      timeout: 15_000,
    });
    const placeholders = await page.locator(`${ROWS} .vk-playground-live .vk-ph`).allTextContents();
    expect(placeholders.length).toBeGreaterThan(0);
    expect(new Set(placeholders)).toEqual(new Set(["{count}"]));
  });

  test("stops cycling for good when a visitor picks a string", async ({ page }) => {
    await page.goto("/");
    await waitForIsland(page);
    await page.locator(PLAYGROUND).scrollIntoViewIfNeeded();
    const target = PLAYGROUND_PICKS[2];
    await page.locator(PICKS).nth(2).click();
    await expect(page.locator(DEMO)).toHaveAttribute("data-item", target?.id ?? "");
    await expect(page.locator(PICKS).nth(2)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(DEMO)).toHaveAttribute("data-phase", "done", { timeout: 15_000 });
    await page.waitForTimeout(5000);
    await expect(page.locator(DEMO)).toHaveAttribute("data-item", target?.id ?? "");
    await expect(page.locator(PAUSE)).toHaveAttribute("aria-label", "Play animation");
  });

  test("pauses with the control, resumes with it, and stops while scrolled away", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForIsland(page);
    await page.locator(PLAYGROUND).scrollIntoViewIfNeeded();
    await expect(page.locator(PAUSE)).toHaveAttribute("aria-label", "Pause animation");
    await page.locator(PAUSE).click();
    await expect(page.locator(PAUSE)).toHaveAttribute("aria-label", "Play animation");
    await expect(page.locator(DEMO)).toHaveAttribute("data-phase", "done");
    const item = await dataset(page, "item");
    await page.waitForTimeout(4500);
    expect(await dataset(page, "item")).toBe(item);

    await page.locator(PAUSE).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    const away = await dataset(page, "item");
    await page.waitForTimeout(4500);
    expect(await dataset(page, "item")).toBe(away);
    await page.locator(PLAYGROUND).scrollIntoViewIfNeeded();
    await expect(page.locator(DEMO)).not.toHaveAttribute("data-item", away ?? "", {
      timeout: 15_000,
    });
  });

  test("shifts nothing across a full cycle at 1440px and at 390px", async ({ page }) => {
    await observeLayoutShift(page);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await waitForIsland(page);
      await page.evaluate(() => document.fonts.ready);
      await page.locator(PLAYGROUND).scrollIntoViewIfNeeded();
      const since = await page.evaluate(() => performance.now());
      const seen = new Set<string>();
      await expect
        .poll(
          async () => {
            seen.add((await dataset(page, "item")) ?? "");
            return seen.size;
          },
          { timeout: 30_000, intervals: [200] },
        )
        .toBe(3);
      expect(await shiftSince(page, since), `${width}px`).toBeLessThan(CYCLE_SHIFT_BUDGET);
    }
  });
});

test.describe("playground by keyboard", () => {
  test.use({ reducedMotion: "reduce" });

  test("selects a language row and announces only that translation", async ({ page }) => {
    await page.goto("/");
    await waitForIsland(page);
    const row = page.locator(ROWS).nth(1);
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(row).toHaveAttribute("aria-pressed", "true");
    const code = PLAYGROUND_LANGUAGES[1] ?? "";
    const live = page.locator(LIVE);
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(live.locator("[lang]")).toHaveCount(1);
    await expect(live.locator(`[lang="${code}"]`)).toHaveText(
      PLAYGROUND_TRANSLATIONS[code]?.[PLAYGROUND_DEFAULT_ITEM] ?? "",
    );
    await page.keyboard.press("Space");
    await expect(row).toHaveAttribute("aria-pressed", "false");
  });

  test("picks a string with the keyboard and announces every language", async ({ page }) => {
    await page.goto("/");
    await waitForIsland(page);
    const pick = page.locator(PICKS).nth(2);
    await pick.focus();
    await page.keyboard.press("Enter");
    await expect(pick).toHaveAttribute("aria-pressed", "true");
    const id = PLAYGROUND_PICKS[2]?.id ?? "";
    for (const code of PLAYGROUND_LANGUAGES) {
      await expect(page.locator(`${LIVE} [lang="${code}"]`)).toHaveText(
        PLAYGROUND_TRANSLATIONS[code]?.[id] ?? "",
      );
    }
  });
});

test.describe("playground before the island takes over", () => {
  test.use({ reducedMotion: "no-preference" });

  for (const width of [375, 1440]) {
    test(`keeps its height and shifts nothing when the island hydrates at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await observeLayoutShift(page);
      const release = await holdScripts(page);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await page.locator(PLAYGROUND).scrollIntoViewIfNeeded();
      const height = () =>
        page.locator(PLAYGROUND).evaluate((element) => element.getBoundingClientRect().height);
      const before = await height();
      expect(await dataset(page, "phase")).toBe("done");
      const releasedAt = await page.evaluate(() => performance.now());
      await release();
      await waitForIsland(page);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      expect(await height()).toBe(before);
      expect(await shiftSince(page, releasedAt)).toBe(0);
    });
  }
});

test.describe("playground without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("shows the static table of every result instead of the result pane", async ({ page }) => {
    await page.goto("/");
    const table = page.locator(`${PLAYGROUND} .vk-playground-static table`);
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(PLAYGROUND_ITEMS.length);
    await expect(table.locator('thead th[scope="col"]')).toHaveCount(
      PLAYGROUND_LANGUAGES.length + 1,
    );
    await expect(table.locator('td[lang="ja"]').first()).toHaveText(
      PLAYGROUND_TRANSLATIONS.ja?.[PLAYGROUND_ITEMS[0]?.id ?? ""] ?? "",
    );
    await expect(page.locator(`${PLAYGROUND} [data-pane="result"]`)).toBeHidden();
    await expect(page.locator(`${PLAYGROUND} figure pre`)).toBeVisible();
    await expect(page.locator(`${PLAYGROUND} h2#playground-heading`)).toBeVisible();
  });

  test("reflows at 320px without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    await expectNoHorizontalScroll(page);
  });
});

test.describe("playground layout at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("heads the section with the h2 and sets the result and code panes side by side", async ({
    page,
  }) => {
    await page.goto("/");
    const head = page.locator(`${PLAYGROUND} .vk-playground-layout > .vk-section-head`);
    await expect(head).toHaveAttribute("data-layout", "split");
    const headBox = await head.boundingBox();
    const result = await page.locator(`${PLAYGROUND} [data-pane="result"]`).boundingBox();
    const code = await page.locator(`${PLAYGROUND} [data-pane="code"]`).boundingBox();
    if (headBox === null || result === null || code === null) throw new Error("no box");
    expect(result.y).toBeGreaterThan(headBox.y + headBox.height - 1);
    expect(code.x).toBeGreaterThanOrEqual(result.x + result.width);
    expect(Math.abs(code.y - result.y)).toBeLessThan(2);
    await expectNoAxeViolations(page, PLAYGROUND);
  });

  test("sets both panes as 20px bordered panels", async ({ page }) => {
    await page.goto("/");
    for (const pane of ["result", "code"]) {
      const style = await page.locator(`${PLAYGROUND} [data-pane="${pane}"]`).evaluate((node) => {
        const computed = getComputedStyle(node);
        return { radius: computed.borderTopLeftRadius, width: computed.borderTopWidth };
      });
      expect(style, pane).toEqual({ radius: "20px", width: "1px" });
    }
  });
});

test.describe("playground whose island chunk fails", () => {
  test.setTimeout(60_000);

  test("keeps its heading after a client navigation to the home page", async ({ page }) => {
    const aborted: string[] = [];
    await page.route("**/_next/static/chunks/**/*.js", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes(ISLAND_MARKER)) {
        aborted.push(route.request().url());
        await route.abort();
        return;
      }
      await route.fulfill({ response, body });
    });
    await page.goto("/docs/quickstart");
    await page.evaluate(() => {
      (window as unknown as { __softNavigation?: boolean }).__softNavigation = true;
    });
    await page.locator("header").getByRole("link", { name: "verbatra" }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(`${PLAYGROUND} h2#playground-heading`)).toBeVisible({
      timeout: 30_000,
    });
    expect(aborted.length).toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { __softNavigation?: boolean }).__softNavigation,
      ),
    ).toBe(true);
  });
});

test.describe("playground at 320px", () => {
  test("reflows without horizontal scroll and hides the static table", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    await waitForIsland(page);
    await expectNoHorizontalScroll(page);
    await expect(page.locator(`${PLAYGROUND} .vk-playground-static`)).toBeHidden();
    await expect(page.locator(ROWS).first()).toBeVisible();
  });
});

test.describe("playground network", () => {
  test("requests nothing from another host while it animates or when a string is picked", async ({
    page,
  }) => {
    const hosts = trackHosts(page);
    await page.goto("/");
    await waitForIsland(page);
    await page.locator(PICKS).nth(1).click();
    await page.waitForLoadState("networkidle");
    expect(hosts()).toEqual(["localhost"]);
  });
});
