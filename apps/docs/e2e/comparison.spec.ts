import { readFileSync } from "node:fs";
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

const SECTION = "section#compare";
const TABLE = `${SECTION} table.vk-comparison-table`;
const MIN_MARK_PX = 12;
const MIN_LABEL_GAP_PX = 8;
const NARROW_WIDTHS = [305, 320] as const;
const SPACELESS_LOCALES = ["ja", "zh-CN"] as const;

function manualColumnName(locale: string): string {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as {
    landing: { comparison: { columns: { manual: string } } };
  };
  return messages.landing.comparison.columns.manual;
}

function visibleLineCount(table: Element): number[] {
  return [...table.querySelectorAll("thead th:not(:first-child)")].map((head) => {
    const shown =
      [...head.children].find((child) => {
        const style = getComputedStyle(child);
        return style.display !== "none" && style.position !== "absolute";
      }) ?? head;
    const range = document.createRange();
    range.selectNodeContents(shown);
    return new Set([...range.getClientRects()].map((box) => Math.round(box.top))).size;
  });
}

function labelLineStartsOffWordBoundaries(table: Element, language: string): string[] {
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  const charTops = (cell: Element): { text: string; tops: Array<number | undefined> } => {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    const tops: Array<number | undefined> = [];
    let text = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.textContent ?? "";
      for (let at = 0; at < value.length; at += 1) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        const box = range.getBoundingClientRect();
        tops.push(box.width > 0 ? box.top : undefined);
      }
      text += value;
    }
    return { text, tops };
  };
  const lineStarts = (tops: Array<number | undefined>): number[] => {
    const starts: number[] = [];
    let last: number | undefined;
    tops.forEach((top, at) => {
      if (top === undefined) return;
      if (last !== undefined && Math.abs(top - last) > 3) starts.push(at);
      last = top;
    });
    return starts;
  };
  return [...table.querySelectorAll("tr.vk-comparison-label td")].flatMap((cell) => {
    const { text, tops } = charTops(cell);
    const boundaries = new Set(Array.from(segmenter.segment(text), (part) => part.index));
    return lineStarts(tops)
      .filter((start) => !boundaries.has(start))
      .map((start) => `${text} | ${start}`);
  });
}

function cellsOutsideTheirHeader(table: Element): string[] {
  const heads = [...table.querySelectorAll("thead th")].map((head) => head.getBoundingClientRect());
  const centres = [...table.querySelectorAll("tbody tr:not(.vk-comparison-label)")].flatMap(
    (row, rowIndex) =>
      [...row.children].map((cell, index) => {
        const box = cell.getBoundingClientRect();
        return { at: `${rowIndex}.${index}`, centre: box.left + box.width / 2, head: heads[index] };
      }),
  );
  return centres
    .filter(({ centre, head }) => !head || centre < head.left || centre > head.right)
    .map(({ at }) => at);
}

async function open(page: Page, locale: (typeof LOCALES)[number], width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(homeUrl(locale));
  await page.locator(SECTION).scrollIntoViewIfNeeded();
}

