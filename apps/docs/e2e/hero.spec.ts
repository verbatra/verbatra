import { expect, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  pageUrl,
  THEMES,
} from "./support";

const HERO = "section.vk-banner";
const FILES = `${HERO} .vk-banner-files`;

for (const locale of LOCALES) {
  test.describe(`hero ${homeUrl(locale)}`, () => {
    test("opens with the headline, one install chip with a copy button, and the locale files", async ({
      page,
    }) => {
      await page.goto(homeUrl(locale));
      await expect(page.locator(`${HERO} .vk-announce`)).toHaveCount(0);
      await expect(page.locator(`${HERO} .vk-banner-copy > :first-child`)).toHaveJSProperty(
        "tagName",
        "H1",
      );
      await expect(page.locator(`${HERO} .vk-banner-install code`)).toHaveText(
        "npm i -D @verbatra/cli",
      );
      await expect(page.locator(`${HERO} .vk-banner-install button`)).toHaveCount(1);
      await expect(page.locator(`${HERO} .vk-banner-trust`)).toHaveCount(0);
      await expect(page.locator(`${HERO} [role='tablist'], ${HERO} .vk-tracks`)).toHaveCount(0);
      await expect(page.locator(FILES)).toHaveAttribute("aria-hidden", "true");
    });
  });
}

test.describe("hero install chip", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copies the install command", async ({ page }) => {
    await page.goto("/");
    const copy = page.locator(`${HERO} .vk-banner-install button`);
    await expect(async () => {
      await copy.click();
      await expect(copy).toHaveAttribute("data-status", "copied", { timeout: 500 });
    }).toPass();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "npm i -D @verbatra/cli",
    );
  });
});

test.describe("hero without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("paints the h1, the chip and the de card from the server HTML", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(`${HERO} h1`)).toBeVisible();
    await expect(page.locator(`${HERO} .vk-banner-install code`)).toBeVisible();
    await expect(page.locator(`${FILES} [data-front='true']`)).toBeVisible();
  });
});

for (const theme of THEMES) {
  test.describe(`hero locale files in the ${theme} theme`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("pass axe, decorative text included", async ({ page }) => {
      await openInTheme(page, "/", theme);
      await expectNoAxeViolations(page, HERO);
    });
  });
}

test.describe("hero install chip border", () => {
  test("draws the install command without a border", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(`${HERO} .vk-banner-install`)).toHaveCSS("border-top-width", "0px");
  });
});

test.describe("hero layout at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sets three stacked cards in the narrower column beside the copy, inside the first viewport", async ({
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
    expect(copy.width).toBeGreaterThan(demo.width);
    expect(demo.x).toBeGreaterThan(copy.x + copy.width);
    await expect(page.locator(`${FILES} .vk-banner-file`)).toHaveCount(3);
    for (const card of await page.locator(`${FILES} .vk-banner-file`).all()) {
      await expect(card).toBeVisible();
      const rect = await card.boundingBox();
      if (rect === null) throw new Error("a card has no box");
      expect(rect.x).toBeGreaterThanOrEqual(demo.x - 1);
      expect(rect.x + rect.width).toBeLessThanOrEqual(demo.x + demo.width + 1);
      expect(rect.y + rect.height).toBeLessThanOrEqual(900);
    }
    const ctas = await box(".vk-banner-ctas");
    expect(ctas.y + ctas.height).toBeLessThanOrEqual(900);
    const compare = await box(".vk-banner-compare");
    expect(compare.y + compare.height).toBeLessThanOrEqual(900);
    expect(compare.x + compare.width).toBeLessThanOrEqual(copy.x + copy.width + 1);
    expect(compare.height).toBeGreaterThanOrEqual(44);
    const chip = await box(".vk-banner-install");
    expect(chip.y + chip.height).toBeLessThanOrEqual(compare.y + 1);
    await expect(page.locator(`${HERO} > .vk-banner-halo`)).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(`${FILES} .vk-banner-file-line[data-added='true']`)).toHaveCount(2);
  });

  test("shows each back card's name and value line fully above the card in front", async ({
    page,
  }) => {
    await page.goto("/");
    const covered = await page.locator(`${FILES} .vk-banner-file`).evaluateAll((cards) =>
      cards.slice(0, 2).flatMap((card) =>
        [".vk-banner-file-name", ".vk-banner-file-line"].map((part) => {
          const box = card.querySelector(part)?.getBoundingClientRect();
          if (box === undefined) return false;
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return hit?.closest(".vk-banner-file") !== card;
        }),
      ),
    );
    expect(covered).toEqual([false, false, false, false]);
  });

  test("sets the headline at the mockup size with a gradient on its second line only, and the statement never larger", async ({
    page,
  }) => {
    await page.goto("/");
    const title = page.locator(`${HERO} h1`);
    await expect(title).toHaveCSS("font-size", "92px");
    await expect(title).toHaveCSS("font-weight", "600");
    await expect(page.locator(`${HERO} h1 .vk-banner-title-lit`)).toHaveCSS(
      "background-image",
      /linear-gradient/,
    );
    await expect(title).toHaveCSS("background-image", "none");
    const statement = await page.locator(".vk-statement-title").evaluate((node) => {
      return Number.parseFloat(getComputedStyle(node).fontSize);
    });
    expect(statement).toBeLessThanOrEqual(92);
    const padding = await page
      .locator("section#statement")
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingTop));
    expect(padding).toBeCloseTo(180, 0);
  });
});

