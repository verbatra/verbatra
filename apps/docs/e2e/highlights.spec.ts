import { expect, type Page, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNothingPastRightEdge,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

const SECTION = "#highlights";

const PANES = `${SECTION} .vk-hl-pane`;

type Box = { top: number; height: number };

async function paneBoxes(page: Page): Promise<Box[]> {
  return page.$$eval(PANES, (nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { top: Math.round(rect.top + window.scrollY), height: rect.height };
    }),
  );
}

async function sectionHeight(page: Page): Promise<number> {
  return page.locator(SECTION).evaluate((node) => node.getBoundingClientRect().height);
}

async function paneGaps(page: Page): Promise<number[]> {
  return page.locator(PANES).evaluateAll((nodes) => {
    const shown = (text: Text): boolean =>
      text.data.trim() !== "" && (text.parentElement?.getClientRects().length ?? 0) > 0;
    const lastShown = (pre: Element): Text | undefined => {
      const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
      let last: Text | undefined;
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
        if (shown(node as Text)) last = node as Text;
      return last;
    };
    const contentBottom = (pane: Element): number => {
      const pre = pane.querySelector("pre");
      const last = pre ? lastShown(pre) : undefined;
      if (!last) return pane.querySelector(".vk-hl-coverage")?.getBoundingClientRect().bottom ?? 0;
      const range = document.createRange();
      range.selectNodeContents(last);
      return range.getBoundingClientRect().bottom;
    };
    return nodes.map(
      (pane) =>
        (pane.querySelector(".vk-hl-foot")?.getBoundingClientRect().top ?? 0) - contentBottom(pane),
    );
  });
}

const HEIGHT_CEILINGS: ReadonlyArray<readonly [number, number]> = [
  [1440, 944],
  [768, 1050],
  [391, 1350],
];

for (const locale of LOCALES) {
  for (const [width, ceiling] of HEIGHT_CEILINGS) {
    test.describe(`highlights ${homeUrl(locale)} at ${width}px`, () => {
      test.use({ viewport: { width, height: 900 } });

      test(`stays at most ${ceiling}px tall and heads itself in at most three lines`, async ({
        page,
      }) => {
        await page.goto(homeUrl(locale));
        expect(await sectionHeight(page)).toBeLessThanOrEqual(ceiling);
        if (width !== 768) {
          const lines = await page.locator(`${SECTION} h2`).evaluate((node) => {
            const style = getComputedStyle(node);
            return node.getBoundingClientRect().height / Number.parseFloat(style.lineHeight);
          });
          expect(Math.round(lines)).toBeLessThanOrEqual(3);
        }
      });
    });
  }
}

for (const width of [1440, 768, 391]) {
  test.describe(`highlights panes at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("leave at most 24px between the last content line and the foot", async ({ page }) => {
      await page.goto("/");
      const gaps = await paneGaps(page);
      expect(gaps).toHaveLength(4);
      for (const gap of gaps) expect(gap).toBeLessThanOrEqual(24);
    });

    test("keeps the docs link focus box inside the pane, clear of the foot rule and the border", async ({
      page,
    }) => {
      await page.goto("/");
      for (const pane of await page.locator(PANES).all()) {
        const box = await pane.locator(".vk-deck-link").boundingBox();
        const foot = await pane.locator(".vk-hl-foot").boundingBox();
        const card = await pane.locator(".vk-lock-card").boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect((box?.y ?? 0) - (foot?.y ?? 0)).toBeGreaterThanOrEqual(2);
        expect(
          (card?.y ?? 0) + (card?.height ?? 0) - ((box?.y ?? 0) + (box?.height ?? 0)),
        ).toBeGreaterThanOrEqual(2);
      }
    });
  });
}

for (const width of [320, 391, 640, 768]) {
  test.describe(`highlights coverage bar at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("keeps the bar and the percent whatever the pane width", async ({ page }) => {
      await page.goto("/");
      const bar = await page.locator(`${SECTION} .vk-hl-bar`).boundingBox();
      expect(bar?.width ?? 0).toBeGreaterThanOrEqual(32);
      await expect(page.locator(`${SECTION} .vk-hl-percent`)).toBeVisible();
    });
  });
}