for (const locale of LOCALES) {
  test.describe(`comparison section ${homeUrl(locale)}`, () => {
    test("sits between the features and the FAQ and is named by its heading", async ({ page }) => {
      await page.goto(homeUrl(locale));
      const ids = await page
        .locator(".vk-home > section")
        .evaluateAll((nodes) => nodes.map((node) => node.id));
      const at = ids.indexOf("compare");
      expect(ids[at - 1]).toBe("features");
      expect(ids[at + 1]).toBe("faq");
      await expect(page.locator(SECTION)).toHaveAttribute("aria-labelledby", "compare-heading");
      await expect(page.locator("#compare-heading")).not.toBeEmpty();
    });

    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await page.locator(SECTION).scrollIntoViewIfNeeded();
        await expectNoAxeViolations(page, SECTION);
      });
    }

    for (const width of [305, 320, 375, 480, 768]) {
      test(`reflows at ${width}px with the table inside its card and no clipped header`, async ({
        page,
      }) => {
        await open(page, locale, width);
        await expectNoHorizontalScroll(page);
        await expectNothingPastRightEdge(page);
        const fit = await page.locator(TABLE).evaluate((table) => {
          const card = table.closest(".vk-comparison-card") as HTMLElement;
          const heads = [...table.querySelectorAll("thead th")].map((head) => ({
            scroll: head.scrollWidth,
            client: head.clientWidth,
          }));
          return { table: table.getBoundingClientRect().width, card: card.clientWidth, heads };
        });
        expect(fit.table).toBeLessThanOrEqual(fit.card + 1);
        for (const head of fit.heads) expect(head.scroll).toBeLessThanOrEqual(head.client + 1);
      });
    }

    for (const width of NARROW_WIDTHS) {
      test(`keeps a gutter between the short column labels at ${width}px and every mark under its header`, async ({
        page,
      }) => {
        await open(page, locale, width);
        const gaps = await page
          .locator(`${TABLE} thead th:not(:first-child)`)
          .evaluateAll((heads) => {
            const boxes = heads.map((head) => {
              const range = document.createRange();
              range.selectNodeContents(head);
              const visible = [...head.children].filter((child) => {
                const style = getComputedStyle(child);
                return style.display !== "none" && style.position !== "absolute";
              });
              const target = visible.length > 0 ? visible[0] : head;
              range.selectNodeContents(target as Node);
              return range.getBoundingClientRect();
            });
            return boxes.slice(1).map((box, index) => box.left - (boxes[index]?.right ?? 0));
          });
        for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(MIN_LABEL_GAP_PX);
        const misaligned = await page.locator(TABLE).evaluate(cellsOutsideTheirHeader);
        expect(misaligned).toEqual([]);
      });
    }

    test(`names every column header in full at 320px and shows Lingo.dev in full at 768px`, async ({
      page,
    }) => {
      await open(page, locale, 320);
      const names = ["Verbatra", "Crowdin", "Tolgee", "Lingo.dev", manualColumnName(locale)];
      for (const name of names)
        await expect(
          page.locator(TABLE).getByRole("columnheader", { name, exact: true }),
        ).toHaveCount(1);
      await open(page, locale, 768);
      const lingo = page
        .locator(TABLE)
        .getByRole("columnheader", { name: "Lingo.dev", exact: true })
        .locator(".vk-comparison-long");
      expect((await lingo.boundingBox())?.width ?? 0).toBeGreaterThan(20);
    });

    for (const width of [1024, 1280]) {
      test(`keeps every column header on one line at ${width}px`, async ({ page }) => {
        await open(page, locale, width);
        const lines = await page.locator(TABLE).evaluate(visibleLineCount);
        expect(lines).toEqual([1, 1, 1, 1, 1]);
      });
    }

    if ((SPACELESS_LOCALES as readonly string[]).includes(locale))
      for (const width of NARROW_WIDTHS) {
        test(`never breaks a label row inside a word at ${width}px`, async ({ page }) => {
          await open(page, locale, width);
          const broken = await page
            .locator(TABLE)
            .evaluate(labelLineStartsOffWordBoundaries, locale === "ja" ? "ja" : "zh");
          expect(broken).toEqual([]);
        });
      }
  });
}

