import { expect, type Page, type Request, type Route, test } from "playwright/test";
import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_ITEMS,
  PLAYGROUND_LANGUAGES,
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
const RESULTS = `${PLAYGROUND} .vk-playground-results`;
const LIVE = `${PLAYGROUND} [data-playground-live]`;
const SCRAMBLE_MARKER = "scrambleText";
const ISLAND_MARKER = "data-playground-demo";

function translateButton(page: Page) {
  return page.locator(PLAYGROUND).getByRole("button", { name: "Translate", exact: true });
}

function texts(item: string, languages: ReadonlyArray<string>): string[] {
  return languages.map((code) => PLAYGROUND_TRANSLATIONS[code]?.[item] ?? "");
}

const FILLED = `${RESULTS} .vk-playground-result:not([data-empty]) .vk-playground-result-text`;

async function resultTexts(page: Page): Promise<string[]> {
  return page.locator(FILLED).allTextContents();
}

async function resultLangs(page: Page): Promise<Array<string | null>> {
  return page
    .locator(FILLED)
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("lang")));
}

async function waitForIsland(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
  await expect
    .poll(() =>
      page
        .locator(`${PLAYGROUND} input[type="radio"]`)
        .first()
        .evaluate((input) => Object.keys(input).some((key) => key.startsWith("__react"))),
    )
    .toBe(true);
}

function trackScripts(page: Page): { scramble: () => string[]; all: () => string[] } {
  const scripts: Array<{ url: string; scramble: boolean }> = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "script") return;
    const body = await response.text().catch(() => "");
    scripts.push({ url: response.url(), scramble: body.includes(SCRAMBLE_MARKER) });
  });
  return {
    scramble: () => scripts.filter((script) => script.scramble).map((script) => script.url),
    all: () => scripts.map((script) => script.url),
  };
}

function trackHosts(page: Page): () => string[] {
  const hosts = new Set<string>();
  page.on("request", (request: Request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" || url.protocol === "https:") hosts.add(url.hostname);
  });
  return () => [...hosts];
}

async function shiftEntriesSince(page: Page, since: number): Promise<number> {
  const shifts = await page.evaluate(
    () =>
      (window as unknown as { __playgroundShifts?: Array<{ startTime: number; value: number }> })
        .__playgroundShifts,
  );
  if (shifts === undefined) throw new Error("the layout-shift observer never started");
  return shifts.filter((shift) => shift.startTime >= since).length;
}

async function observeLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shifts: Array<{ startTime: number; value: number }> = [];
    Object.assign(window, { __playgroundShifts: shifts });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number };
        shifts.push({ startTime: shift.startTime, value: shift.value });
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

test.describe("playground by keyboard", () => {
  test("picks a string and languages and translates them, announcing the result", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForIsland(page);
    const radio = page.locator(`${PLAYGROUND} input[type="radio"]:checked`);
    await radio.focus();
    const from = PLAYGROUND_ITEMS.findIndex((item) => item.id === PLAYGROUND_DEFAULT_ITEM);
    const to = PLAYGROUND_ITEMS.findIndex((item) => item.id === "settings");
    for (let step = from; step < to; step++) await page.keyboard.press("ArrowDown");
    await expect(page.locator(`${PLAYGROUND} input[value="settings"]`)).toBeChecked();

    await page.keyboard.press("Tab");
    await expect(page.locator(`${PLAYGROUND} input[value="de"]`)).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await expect(page.locator(`${PLAYGROUND} input[value="es"]`)).not.toBeChecked();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(translateButton(page)).toBeFocused();
    await page.keyboard.press("Enter");

    const languages = PLAYGROUND_LANGUAGES.filter((code) => code !== "es");
    await expect.poll(() => resultTexts(page)).toEqual(texts("settings", languages));
    expect(await resultLangs(page)).toEqual(languages);
    const live = page.locator(LIVE);
    await expect(live).toHaveAttribute("aria-live", "polite");
    for (const code of languages) {
      await expect(live.locator(`[lang="${code}"]`)).toHaveText(
        PLAYGROUND_TRANSLATIONS[code]?.settings ?? "",
      );
    }
    await expect(page.locator(`${PLAYGROUND} [aria-live]:not(figure [aria-live])`)).toHaveCount(1);
  });
});