test.describe("highlights rail on the column grid", () => {
  for (const width of [1440, 1024, 768]) {
    test.describe(`at ${width}px`, () => {
      test.use({ viewport: { width, height: 900 } });

      test("spans exactly the width of the pane columns", async ({ page }) => {
        await page.goto("/");
        const rail = await page.locator(`${SECTION} .vk-hl-rail`).boundingBox();
        const first = await page.locator(PANES).nth(0).boundingBox();
        const second = await page.locator(PANES).nth(1).boundingBox();
        expect(rail?.x).toBeCloseTo(first?.x ?? -1, 0);
        expect((rail?.x ?? 0) + (rail?.width ?? 0)).toBeCloseTo(
          (second?.x ?? 0) + (second?.width ?? 0),
          0,
        );
      });
    });
  }
});

test.describe("highlights under forced colors", () => {
  test.use({ viewport: { width: 1440, height: 900 }, forcedColors: "active" });

  test("keeps the coverage bar drawn", async ({ page }) => {
    await page.goto("/");
    const fill = await page
      .locator(`${SECTION} .vk-hl-bar i`)
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(fill).not.toBe("rgba(0, 0, 0, 0)");
    const bar = await page
      .locator(`${SECTION} .vk-hl-bar`)
      .evaluate((node) => getComputedStyle(node).borderTopStyle);
    expect(bar).toBe("solid");
  });
});

