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

async function paneSlack(page: Page): Promise<number[]> {
  return page.locator(PANES).evaluateAll((nodes) => {
    const shown = (text: Text): boolean =>
      text.data.trim() !== "" && (text.parentElement?.getClientRects().length ?? 0) > 0;
    const shownTexts = (pre: Element): Text[] => {
      const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
      const found: Text[] = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
        if (shown(node as Text)) found.push(node as Text);
      return found;
    };
    const extent = (pane: Element): { top: number; bottom: number } => {
      const pre = pane.querySelector("pre");
      const texts = pre ? shownTexts(pre) : [];
      const first = texts[0];
      const last = texts.at(-1);
      if (!first || !last) {
        const box = pane.querySelector(".vk-hl-table")?.getBoundingClientRect();
        return { top: box?.top ?? 0, bottom: box?.bottom ?? 0 };
      }
      const from = document.createRange();
      from.selectNodeContents(first);
      const to = document.createRange();
      to.selectNodeContents(last);
      return { top: from.getBoundingClientRect().top, bottom: to.getBoundingClientRect().bottom };
    };
    return nodes.map((pane) => {
      const { top, bottom } = extent(pane);
      const head = pane.querySelector(".vk-lock-head")?.getBoundingClientRect().bottom ?? 0;
      const foot = pane.querySelector(".vk-hl-foot")?.getBoundingClientRect().top ?? 0;
      return foot - head - (bottom - top);
    });
  });
}

const SLACK_LIMIT = 48;