const COMPARE = `${HERO} .vk-banner-compare`;

for (const locale of LOCALES) {
  for (const width of [391, 768, 1440]) {
    test.describe(`hero action row at ${width}px ${homeUrl(locale)}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test("runs Get started, the install chip, then a content-width flush-left compare link", async ({
        page,
      }) => {
        await page.goto(homeUrl(locale));
        const box = async (selector: string) => {
          const rect = await page.locator(`${HERO} ${selector}`).first().boundingBox();
          if (rect === null) throw new Error(`${selector} has no box`);
          return rect;
        };
        const order = await page
          .locator(`${HERO} .vk-banner-ctas > *`)
          .evaluateAll((nodes) =>
            nodes.map((node) =>
              node.classList.contains("vk-banner-install")
                ? "chip"
                : (node.getAttribute("href") ??
                  node.querySelector("a")?.getAttribute("href") ??
                  null),
            ),
          );
        expect(order).toEqual([
          pageUrl(locale, "/docs/quickstart"),
          "chip",
          pageUrl(locale, "/compare"),
        ]);
        const primary = await box(".vk-banner-ctas > a:first-child");
        const chip = await box(".vk-banner-install");
        const compare = await box(".vk-banner-compare");
        const title = await box("h1");
        const lead = await box(".vk-banner-lead");
        const primaryMiddle = primary.y + primary.height / 2;
        const chipMiddle = chip.y + chip.height / 2;
        const sideBySide = Math.abs(primaryMiddle - chipMiddle) <= 1;
        expect(sideBySide ? chip.x > primary.x : chip.y >= primary.y + primary.height).toBe(true);
        expect(chip.y + chip.height).toBeLessThanOrEqual(compare.y + 1);
        for (const edge of [title.x, lead.x, primary.x]) {
          expect(Math.abs(compare.x - edge)).toBeLessThanOrEqual(0.5);
        }
        const labelWidth = await page.locator(COMPARE).evaluate((link) => {
          const range = document.createRange();
          range.selectNodeContents(link);
          return range.getBoundingClientRect().width;
        });
        expect(Math.abs(compare.width - labelWidth)).toBeLessThanOrEqual(1);
        expect(compare.height).toBeGreaterThanOrEqual(44);
        expect(primary.height).toBeCloseTo(50, 0);
        expect(primary.height).toBeLessThan(chip.height);
        if (width >= 768) expect(sideBySide).toBe(true);
        await expectNoHorizontalScroll(page);
      });

      test("hugs the label: the empty row beside it does not navigate and hover underlines in the accent", async ({
        page,
      }) => {
        await page.goto(homeUrl(locale));
        const link = page.locator(COMPARE);
        const compare = await link.boundingBox();
        if (compare === null) throw new Error("the compare link has no box");
        const copy = await page.locator(`${HERO} .vk-banner-copy`).boundingBox();
        if (copy === null) throw new Error("the copy column has no box");
        const labelEnd = compare.x + compare.width;
        const emptyX = Math.min(labelEnd + 150, copy.x + copy.width - 2);
        expect(emptyX).toBeGreaterThan(labelEnd + 8);
        await page.mouse.click(emptyX, compare.y + compare.height / 2);
        await page.waitForTimeout(300);
        expect(new URL(page.url()).pathname).toBe(homeUrl(locale));
        await expect(link).toHaveCSS("text-decoration-line", "underline");
        const resting = await link.evaluate((node) => getComputedStyle(node).textDecorationColor);
        await link.hover();
        const accent = await page.evaluate(() => {
          const probe = document.createElement("span");
          probe.style.color = "var(--accent)";
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        });
        await expect(link).toHaveCSS("text-decoration-color", accent);
        expect(resting).not.toBe(accent);
      });

      test("tabs from Get started to the copy button, then the compare link", async ({ page }) => {
        await page.goto(homeUrl(locale));
        await page.locator(`${HERO} .vk-banner-ctas > a:first-child`).focus();
        await page.keyboard.press("Tab");
        await expect(page.locator(`${HERO} .vk-banner-install button`)).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.locator(COMPARE)).toBeFocused();
      });
    });
  }
}

for (const width of [320, 375]) {
  test.describe(`hero at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("shows only the front card, inside the column, without a sideways scroll", async ({
      page,
    }) => {
      await page.goto("/");
      await expectNoHorizontalScroll(page);
      await expect(page.locator(`${FILES} .vk-banner-file:visible`)).toHaveCount(1);
      await expect(page.locator(`${FILES} [data-front='true']`)).toBeVisible();
      const card = await page.locator(`${FILES} [data-front='true']`).boundingBox();
      if (card === null) throw new Error("the front card has no box");
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(width);
      const chip = await page.locator(`${HERO} .vk-banner-install`).boundingBox();
      if (chip === null) throw new Error("the install chip has no box");
      expect(chip.x + chip.width).toBeLessThanOrEqual(width);
    });
  });
}

