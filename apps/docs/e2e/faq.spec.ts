import { expect, type Page, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
  waitForFaqKeys,
} from "./support";

const FAQ = "section#faq";
const ITEMS = `${FAQ} details[data-faq]`;
const SUMMARIES = `${ITEMS} > summary`;

type FaqEntry = { readonly question: string; readonly answer: string };

function normalized(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

async function renderedFaq(page: Page): Promise<FaqEntry[]> {
  return page.locator(ITEMS).evaluateAll((items) =>
    items.map((item) => {
      const answer = item.querySelector(".vk-faq-answer")?.cloneNode(true);
      if (answer instanceof Element)
        for (const hidden of answer.querySelectorAll(".sr-only")) hidden.remove();
      return {
        question: item.querySelector("h3")?.textContent ?? "",
        answer: answer?.textContent ?? "",
      };
    }),
  );
}

async function structuredFaq(page: Page): Promise<FaqEntry[]> {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) => scripts.map((script) => script.textContent ?? ""));
  const faq = blocks
    .map(
      (block) =>
        JSON.parse(block) as {
          "@type"?: string;
          mainEntity?: ReadonlyArray<{ name: string; acceptedAnswer: { text: string } }>;
        },
    )
    .find((block) => block["@type"] === "FAQPage");
  return (faq?.mainEntity ?? []).map((entry) => ({
    question: entry.name,
    answer: entry.acceptedAnswer.text,
  }));
}

async function openAll(page: Page): Promise<void> {
  await page.locator(ITEMS).evaluateAll((items) => {
    for (const item of items) (item as HTMLDetailsElement).open = true;
  });
}

for (const locale of LOCALES) {
  test.describe(`faq ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme, every answer open`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await page.locator(FAQ).scrollIntoViewIfNeeded();
        await openAll(page);
        await expectNoAxeViolations(page, FAQ);
      });
    }

    test("carries FAQPage JSON-LD equal to the questions and answers it shows", async ({
      page,
    }) => {
      await page.goto(homeUrl(locale));
      const rendered = (await renderedFaq(page)).map(({ question, answer }) => ({
        question: normalized(question),
        answer: normalized(answer),
      }));
      const structured = (await structuredFaq(page)).map(({ question, answer }) => ({
        question: normalized(question),
        answer: normalized(answer),
      }));
      expect(rendered.length).toBeGreaterThan(0);
      expect(structured).toEqual(rendered);
    });

    test("links the docs to pages that exist in the same locale", async ({ page }) => {
      await page.goto(homeUrl(locale));
      const hrefs = await page
        .locator(`${FAQ} nav a`)
        .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        if (locale !== "en") expect(href.startsWith(`/${locale}/`), href).toBe(true);
        const [path, anchor] = href.split("#");
        const response = await page.request.get(path ?? "");
        expect(response.status(), href).toBe(200);
        if (anchor !== undefined) {
          await page.goto(href);
          await expect(page.locator(`[id="${decodeURIComponent(anchor)}"]`)).toHaveCount(1);
          await page.goto(homeUrl(locale));
        }
      }
    });
  });

  test.describe(`faq without JavaScript ${homeUrl(locale)}`, () => {
    test.use({ javaScriptEnabled: false });

    test("ships every answer and opens each question on click", async ({ page }) => {
      await page.goto(homeUrl(locale));
      const items = page.locator(ITEMS);
      const count = await items.count();
      expect(count).toBeGreaterThan(0);
      const rendered = await renderedFaq(page);
      for (const { answer } of rendered) expect(normalized(answer).length).toBeGreaterThan(20);
      for (let index = 0; index < count; index += 1) {
        const item = items.nth(index);
        const answer = item.locator(".vk-faq-answer");
        await expect(answer).toBeHidden();
        await item.locator("summary").click();
        await expect(answer).toBeVisible();
      }
    });
  });
}

test.describe("faq keyboard", () => {
  test("toggles with Enter and Space, keeps focus on the question and shows a focus ring", async ({
    page,
  }) => {
    await page.goto("/");
    const first = page.locator(SUMMARIES).first();
    const item = page.locator(ITEMS).first();
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(item).toHaveAttribute("open", "");
    await expect(first).toBeFocused();
    await expect(first).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Space");
    await expect(item).not.toHaveAttribute("open", "");
    await expect(first).toBeFocused();
  });

  test("moves between the questions with the arrow keys, Home and End", async ({ page }) => {
    await page.goto("/");
    await waitForFaqKeys(page);
    const summaries = page.locator(SUMMARIES);
    await summaries.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(summaries.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(summaries.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(summaries.first()).toBeFocused();
  });

  test("works without JavaScript too: Tab reaches the questions and Enter opens one", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await page.locator(SUMMARIES).first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(ITEMS).first()).toHaveAttribute("open", "");
    await context.close();
  });
});

