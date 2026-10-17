import { expect, type Page, test } from "playwright/test";
import { expectNoAxeViolations, homeUrl, LOCALES } from "./support";

const HERO = "section.vk-banner";
const TABS = `${HERO} [role='tablist'] [role='tab']`;

function panel(page: Page, id: string) {
  return page.locator(`#hero-track-panel-${id}`);
}

async function selectTrack(page: Page, index: number): Promise<void> {
  const tab = page.locator(TABS).nth(index);
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 250 });
  }).toPass();
}

async function terminalHeight(page: Page): Promise<number> {
  const box = await page.locator(`${HERO} .vk-tracks-panels`).boundingBox();
  if (box === null) throw new Error("the track panels have no box");
  return box.height;
}

for (const locale of LOCALES) {
  test.describe(`hero ${homeUrl(locale)}`, () => {
    test("opens with the release announcement and offers three tracks, with no install box or facts", async ({
      page,
    }) => {
      await page.goto(homeUrl(locale));
      const announce = page.locator(`${HERO} a.vk-announce`);
      await expect(announce).toBeVisible();
      await expect(announce).toHaveAttribute("href", /\/releases\/tag\//);
      await expect(announce.locator(".vk-pill-new")).toBeVisible();
      await expect(page.locator(TABS)).toHaveCount(3);
      await expect(page.locator(`${HERO} .vk-command-panel, ${HERO} dl.vk-facts`)).toHaveCount(0);
      await expect(page.locator(`${HERO} .vk-copy, ${HERO} button[aria-label]`)).toHaveCount(0);
    });
  });
}

test.describe("hero without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("paints the h1 and the default track's full run from the server HTML", async ({ page }) => {
    await page.goto("/");
    const title = page.locator(`${HERO} h1`);
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS("opacity", "1");
    const translate = panel(page, "translate");
    await expect(translate).toBeVisible();
    await expect(translate.locator(".vk-track-command")).toHaveCount(2);
    for (const line of await translate.locator(".vk-track-command, .vk-track-out").all()) {
      await expect(line).toHaveCSS("opacity", "1");
    }
    await expect(panel(page, "ci")).toHaveCSS("visibility", "hidden");
    await expect(panel(page, "agents")).toHaveCSS("visibility", "hidden");
  });
});

test.describe("hero track keyboard", () => {
  test("moves between the tracks with the arrow keys, Home and End, keeping one tab stop", async ({
    page,
  }) => {
    await page.goto("/");
    const tabs = page.locator(TABS);
    await expect(async () => {
      await tabs.first().focus();
      await page.keyboard.press("ArrowRight");
      await expect(tabs.nth(1)).toBeFocused({ timeout: 250 });
    }).toPass();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(panel(page, "agents")).toHaveCSS("visibility", "visible");
    await page.keyboard.press("End");
    await expect(tabs.nth(2)).toBeFocused();
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(tabs.first()).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(tabs.nth(2)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");
    await expect(tabs.nth(2)).toHaveAttribute("tabindex", "-1");
  });
});

test.describe("hero track motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("types the default track once on load, from the final state the server sent", async ({
    page,
  }) => {
    await page.goto("/");
    const tracks = page.locator(`${HERO} .vk-tracks`);
    await expect(tracks).toHaveAttribute("data-typing", "true");
    await expect(tracks).not.toHaveAttribute("data-typing", "true", { timeout: 5000 });
    for (const line of await panel(page, "translate").locator(".vk-track-out").all()) {
      await expect(line).toHaveCSS("opacity", "1");
    }
  });

  test("types the command on a switch, then shows the result, without moving the layout", async ({
    page,
  }) => {
    await page.goto("/");
    const tracks = page.locator(`${HERO} .vk-tracks`);
    await expect(tracks).not.toHaveAttribute("data-typing", "true", { timeout: 5000 });
    const before = await terminalHeight(page);
    await selectTrack(page, 2);
    await expect(tracks).toHaveAttribute("data-typing", "true");
    await expect(panel(page, "ci").locator(".vk-track-out").first()).toHaveCSS("opacity", "0");
    await expect(tracks).not.toHaveAttribute("data-typing", "true", { timeout: 5000 });
    for (const line of await panel(page, "ci").locator(".vk-track-out").all()) {
      await expect(line).toHaveCSS("opacity", "1");
    }
    expect(await terminalHeight(page)).toBe(before);
  });

  test("keeps the server-rendered final state when the island hydrates late", async ({ page }) => {
    await page.addInitScript(() => {
      const seen = { typing: false };
      Object.assign(window, { trackTyping: seen });
      new MutationObserver(() => {
        if (document.querySelector(".vk-tracks[data-typing]") !== null) seen.typing = true;
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-typing"] });
    });
    await page.route("**/_next/static/chunks/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator("html")).toHaveAttribute("data-motion-ready", /.*/, {
      timeout: 15_000,
    });
    await page.waitForTimeout(1000);
    expect(
      await page.evaluate(
        () => (window as unknown as { trackTyping: { typing: boolean } }).trackTyping.typing,
      ),
    ).toBe(false);
    for (const line of await panel(page, "translate")
      .locator(".vk-track-command, .vk-track-out")
      .all()) {
      await expect(line).toHaveCSS("opacity", "1");
    }
  });

  test("runs the pill's glow, ring and shimmer three times, never forever", async ({ page }) => {
    await page.goto("/");
    const counts = await page
      .locator(`${HERO} .vk-pill-new`)
      .evaluate((pill) =>
        [
          getComputedStyle(pill, "::before"),
          getComputedStyle(pill.querySelector(".vk-pill-new-ring") as Element, "::before"),
          getComputedStyle(pill.querySelector(".vk-pill-new-shimmer") as Element, "::before"),
        ].map((style) => style.animationIterationCount),
      );
    expect(counts).toEqual(["3", "3", "3"]);
  });
});

