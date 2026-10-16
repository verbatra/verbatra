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

async function unfilledHeights(page: Page): Promise<Record<string, number>> {
  return page.locator(`${BENTO} [data-tile]:not([data-tile="frameworks"])`).evaluateAll((tiles) =>
    Object.fromEntries(
      tiles.map((tile) => {
        const style = getComputedStyle(tile);
        const inner =
          tile.clientHeight -
          Number.parseFloat(style.paddingTop) -
          Number.parseFloat(style.paddingBottom);
        const children = [...tile.children];
        const content =
          children.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0) +
          (Number.parseFloat(style.rowGap) || 0) * (children.length - 1);
        return [(tile as HTMLElement).dataset.tile ?? "", inner - content];
      }),
    ),
  );
}

test.describe("bento layout", () => {
  test("sets the head beside the keys tile, the format tile then the provider tile next, then the SDK and the strip", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const head = await page.locator(`${BENTO} .vk-bento-head`).boundingBox();
    const boxes = await tileBoxes(page);
    const { providers, keys, formats, sdk, frameworks } = boxes;
    if (!head || !providers || !keys || !formats || !sdk || !frameworks)
      throw new Error("a tile is missing");
    expect(Math.abs(head.y - keys.y)).toBeLessThan(1);
    expect(keys.x).toBeGreaterThan(head.x + head.width);
    expect(keys.width).toBeGreaterThan(head.width * 1.8);
    expect(Math.abs(providers.y - formats.y)).toBeLessThan(1);
    expect(Math.abs(providers.height - formats.height)).toBeLessThan(1);
    expect(providers.x).toBeGreaterThan(formats.x + formats.width);
    expect(formats.width).toBeGreaterThan(providers.width);
    expect(providers.y).toBeGreaterThan(keys.y + keys.height);
    expect(sdk.y).toBeGreaterThan(formats.y + formats.height);
    expect(sdk.width).toBeGreaterThan(providers.width + formats.width);
    expect(frameworks.y).toBeGreaterThan(sdk.y + sdk.height);
  });

  for (const width of [1024, 1440]) {
    for (const locale of LOCALES) {
      test(`leaves no tall empty band inside a tile at ${width}px in ${locale}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(homeUrl(locale));
        const unfilled = await unfilledHeights(page);
        for (const [tile, height] of Object.entries(unfilled))
          expect(height, tile).toBeLessThan(48);
        const panel = page.locator(`${BENTO} [data-artifact="providers"]`);
        const panelVoid = await panel.evaluate(
          (figure) =>
            figure.clientHeight -
            [...figure.children].reduce(
              (sum, child) => sum + child.getBoundingClientRect().height,
              0,
            ),
        );
        expect(panelVoid).toBeLessThan(48);
        const clipped = await panel.evaluate((figure) => {
          const frame = figure.getBoundingClientRect();
          return [...figure.querySelectorAll(".vk-available-from, code, a")]
            .map((node) => node.getBoundingClientRect())
            .filter((box) => box.right > frame.right + 0.5 || box.left < frame.left - 0.5).length;
        });
        expect(clipped).toBe(0);
      });
    }
  }

  test("stacks the head and every tile in reading order on a phone and reflows at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    const order = Object.entries(await tileBoxes(page))
      .sort(([, a], [, b]) => a.y - b.y)
      .map(([key]) => key);
    expect(order).toEqual(["keys", "formats", "providers", "sdk", "frameworks"]);
    const head = await page.locator(`${BENTO} .vk-bento-head`).boundingBox();
    const keys = (await tileBoxes(page)).keys;
    expect((head?.y ?? 0) + (head?.height ?? 0)).toBeLessThan(keys?.y ?? 0);
    await expectNoHorizontalScroll(page);
  });
});