test.describe("faq layout", () => {
  test("keeps the aside head in view beside the open list and the docs links in its column", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await openAll(page);
    const head = page.locator(`${FAQ} .vk-section-head`);
    const list = page.locator(`${FAQ} #faq-list`);
    const nav = await page.locator(`${FAQ} nav`).boundingBox();
    const listBox = await list.boundingBox();
    expect((nav?.x ?? 0) + (nav?.width ?? 0)).toBeLessThan(listBox?.x ?? 0);
    await page.locator(`${ITEMS}`).last().scrollIntoViewIfNeeded();
    const box = await head.boundingBox();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(900);
  });

  test("pins the aside head right under the site header, so nothing scrolls through a gap above it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await openAll(page);
    await page.locator(ITEMS).last().scrollIntoViewIfNeeded();
    const header = await page.locator("header").first().boundingBox();
    const head = page.locator(`${FAQ} .vk-section-aside > .vk-section-head-aside`);
    const box = await head.boundingBox();
    expect(
      Math.abs((box?.y ?? 0) - ((header?.y ?? 0) + (header?.height ?? 0))),
    ).toBeLessThanOrEqual(1);
    await expect(head).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest("nav a") === null,
      [(box?.x ?? 0) + 4, (box?.y ?? 0) + 4] as const,
    );
    expect(hit).toBe(true);
  });

  test("never hides a docs link under the sticky head when the keyboard reaches it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await openAll(page);
    await page.locator(SUMMARIES).last().focus();
    const links = page.locator(`${FAQ} nav a`);
    await expect(async () => {
      await page.keyboard.press("Tab");
      await expect(links.first()).toBeFocused({ timeout: 100 });
    }).toPass();
    for (let index = 0; index < (await links.count()); index += 1) {
      await expect(links.nth(index)).toBeFocused();
      const covered = await links.nth(index).evaluate((link) => {
        const box = link.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + 2, box.y + box.height / 2);
        return hit !== link && !link.contains(hit);
      });
      expect(covered, `link ${index}`).toBe(false);
      await page.keyboard.press("Tab");
    }
  });

  for (const locale of ["en", "de"] as const) {
    for (const [width, height] of [
      [1024, 800],
      [1440, 900],
    ] as const) {
      test(`brings every docs link clear of the sticky head on Tab and Shift+Tab with every answer closed at ${width}px in ${locale}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await page.goto(homeUrl(locale));
        await waitForFaqKeys(page);
        const links = page.locator(`${FAQ} nav a`);
        const count = await links.count();
        expect(count).toBeGreaterThan(0);
        const expectClear = async (index: number, direction: string) => {
          await expect(links.nth(index)).toBeFocused();
          const gap = await links.nth(index).evaluate((link) => {
            const head = link
              .closest(".vk-faq-aside")
              ?.querySelector(":scope > .vk-section-head-aside");
            return (
              link.getBoundingClientRect().top - 4 - (head?.getBoundingClientRect().bottom ?? 0)
            );
          });
          expect(gap, `${direction} link ${index}`).toBeGreaterThanOrEqual(0);
        };
        await page.locator(SUMMARIES).last().focus();
        for (let index = 0; index < count; index += 1) {
          await page.keyboard.press("Tab");
          await expectClear(index, "forward");
        }
        await page.keyboard.press("Tab");
        for (let index = count - 1; index >= 0; index -= 1) {
          await page.keyboard.press("Shift+Tab");
          await expectClear(index, "backward");
        }
      });
    }
  }

  for (const width of [375, 1440]) {
    test(`gives every docs link a 44px target and keeps answers to a short measure at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const heights = await page
        .locator(`${FAQ} nav a`)
        .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
      await openAll(page);
      const widths = await page
        .locator(`${FAQ} .vk-faq-answer`)
        .evaluateAll((answers) => answers.map((answer) => answer.getBoundingClientRect().width));
      for (const answerWidth of widths) expect(answerWidth).toBeLessThanOrEqual(33 * 16 + 1);
    });
  }
});

test.describe("faq on a phone", () => {
  test("sets each question as its own rounded bordered panel", async ({ page }) => {
    await page.goto("/");
    const panels = await page.locator(ITEMS).evaluateAll((items) =>
      items.map((item) => {
        const style = getComputedStyle(item);
        return { radius: style.borderTopLeftRadius, width: style.borderTopWidth };
      }),
    );
    expect(panels.length).toBeGreaterThan(0);
    for (const panel of panels) expect(panel).toEqual({ radius: "20px", width: "1px" });
  });

  test("puts the questions first and the docs links after them", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const list = await page.locator(`${FAQ} #faq-list`).boundingBox();
    const nav = await page.locator(`${FAQ} nav`).boundingBox();
    expect(nav?.y ?? 0).toBeGreaterThan((list?.y ?? 0) + (list?.height ?? 0));
  });

  test("reflows at 320px with every answer open", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    await openAll(page);
    await expectNoHorizontalScroll(page);
    const section = await page.locator(FAQ).boundingBox();
    expect(section?.width ?? 0).toBeLessThanOrEqual(320);
  });
});