const HEIGHT_CEILINGS: ReadonlyArray<readonly [number, number]> = [
  [1440, 1200],
  [768, 1160],
  [391, 1360],
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

    test("leave at most 48px of free space between the head, the content and the foot", async ({
      page,
    }) => {
      await page.goto("/");
      const slack = await paneSlack(page);
      console.log(`pane slack: ${slack.map((value) => value.toFixed(1)).join(", ")}`);
      expect(slack).toHaveLength(4);
      for (const value of slack) expect(value).toBeLessThanOrEqual(SLACK_LIMIT);
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

const ZIG_ZAG_OFFSET = 104;

for (const locale of LOCALES) {
  for (const width of [1440, 1024]) {
    test.describe(`highlights zig-zag ${homeUrl(locale)} at ${width}px`, () => {
      test.use({ viewport: { width, height: 900 } });

      test("offsets the right pane of each row by 104px, in reading order, with no overlap", async ({
        page,
      }) => {
        await page.goto(homeUrl(locale));
        const boxes = await page.$$eval(PANES, (nodes) =>
          nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return { top: rect.top + scrollY, bottom: rect.bottom + scrollY, left: rect.left };
          }),
        );
        expect(boxes).toHaveLength(4);
        const [first, second, third, fourth] = boxes;
        expect((second?.top ?? 0) - (first?.top ?? 0)).toBeCloseTo(ZIG_ZAG_OFFSET, 0);
        expect((fourth?.top ?? 0) - (third?.top ?? 0)).toBeCloseTo(ZIG_ZAG_OFFSET, 0);
        expect(first?.top).toBeLessThan(second?.top ?? 0);
        expect(second?.top).toBeLessThan(third?.top ?? 0);
        expect(third?.top).toBeLessThan(fourth?.top ?? 0);
        expect(third?.top ?? 0).toBeGreaterThanOrEqual((first?.bottom ?? 0) + 8);
        expect(fourth?.top ?? 0).toBeGreaterThanOrEqual((second?.bottom ?? 0) + 8);
        expect(first?.left).toBe(third?.left);
        expect(second?.left).toBe(fourth?.left);
      });
    });
  }
}

test.describe("highlights rows at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("spans the stale rail row, its tint and tag, across the full width of the card", async ({
    page,
  }) => {
    await page.goto("/");
    const widths = await page.locator(`${SECTION} .vk-hl-rail`).evaluate((rail) => {
      const code = rail.querySelector("pre")?.getBoundingClientRect();
      const line = rail.querySelector(".vk-lock-line")?.getBoundingClientRect();
      return { code: code?.width ?? 0, line: line?.width ?? 0 };
    });
    expect(widths.code).toBeGreaterThan(0);
    expect(widths.line).toBeGreaterThanOrEqual(widths.code - 1);
  });

  test("keeps the rail slim and the two panes of a row within 8px of each other in height", async ({
    page,
  }) => {
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

  test("draws the gutter line without adding height, and no zig-zag", async ({ page }) => {
    await page.goto("/");
    const layout = await page.locator(`${SECTION} .vk-hl-panes`).evaluate((panes) => {
      const line = getComputedStyle(panes, "::before");
      const cards = Array.from(panes.querySelectorAll(".vk-hl-pane"));
      const first = cards[0]?.getBoundingClientRect();
      const last = cards.at(-1)?.getBoundingClientRect();
      return {
        position: line.position,
        display: line.display,
        stacked: cards.map((card) => card.getBoundingClientRect().left),
        extent: (last?.bottom ?? 0) - (first?.top ?? 0),
        height: panes.getBoundingClientRect().height,
      };
    });
    expect(layout.position).toBe("absolute");
    expect(layout.display).toBe("block");
    expect(new Set(layout.stacked).size).toBe(1);
    expect(layout.height).toBeCloseTo(layout.extent, 0);
  });

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

test.describe("highlights at 768px", () => {
  test.use({ viewport: { width: 768, height: 900 } });

  test("keeps the plain two by two grid with no guide line", async ({ page }) => {
    await page.goto("/");
    const boxes = await paneBoxes(page);
    expect(boxes[0]?.top).toBe(boxes[1]?.top);
    expect(boxes[2]?.top).toBe(boxes[3]?.top);
    const display = await page
      .locator(`${SECTION} .vk-hl-panes`)
      .evaluate((node) => [
        getComputedStyle(node, "::before").display,
        getComputedStyle(node, "::after").content,
        getComputedStyle(node.querySelector(".vk-hl-pane") as Element, "::after").display,
      ]);
    expect(display).toEqual(["none", "none", "none"]);
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

  test("lights every stale field and marked line from the hovered rail", async ({ page }) => {
    await page.goto("/");
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const rest = await staleBackgrounds(page);
    const lines = () =>
      page.$$eval(`${SECTION} .vk-lock-line[data-mark]`, (nodes) =>
        nodes.map((node) => getComputedStyle(node).backgroundColor),
      );
    const restLines = await lines();
    expect(restLines.length).toBeGreaterThan(0);
    await page.locator(`${SECTION} .vk-hl-rail`).hover();
    await expect.poll(() => staleBackgrounds(page)).not.toEqual(rest);
    expect(new Set(await staleBackgrounds(page)).size).toBe(1);
    await expect.poll(lines).not.toEqual(restLines);
    expect(new Set(await lines()).size).toBe(1);
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
      expect(ratios.filter(({ rail }) => rail)).toHaveLength(2);
      for (const { rail, ratio } of ratios) expect(ratio).toBeGreaterThanOrEqual(rail ? 6 : 4.5);
    });
  }
});

async function cardState(page: Page, index: number) {
  return page
    .locator(PANES)
    .nth(index)
    .evaluate((pane) => {
      const card = pane.querySelector(".vk-lock-card") as HTMLElement;
      const style = getComputedStyle(card);
      return {
        lift: new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform).m42,
        border: style.borderTopColor,
        article: Math.round((pane.getBoundingClientRect().top + scrollY) * 100) / 100,
      };
    });
}

test.describe("highlights lit pane", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  test("lifts only the hovered card 4px and moves neither the article nor its siblings, with no layout shift", async ({
    page,
  }) => {
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
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await expect(page.locator(`${PANES}[data-revealed]`)).toHaveCount(4);
    for (const pane of await page.locator(PANES).all())
      await expect(pane).toHaveCSS("translate", "none");
    await page.mouse.move(0, 0);
    const before = await Promise.all([0, 1, 2, 3].map((index) => cardState(page, index)));
    await page.locator(PANES).nth(1).hover();
    await expect.poll(async () => (await cardState(page, 1)).lift).toBeCloseTo(-4, 1);
    const after = await Promise.all([0, 1, 2, 3].map((index) => cardState(page, index)));
    for (const index of [0, 1, 2, 3]) {
      expect(after[index]?.article).toBe(before[index]?.article);
      if (index !== 1) expect(after[index]?.lift).toBe(before[index]?.lift);
    }
    expect(after[1]?.border).not.toBe(before[1]?.border);
    const glowLocator = page.locator(PANES).nth(1).locator(".vk-hl-glow");
    await expect(glowLocator).toHaveCSS("opacity", "1");
    const glow = await glowLocator.evaluate((node) => {
      const style = getComputedStyle(node);
      return { opacity: style.opacity, property: style.transitionProperty };
    });
    expect(glow.opacity).toBe("1");
    expect(glow.property).toBe("opacity");
    expect(await page.evaluate(() => (window as unknown as { __shift: number }).__shift)).toBe(0);
  });

  test("gives focus inside a pane the same lift and border", async ({ page }) => {
    await page.goto("/");
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const rest = await cardState(page, 2);
    await page.locator(PANES).nth(2).locator("a").focus();
    await expect.poll(async () => (await cardState(page, 2)).lift).toBeCloseTo(-4, 1);
    expect((await cardState(page, 2)).border).not.toBe(rest.border);
  });
});

test.describe("highlights lit pane under reduced motion", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

  test("changes the border and lifts nothing", async ({ page }) => {
    await page.goto("/");
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const rest = await cardState(page, 0);
    await page.locator(PANES).nth(0).hover();
    await expect.poll(async () => (await cardState(page, 0)).border).not.toBe(rest.border);
    expect((await cardState(page, 0)).lift).toBe(0);
  });
});

