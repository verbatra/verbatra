import { expect, type Page, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

const BENTO = "section#features";

type Box = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

async function tileBoxes(page: Page): Promise<Record<string, Box>> {
  return page.locator(`${BENTO} [data-tile]`).evaluateAll((tiles) =>
    Object.fromEntries(
      tiles.map((tile) => {
        const { x, y, width, height } = tile.getBoundingClientRect();
        return [(tile as HTMLElement).dataset.tile ?? "", { x, y, width, height }];
      }),
    ),
  );
}

for (const locale of LOCALES) {
  test.describe(`bento ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await page.locator(BENTO).scrollIntoViewIfNeeded();
        await expectNoAxeViolations(page, BENTO);
      });
    }
  });
}

test.describe("bento layout", () => {
  test("puts the provider and keys tiles side by side at one height, the halves next, then the strip", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const boxes = await tileBoxes(page);
    const { providers, keys, formats, sdk, frameworks } = boxes;
    if (!providers || !keys || !formats || !sdk || !frameworks)
      throw new Error("a tile is missing");
    expect(Math.abs(providers.y - keys.y)).toBeLessThan(1);
    expect(Math.abs(providers.height - keys.height)).toBeLessThan(1);
    expect(providers.width).toBeGreaterThan(keys.width * 1.8);
    expect(Math.abs(formats.y - sdk.y)).toBeLessThan(1);
    expect(Math.abs(formats.width - sdk.width)).toBeLessThan(1);
    expect(formats.y).toBeGreaterThan(providers.y + providers.height);
    expect(frameworks.y).toBeGreaterThan(formats.y + formats.height);
    expect(frameworks.width).toBeGreaterThan(providers.width + keys.width);
  });

  test("stacks every tile in reading order on a phone and reflows at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    const order = Object.entries(await tileBoxes(page))
      .sort(([, a], [, b]) => a.y - b.y)
      .map(([key]) => key);
    expect(order).toEqual(["providers", "keys", "formats", "sdk", "frameworks"]);
    await expectNoHorizontalScroll(page);
  });
});