test.describe("comparison table semantics and layout", () => {
  test("is a captioned table with column and row headers and a hidden word in every cell", async ({
    page,
  }) => {
    await open(page, "en", 1440);
    await expect(page.locator(`${TABLE} caption`)).toHaveCount(1);
    await expect(page.locator(`${TABLE} thead th[scope='col']`)).toHaveCount(6);
    await expect(page.locator(`${TABLE} tbody th[scope='row']`)).toHaveCount(6);
    await expect(page.locator(`${TABLE} tbody td:not([colspan]) .sr-only`)).toHaveCount(30);
    await expect(page.locator(`${SECTION} a`)).toHaveCount(0);
  });

  test("shows the row labels beside the marks from 480px and above them below it", async ({
    page,
  }) => {
    await open(page, "en", 1440);
    await expect(page.locator(`${TABLE} tr.vk-comparison-label`).first()).toBeHidden();
    await expect(page.locator(`${TABLE} tbody th[scope='row']`).first()).toBeVisible();
    const label = await page.locator(`${TABLE} tbody th[scope='row']`).first().boundingBox();
    const table = await page.locator(TABLE).boundingBox();
    expect((label?.width ?? 0) / (table?.width ?? 1)).toBeLessThanOrEqual(0.4);
    await open(page, "en", 375);
    await expect(page.locator(`${TABLE} tr.vk-comparison-label`).first()).toBeVisible();
    const hidden = await page.locator(`${TABLE} tbody th[scope='row']`).first().boundingBox();
    expect(hidden?.width ?? 0).toBeLessThanOrEqual(1);
    await expect(page.locator(`${TABLE} tr.vk-comparison-label`).first()).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("draws every mark at least twelve pixels", async ({ page }) => {
    for (const width of [320, 1440]) {
      await open(page, "en", width);
      const drawn = await page.locator(`${TABLE} .vk-comparison-mark`).evaluateAll((marks) =>
        marks.map((mark) => {
          const svg = mark as unknown as SVGSVGElement;
          const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
          const box = svg.getBBox();
          return { width: box.width * scale, height: box.height * scale };
        }),
      );
      expect(drawn.length).toBe(30);
      for (const size of drawn) {
        expect(size.width).toBeGreaterThanOrEqual(MIN_MARK_PX);
        expect(size.height).toBeGreaterThanOrEqual(MIN_MARK_PX);
      }
    }
  });

  for (const width of [320, 1440]) {
    test(`paints the Verbatra bar and tint through every row, label rows included, at ${width}px`, async ({
      page,
    }) => {
      const tint: Record<string, string> = {};
      for (const theme of THEMES) {
        await page.setViewportSize({ width, height: 900 });
        await openInTheme(page, "/", theme);
        await page.locator(SECTION).scrollIntoViewIfNeeded();
        const painted = await page.locator(TABLE).evaluate((table) => {
          const bar = (table.parentElement as HTMLElement).querySelector(
            ".vk-comparison-bar",
          ) as HTMLElement;
          const barBox = bar.getBoundingClientRect();
          const head = table.querySelector("thead th.vk-comparison-self") as HTMLElement;
          const headBox = head.getBoundingClientRect();
          const rows = [...table.querySelectorAll("tbody tr")]
            .filter((row) => row.getBoundingClientRect().height > 0)
            .map((row) => {
              const box = row.getBoundingClientRect();
              const y = box.top + box.height / 2;
              const x = barBox.left + barBox.width / 2;
              const above = document.elementsFromPoint(x, y);
              const layers = above.slice(0, above.indexOf(bar)).map((element) => {
                const style = getComputedStyle(element);
                const channels = style.backgroundColor.match(/[\d.]+/g) ?? [];
                return { image: style.backgroundImage, alpha: Number(channels[3] ?? 1) };
              });
              return {
                label: row.classList.contains("vk-comparison-label"),
                inside: above.includes(bar),
                covered: layers.some((layer) => layer.image !== "none" || layer.alpha > 0.1),
              };
            });
          return {
            barLeft: barBox.left,
            barWidth: barBox.width,
            headLeft: headBox.left,
            headWidth: headBox.width,
            image: getComputedStyle(bar).backgroundImage,
            tint: getComputedStyle(table.closest(".vk-comparison") as Element)
              .getPropertyValue("--comparison-self-tint")
              .trim(),
            rows,
          };
        });
        expect(Math.abs(painted.barLeft - painted.headLeft)).toBeLessThanOrEqual(1);
        expect(Math.abs(painted.barWidth - painted.headWidth)).toBeLessThanOrEqual(1);
        expect(painted.image).toContain("linear-gradient");
        expect(painted.rows.length).toBe(width < 480 ? 12 : 6);
        expect(painted.rows.some((row) => row.label)).toBe(width < 480);
        for (const row of painted.rows) {
          expect(row.inside).toBe(true);
          expect(row.covered).toBe(false);
        }
        tint[theme] = painted.tint;
      }
      expect(Number.parseFloat(tint.dark ?? "0")).toBeGreaterThan(
        Number.parseFloat(tint.light ?? "0"),
      );
    });
  }
});

test.describe("comparison anchor jump", () => {
  for (const width of [375, 1440]) {
    test(`lands the heading about 1.5rem below the header at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/#compare");
      await expect(page.locator("#compare-heading")).toBeInViewport();
      await page.waitForFunction(() => window.scrollY > 0);
      const gap = await page.evaluate(() => {
        const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
        return (
          (document.querySelector("#compare-heading")?.getBoundingClientRect().top ?? 0) - header
        );
      });
      expect(gap).toBeGreaterThanOrEqual(16);
      expect(gap).toBeLessThanOrEqual(48);
    });
  }
});

test.describe("comparison forced colors", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("keeps the verdict marks and the Verbatra column bar visible", async ({ page }) => {
    await page.goto("/");
    await page.emulateMedia({ forcedColors: "active" });
    const marks = page.locator(`${TABLE} .vk-comparison-mark`);
    expect(await marks.count()).toBe(30);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    for (let index = 0; index < (await marks.count()); index += 1) {
      const stroke = await marks.nth(index).evaluate((node) => getComputedStyle(node).stroke);
      expect(stroke).not.toBe("none");
      expect(stroke).not.toBe("rgba(0, 0, 0, 0)");
      expect(stroke).not.toBe(background);
    }
    const own = page.locator(`${TABLE} .vk-comparison-self`);
    expect(await own.count()).toBe(7);
    for (let index = 0; index < (await own.count()); index += 1) {
      await expect(own.nth(index)).toHaveCSS("border-left-width", "3px");
    }
  });
});