test.describe("highlights lit pane on a touch device", () => {
  test.use({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "no-preference",
  });

  test("never lifts a card, whatever is tapped", async ({ page }) => {
    await page.goto("/");
    await page.locator(PANES).nth(0).scrollIntoViewIfNeeded();
    await page.locator(PANES).nth(0).locator(".vk-lock-head").tap();
    expect((await cardState(page, 0)).lift).toBe(0);
  });
});

test.describe("highlights lit pane under forced colors", () => {
  test.use({ viewport: { width: 1440, height: 900 }, forcedColors: "active" });

  test("outlines the hovered card with the Highlight system colour", async ({ page }) => {
    await page.goto("/");
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await page.locator(PANES).nth(0).hover();
    await expect(page.locator(`${PANES} .vk-lock-card`).nth(0)).toHaveCSS("outline-style", "solid");
    await expect(page.locator(`${PANES} .vk-lock-card`).nth(0)).toHaveCSS("outline-width", "2px");
  });
});

type GuideLine = { fill: number; stubs: number[]; nodes: number[]; opacities: number[] };

async function guideLine(page: Page): Promise<GuideLine> {
  return page.locator(`${SECTION} .vk-hl-panes`).evaluate((panes) => {
    const scale = (node: Element, pseudo: string, axis: "a" | "d"): number => {
      const value = getComputedStyle(node, pseudo).transform;
      return value === "none" ? 1 : new DOMMatrixReadOnly(value)[axis];
    };
    const cards = Array.from(panes.querySelectorAll(".vk-hl-pane"));
    return {
      fill: scale(panes, "::after", "d"),
      stubs: cards.map((card) => scale(card, "::before", "a")),
      nodes: cards.map((card) => scale(card, "::after", "a")),
      opacities: cards.map((card) => Number(getComputedStyle(card, "::after").opacity)),
    };
  });
}