test.describe("hero under reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("shows a chosen track's final state at once and keeps the pill still", async ({ page }) => {
    await page.goto("/");
    await selectTrack(page, 2);
    await expect(page.locator(`${HERO} .vk-tracks`)).not.toHaveAttribute("data-typing", "true");
    await expect(panel(page, "ci").locator(".vk-track-typed")).toHaveCount(0);
    for (const line of await panel(page, "ci").locator(".vk-track-out").all()) {
      await expect(line).toHaveCSS("opacity", "1");
    }
    await expect(page.locator(`${HERO} .vk-pill-new-shimmer`)).toHaveCSS("display", "none");
    const animation = await page
      .locator(`${HERO} .vk-pill-new-ring`)
      .evaluate((ring) => getComputedStyle(ring, "::before").animationName);
    expect(animation).toBe("none");
  });
});

test.describe("hero layout at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sets the tracks in the wider column beside the copy, inside the first viewport", async ({
    page,
  }) => {
    await page.goto("/");
    const box = async (selector: string) => {
      const rect = await page.locator(`${HERO} ${selector}`).first().boundingBox();
      if (rect === null) throw new Error(`${selector} has no box`);
      return rect;
    };
    const copy = await box(".vk-banner-copy");
    const demo = await box(".vk-banner-demo");
    expect(demo.width).toBeGreaterThan(copy.width * 1.25);
    expect(demo.x).toBeGreaterThan(copy.x + copy.width);
    const terminal = await box(".vk-track-terminal");
    expect(terminal.y + terminal.height).toBeLessThanOrEqual(900);
    const ctas = await box(".vk-banner-ctas");
    expect(ctas.y + ctas.height).toBeLessThanOrEqual(900);
    await expect(page.locator(`${HERO} .vk-banner-backdrop, ${HERO} .vk-banner-glow`)).toHaveCount(
      0,
    );
    await expectNoAxeViolations(page, HERO);
  });
});

for (const width of [375, 1440]) {
  test.describe(`hero track rows at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("keeps every track's terminal and summary on the same rows", async ({ page }) => {
      await page.goto("/");
      const rows: Array<readonly [number, number, number]> = [];
      for (const index of [0, 1, 2]) {
        await selectTrack(page, index);
        const id = ["translate", "agents", "ci"][index] ?? "";
        const terminal = await panel(page, id).locator(".vk-track-terminal").boundingBox();
        const summary = await panel(page, id).locator(".vk-track-summary").boundingBox();
        if (terminal === null || summary === null) throw new Error(`${id} has no box`);
        rows.push([Math.round(terminal.y), Math.round(terminal.height), Math.round(summary.y)]);
      }
      expect(new Set(rows.map((row) => row.join(","))).size).toBe(1);
    });
  });
}

for (const width of [320, 375]) {
  test.describe(`hero at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("fits every track without a sideways scroll", async ({ page }) => {
      await page.goto("/");
      for (const index of [0, 1, 2]) {
        await selectTrack(page, index);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBe(0);
      }
    });
  });
}