for (const locale of ["en", "de"] as const) {
  for (const width of [1440, 1024, 375, 320]) {
    test.describe(`hero value lines at ${width}px ${homeUrl(locale)}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test("wrap inside their card and are never cut off", async ({ page }) => {
        await page.goto(homeUrl(locale));
        await expectNoHorizontalScroll(page);
        const cut = await page
          .locator(`${FILES} .vk-banner-file:visible`)
          .evaluateAll((cards) =>
            cards.flatMap((card) =>
              [...card.querySelectorAll<HTMLElement>(".vk-banner-file-line")]
                .filter((line) => line.scrollWidth > line.clientWidth + 1)
                .map((line) => line.textContent),
            ),
          );
        expect(cut).toEqual([]);
        const ellipsis = await page
          .locator(`${FILES} .vk-banner-file-line`)
          .evaluateAll(
            (lines) =>
              lines.filter((line) => getComputedStyle(line).textOverflow !== "clip").length,
          );
        expect(ellipsis).toBe(0);
      });
    });
  }
}

test.describe("hero install command at 320px in German", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test("shows the whole command inside the chip", async ({ page }) => {
    await page.goto(homeUrl("de"));
    const fits = await page.locator(`${HERO} .vk-banner-install`).evaluate((chip) => {
      const code = chip.querySelector("code");
      const box = chip.getBoundingClientRect();
      const inner = code?.getBoundingClientRect();
      if (code === null || inner === undefined) return false;
      return (
        code.scrollWidth <= code.clientWidth + 1 &&
        inner.left >= box.left &&
        inner.right <= box.right &&
        inner.bottom <= box.bottom &&
        box.right <= window.innerWidth
      );
    });
    expect(fits).toBe(true);
    await expect(page.locator(`${HERO} .vk-banner-install code`)).toHaveText(
      "npm i -D @verbatra/cli",
    );
  });
});

test.describe("statement to highlights gap at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("totals about 180px of padding like mockup F", async ({ page }) => {
    await page.goto("/");
    const gap = await page.evaluate(() => {
      const below = Number.parseFloat(
        getComputedStyle(document.querySelector("section#statement") as Element).paddingBottom,
      );
      const above = Number.parseFloat(
        getComputedStyle(document.querySelector("section#highlights") as Element).paddingTop,
      );
      return below + above;
    });
    expect(gap).toBeGreaterThanOrEqual(170);
    expect(gap).toBeLessThanOrEqual(190);
  });
});