async function scrollThroughPanes(page: Page, fraction: number, settle = true): Promise<void> {
  await page.locator(`${SECTION} .vk-hl-panes`).evaluate((panes, at) => {
    const rect = panes.getBoundingClientRect();
    const top = rect.top + scrollY;
    window.scrollTo({
      top: top - innerHeight + at * (innerHeight + rect.height),
      behavior: "instant",
    });
  }, fraction);
  if (!settle) return;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

test.describe("highlights guide line", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  test("fills the spine from nothing to whole as the panes scroll through, never backwards", async ({
    page,
  }) => {
    await page.goto("/");
    const samples: number[] = [];
    for (const fraction of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.9]) {
      await scrollThroughPanes(page, fraction);
      samples.push((await guideLine(page)).fill);
    }
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(1);
    for (let index = 1; index < samples.length; index += 1)
      expect(samples[index] ?? 0).toBeGreaterThanOrEqual(samples[index - 1] ?? 0);
    expect(samples.some((value) => value > 0.05 && value < 0.95)).toBe(true);
  });

  test("lights the four nodes in order, each stub drawn before its node", async ({ page }) => {
    await page.goto("/");
    await scrollThroughPanes(page, 0);
    const start = await guideLine(page);
    expect(start.stubs).toEqual([0, 0, 0, 0]);
    expect(start.opacities).toEqual([0.35, 0.35, 0.35, 0.35]);
    const firstLit: number[] = [];
    for (let step = 0; step <= 20; step += 1) {
      const fraction = step / 20;
      await scrollThroughPanes(page, fraction);
      const line = await guideLine(page);
      line.opacities.forEach((opacity, index) => {
        if (opacity === 1 && firstLit[index] === undefined) firstLit[index] = fraction;
        if (line.nodes[index] === 1) expect(line.stubs[index]).toBe(1);
      });
    }
    expect(firstLit).toHaveLength(4);
    for (let index = 1; index < firstLit.length; index += 1)
      expect(firstLit[index] ?? 0).toBeGreaterThan(firstLit[index - 1] ?? 1);
  });

  test("shows the whole line at rest with no motion allowed", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto("/");
    await scrollThroughPanes(page, 0);
    expect(await guideLine(page)).toEqual({
      fill: 1,
      stubs: [1, 1, 1, 1],
      nodes: [1, 1, 1, 1],
      opacities: [1, 1, 1, 1],
    });
    await context.close();
  });

  test("shows the whole line with scripting off", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto("/");
    await scrollThroughPanes(page, 0, false);
    expect(await guideLine(page)).toEqual({
      fill: 1,
      stubs: [1, 1, 1, 1],
      nodes: [1, 1, 1, 1],
      opacities: [1, 1, 1, 1],
    });
    await context.close();
  });

  test("scrubs nothing and shifts no layout while the panes scroll through", async ({ page }) => {
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
    const before = await sectionHeight(page);
    for (const fraction of [0, 0.3, 0.6, 1]) await scrollThroughPanes(page, fraction);
    expect(await sectionHeight(page)).toBe(before);
    expect(await page.evaluate(() => (window as unknown as { __shift: number }).__shift)).toBe(0);
  });
});

test.describe("highlights guide line under forced colors", () => {
  test.use({ viewport: { width: 1440, height: 900 }, forcedColors: "active" });

  test("draws the spine in CanvasText", async ({ page }) => {
    await page.goto("/");
    const colour = await page
      .locator(`${SECTION} .vk-hl-panes`)
      .evaluate((node) => getComputedStyle(node, "::after").backgroundColor);
    expect(colour).toBe(
      await page.evaluate(() => {
        const probe = document.createElement("i");
        probe.style.color = "CanvasText";
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      }),
    );
  });
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