for (const width of [320, 375, 391, 768, 1024, 1440]) {
  test.describe(`highlights reflow at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("has no horizontal scroll and nothing past the right edge", async ({ page }) => {
      await page.goto("/");
      await page.locator(SECTION).scrollIntoViewIfNeeded();
      await expectNoHorizontalScroll(page);
      await expectNothingPastRightEdge(page);
    });

    test("never breaks up-to-date across lines and never scrolls a code block", async ({
      page,
    }) => {
      await page.goto("/");
      const result = await page.locator(SECTION).evaluate((section) => {
        let broken = 0;
        const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const text = node as Text;
          const at = text.data.indexOf("up-to-date");
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(text, at);
          range.setEnd(text, at + "up-to-date".length);
          const tops = new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top)));
          if (tops.size > 1) broken += 1;
        }
        const scrolling = Array.from(section.querySelectorAll("pre")).filter(
          (pre) => pre.scrollWidth > pre.clientWidth,
        ).length;
        return { broken, scrolling };
      });
      expect(result).toEqual({ broken: 0, scrolling: 0 });
    });
  });
}

test.describe("highlights rows at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("keeps the rail slim and the panes of a row within 8px of each other", async ({ page }) => {
    await page.goto("/");
    const rail = await page
      .locator(`${SECTION} .vk-hl-rail`)
      .evaluate((node) => node.getBoundingClientRect().height);
    expect(rail).toBeLessThanOrEqual(110);
    const boxes = await paneBoxes(page);
    expect(boxes).toHaveLength(4);
    for (const [first, second] of [
      [boxes[0], boxes[1]],
      [boxes[2], boxes[3]],
    ] as const) {
      expect(Math.abs((first?.height ?? 0) - (second?.height ?? 0))).toBeLessThanOrEqual(8);
      expect(first?.top).toBe(second?.top);
    }
    expect(boxes[2]?.top).toBeGreaterThan(boxes[0]?.top ?? 0);
  });

  test("shows at most 8 lines in the SDK and MCP panes", async ({ page }) => {
    await page.goto("/");
    for (const index of [2, 3]) {
      const lines = await page
        .locator(PANES)
        .nth(index)
        .locator("pre")
        .evaluate((pre) =>
          Array.from(pre.querySelectorAll(".vk-lock-line")).reduce((sum, line) => {
            const box = line.getBoundingClientRect();
            const height = Number.parseFloat(getComputedStyle(line).lineHeight);
            return box.height === 0 ? sum : sum + Math.round(box.height / height);
          }, 0),
        );
      expect(lines).toBeLessThanOrEqual(8);
    }
  });
});

test.describe("highlights on a phone", () => {
  test.use({ viewport: { width: 391, height: 844 } });

  test("shows at most 6 lines in the SDK and MCP panes", async ({ page }) => {
    await page.goto("/");
    for (const index of [2, 3]) {
      const lines = await page
        .locator(PANES)
        .nth(index)
        .locator("pre")
        .evaluate((pre) =>
          Array.from(pre.querySelectorAll(".vk-lock-line")).reduce((sum, line) => {
            const box = line.getBoundingClientRect();
            const height = Number.parseFloat(getComputedStyle(line).lineHeight);
            return box.height === 0 ? sum : sum + Math.round(box.height / height);
          }, 0),
        );
      expect(lines).toBeLessThanOrEqual(6);
    }
  });
});

test.describe("highlights cross-highlight", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  async function staleBackgrounds(page: Page): Promise<string[]> {
    return page.$$eval(`${PANES} .vk-hl-stale`, (nodes) =>
      nodes.map((node) => getComputedStyle(node).backgroundColor),
    );
  }

  test("marks every stale field at rest and lights all of them from a hovered pane", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const rest = await staleBackgrounds(page);
    expect(rest).toHaveLength(4);
    await page.locator(PANES).nth(0).hover();
    await expect.poll(() => staleBackgrounds(page)).not.toEqual(rest);
    const lit = await staleBackgrounds(page);
    expect(new Set(lit).size).toBe(1);
    expect(lit[0]).not.toBe(rest[0]);
  });

  test("lights the fields when focus is inside any pane", async ({ page }) => {
    await page.goto("/");
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const rest = await staleBackgrounds(page);
    await page.locator(PANES).nth(2).locator("a").focus();
    await expect.poll(() => staleBackgrounds(page)).not.toEqual(rest);
  });

  for (const theme of THEMES) {
    test(`keeps the lit text at 4.5:1 and the lit rail text at 6:1 in the ${theme} theme`, async ({
      page,
    }) => {
      await openInTheme(page, "/", theme);
      await page.locator(SECTION).scrollIntoViewIfNeeded();
      await page.locator(PANES).nth(0).hover();
      const ratios = await page.$$eval(
        `${PANES} .vk-hl-stale, ${SECTION} .vk-hl-rail .vk-lock-value, ${SECTION} .vk-hl-rail .vk-lock-sign`,
        (nodes) => {
          const context = document.createElement("canvas").getContext("2d", {
            willReadFrequently: true,
          }) as CanvasRenderingContext2D;
          const painted = (layers: string[]): number[] => {
            context.clearRect(0, 0, 1, 1);
            for (const layer of layers) {
              context.fillStyle = layer;
              context.fillRect(0, 0, 1, 1);
            }
            return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
          };
          const luminance = (rgb: number[]): number => {
            const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
              const v = channel / 255;
              return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          return nodes.map((node) => {
            const rail = node.closest(".vk-hl-rail") !== null;
            const backing = [node.closest(".vk-lock-card"), node.closest(".vk-lock-line"), node];
            const layers = ["#000"].concat(
              backing.flatMap((el) => (el ? [getComputedStyle(el).backgroundColor] : [])),
            );
            const [high = 0, low = 0] = [
              luminance(painted([...layers, getComputedStyle(node).color])),
              luminance(painted(layers)),
            ].sort((x, y) => y - x);
            return { rail, ratio: (high + 0.05) / (low + 0.05) };
          });
        },
      );
      expect(ratios.filter(({ rail }) => rail)).toHaveLength(4);
      for (const { rail, ratio } of ratios) expect(ratio).toBeGreaterThanOrEqual(rail ? 6 : 4.5);
    });
  }
});

test.describe("highlights reveal", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  test("reveals the panes by row once and shifts no layout", async ({ page }) => {
    await page.addInitScript(() => {
      const holder = window as unknown as { __shift: number };
      holder.__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as Array<{
          value: number;
          hadRecentInput: boolean;
        }>)
          if (!entry.hadRecentInput) holder.__shift += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
    expect(
      await page
        .locator(PANES)
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-reveal"))),
    ).toEqual(["0", "0", "1", "1"]);
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 400);
    await expect(page.locator(`${PANES}[data-revealed]`)).toHaveCount(4);
    expect(await page.evaluate(() => (window as unknown as { __shift: number }).__shift)).toBe(0);
  });

  test("starts the second row 70ms after the first", async ({ page }) => {
    await page.goto("/");
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await expect(page.locator(`${PANES}[data-revealed]`)).toHaveCount(4);
    const delays = await page
      .locator(PANES)
      .evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).transitionDelay.split(",")[0]?.trim()),
      );
    expect(delays).toEqual(["0s", "0s", "0.07s", "0.07s"]);
  });
});

for (const theme of THEMES) {
  test(`highlights has no axe violation in the ${theme} theme`, async ({ page }) => {
    await openInTheme(page, "/", theme);
    await expectNoAxeViolations(page, SECTION);
  });
}