test.describe("playground under reduced motion", () => {
  test("swaps the texts at once and never loads the animation code", async ({ page }) => {
    const scripts = trackScripts(page);
    await page.goto("/");
    await waitForIsland(page);
    await page.locator(`${PLAYGROUND} input[value="cartEmpty"]`).check();
    await translateButton(page).click();
    expect(await resultTexts(page)).toEqual(texts("cartEmpty", PLAYGROUND_LANGUAGES));
    await expect(page.locator(RESULTS)).not.toHaveAttribute("data-scrambling", /.*/);
    await expect(page.locator(`${LIVE} [lang="ja"]`)).toHaveText(
      PLAYGROUND_TRANSLATIONS.ja?.cartEmpty ?? "",
    );
    await page.waitForLoadState("networkidle");
    expect(scripts.scramble()).toEqual([]);
  });
});

test.describe("playground animation", () => {
  test.use({ reducedMotion: "no-preference" });

  test("loads GSAP only after an interaction, scrambles each row and announces after it ends", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const scripts = trackScripts(page);
    const hosts = trackHosts(page);
    await observeLayoutShift(page);

    const response = await page.goto("/");
    const html = (await response?.text()) ?? "";
    const initial = [...html.matchAll(/<script[^>]*\bsrc="([^"]+\.js)"/g)].map((match) => match[1]);
    await waitForIsland(page);
    await page.waitForLoadState("networkidle");
    await page.locator(PLAYGROUND).scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    expect(scripts.scramble()).toEqual([]);
    expect(initial.length).toBeGreaterThan(0);

    await page.locator(`${PLAYGROUND} input[value="messages"]`).check();
    const button = translateButton(page);
    await button.hover();
    await expect.poll(() => scripts.scramble().length).toBe(1);
    const chunk = new URL(scripts.scramble()[0] ?? "").pathname;
    expect(initial).not.toContain(chunk);

    const before = await page.evaluate(() => performance.now());
    await button.click();
    const results = page.locator(RESULTS);
    await expect(results).toHaveAttribute("data-scrambling", "");
    await expect(page.locator(LIVE)).toHaveText("");
    await expect(results).not.toHaveAttribute("data-scrambling", /.*/, { timeout: 4000 });
    expect(await resultTexts(page)).toEqual(texts("messages", PLAYGROUND_LANGUAGES));
    await expect(page.locator(`${LIVE} [lang="fr"]`)).toHaveText(
      PLAYGROUND_TRANSLATIONS.fr?.messages ?? "",
    );
    for (const scrambler of await page.locator(`${RESULTS} .vk-playground-scramble`).all()) {
      await expect(scrambler).toHaveText("");
      await expect(scrambler).toHaveAttribute("aria-hidden", "true");
    }

    expect(await shiftSince(page, before + 500)).toBe(0);
    expect(hosts()).toEqual(["localhost"]);
    expect(errors).toEqual([]);
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

test.describe("playground on a cold touch", () => {
  test.use({ reducedMotion: "no-preference", hasTouch: true, isMobile: true });

  test("shows a busy state at once, shifts nothing and lands the right result without a warm-up", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const scripts = trackScripts(page);
    await observeLayoutShift(page);
    await page.goto("/");
    await waitForIsland(page);
    await page.waitForLoadState("networkidle");
    await page.locator(PLAYGROUND).scrollIntoViewIfNeeded();
    await page.locator(`${PLAYGROUND} input[value="onlyChanged"]`).evaluate((input) => {
      (input as HTMLInputElement).click();
    });
    await page.locator(`${PLAYGROUND} input[value="es"]`).evaluate((input) => {
      (input as HTMLInputElement).click();
    });
    expect(scripts.scramble()).toEqual([]);

    const busy = page.locator(`${PLAYGROUND} .vk-playground-result-block`);
    const before = await page.evaluate(() => performance.now());
    await translateButton(page).tap();
    await expect(busy).toHaveAttribute("aria-busy", "true");
    await expect(busy).not.toHaveAttribute("aria-busy", /.*/, { timeout: 5000 });

    const languages = PLAYGROUND_LANGUAGES.filter((code) => code !== "es");
    expect(await resultTexts(page)).toEqual(texts("onlyChanged", languages));
    await expect(page.locator(`${LIVE} [lang="ja"]`)).toHaveText(
      PLAYGROUND_TRANSLATIONS.ja?.onlyChanged ?? "",
    );
    await expect(translateButton(page)).not.toHaveAttribute("aria-disabled", /.*/);
    expect(await shiftEntriesSince(page, before)).toBe(0);
  });
});

test.describe("playground taking over a form the visitor already used", () => {
  test.use({ reducedMotion: "no-preference" });

  test("keeps the selection and the focus made before the island loaded", async ({ page }) => {
    const release = await holdScripts(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator(`${PLAYGROUND} input[value="deleteFile"]`).check();
    await page.locator(`${PLAYGROUND} input[value="fr"]`).uncheck();
    const japanese = page.locator(`${PLAYGROUND} input[value="ja"]`);
    await japanese.focus();
    await expect(japanese).toBeFocused();

    await release();
    await waitForIsland(page);
    await expect(page.locator(`${PLAYGROUND} input[value="deleteFile"]`)).toBeChecked();
    await expect(page.locator(`${PLAYGROUND} input[value="fr"]`)).not.toBeChecked();
    await expect(japanese).toBeFocused();

    await translateButton(page).click();
    const languages = PLAYGROUND_LANGUAGES.filter((code) => code !== "fr");
    await expect
      .poll(() => resultTexts(page), { timeout: 5000 })
      .toEqual(texts("deleteFile", languages));
    await expect(page.locator(RESULTS)).not.toHaveAttribute("data-scrambling", /.*/, {
      timeout: 4000,
    });
    expect(await resultTexts(page)).toEqual(texts("deleteFile", languages));
  });
});

test.describe("playground without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("shows the static table of every result instead of the controls", async ({ page }) => {
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
    await expect(page.locator(`${PLAYGROUND} .vk-playground-controls`)).toBeHidden();
    await expect(page.locator(RESULTS)).toBeHidden();
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

  test("heads the control column with the h2 and sets the snippet beside it", async ({ page }) => {
    await page.goto("/");
    const head = page.locator(`${PLAYGROUND} .vk-playground-layout > .vk-section-head`);
    await expect(head).toHaveAttribute("data-layout", "inline");
    const headBox = await head.boundingBox();
    const controls = await page.locator(`${PLAYGROUND} .vk-playground-controls`).boundingBox();
    const code = await page.locator(`${PLAYGROUND} .vk-playground-code`).boundingBox();
    if (headBox === null || controls === null || code === null) throw new Error("no box");
    expect(controls.y).toBeGreaterThan(headBox.y + headBox.height - 1);
    expect(code.x).toBeGreaterThanOrEqual(headBox.x + headBox.width);
    expect(code.y).toBeLessThan(headBox.y + headBox.height);
    await expectNoAxeViolations(page, PLAYGROUND);
  });
});

test.describe("playground tiles at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sets the controls, the result block and the code frame as 20px bordered panels", async ({
    page,
  }) => {
    await page.goto("/");
    for (const selector of [
      ".vk-playground-controls",
      ".vk-playground-result-block",
      ".vk-playground-code > figure",
    ]) {
      const style = await page.locator(`${PLAYGROUND} ${selector}`).evaluate((node) => {
        const computed = getComputedStyle(node);
        return { radius: computed.borderTopLeftRadius, width: computed.borderTopWidth };
      });
      expect(style, selector).toEqual({ radius: "20px", width: "1px" });
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
    await expect(page.locator(`${PLAYGROUND} .vk-playground-controls`)).toBeVisible();
  });
});

test.describe("playground network", () => {
  test("requests nothing from another host on load or on Translate", async ({ page }) => {
    const hosts = trackHosts(page);
    await page.goto("/");
    await waitForIsland(page);
    await translateButton(page).click();
    await page.waitForLoadState("networkidle");
    expect(hosts()).toEqual(["localhost"]);
  });
});

test.describe("playground result at 1440 by 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("brings the result block fully into view after Translate", async ({ page }) => {
    await page.goto("/");
    await waitForIsland(page);
    const button = translateButton(page);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const block = page.locator(`${PLAYGROUND} .vk-playground-result-block`);
    await expect
      .poll(async () => {
        const box = await block.boundingBox();
        return box !== null && box.y >= 0 && box.y + box.height <= 900;
      })
      .toBe(true);
  });
});
