import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page, test } from "playwright/test";
import { readIncludedSource } from "@/lib/docs-pages";
import type { Locale } from "@/lib/i18n";
import { isStillNew } from "@/lib/release-line";
import {
  brokenWordsIn,
  expectNoAxeViolations,
  LOCALES,
  openInTheme,
  pageUrl,
  THEMES,
} from "./support";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
const VERSIONS = JSON.parse(
  readFileSync(join(import.meta.dirname, "../lib/version.generated.json"), "utf8"),
) as { version: string; studioVersion: string; mcpVersion: string };

const RELEASED = {
  cli: VERSIONS.version,
  studio: VERSIONS.studioVersion,
  mcp: VERSIONS.mcpVersion,
};

const BADGE = /<AvailableFrom\s+version="([^"]+)"(?:\s+pkg="([^"]+)")?\s*\/>/g;
const BADGE_UNDER_HEADING =
  /^#{2,4} (.+)\n\n<AvailableFrom\s+version="([^"]+)"(?:\s+pkg="([^"]+)")?\s*\/>$/gm;

const BADGE_HEAVY = [
  "/docs/cli/translate",
  "/docs/config-file",
  "/docs/providers",
  "/docs/cli/mcp",
  "/docs/agent-tools-in-studio",
  "/de/docs/cli/translate",
] as const;

function availableFromTitle(locale: Locale): string {
  const messages = JSON.parse(
    readFileSync(join(import.meta.dirname, `../messages/${locale}.json`), "utf8"),
  ) as { docs: { availableFrom: { title: string } } };
  return messages.docs.availableFrom.title;
}

const TEXT_NODE = 3;

type Badge = { readonly version: string; readonly pkg: string | undefined };

function localeAndSlug(url: string): { locale: Locale; slug: string } {
  const locale = LOCALES.find((candidate) => url.startsWith(`/${candidate}/`)) ?? "en";
  const path = url.replace(new RegExp(`^/${locale}/`), "/");
  return { locale, slug: path.replace(/^\/docs\//, "") };
}

function sourceOf(url: string): string {
  const { locale, slug } = localeAndSlug(url);
  const suffix = locale === "en" ? ".mdx" : `.${locale}.mdx`;
  const relative = `${slug}${suffix}`;
  const file = readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" }).find(
    (candidate) => candidate.replace(/\([^)]+\)\//g, "") === relative,
  );
  if (file === undefined) throw new Error(`no source for ${url}`);
  return readIncludedSource(join(CONTENT_DIR, file));
}

function badgesOf(source: string): ReadonlyArray<Badge> {
  return [...source.matchAll(BADGE)].map((match) => ({ version: match[1] ?? "", pkg: match[2] }));
}

function isNewBadge({ version, pkg }: Badge): boolean {
  return isStillNew(pkg === undefined ? { version } : { version, pkg }, RELEASED);
}

function availableFromText(locale: Locale): RegExp {
  const title = availableFromTitle(locale);
  return new RegExp(title.split("{version}")[0]?.trim() ?? "Available from");
}

function headingNamed(page: Page, text: string): Locator {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page
    .locator("#nd-page :is(h2, h3, h4)")
    .filter({ has: page.locator("a[data-card]", { hasText: new RegExp(`^${escaped}`) }) })
    .first();
}

async function openPage(page: Page, url: string): Promise<void> {
  const response = await page.goto(url);
  expect(response?.status()).toBe(200);
  await expect(page.locator("#nd-page")).toBeVisible();
}

test.describe("version badges on badge-heavy pages", () => {
  for (const url of BADGE_HEAVY) {
    test(`${url} shows no Available from text and one New pill per current badge`, async ({
      page,
    }) => {
      const { locale } = localeAndSlug(url);
      const badges = badgesOf(sourceOf(url));
      expect(badges.length).toBeGreaterThan(0);
      await openPage(page, url);

      const visible = (await page.locator("#nd-page").textContent()) ?? "";
      expect(visible).not.toMatch(availableFromText(locale));

      const pills = page.locator("#nd-page .vk-available-from");
      await expect(pills).toHaveCount(badges.filter(isNewBadge).length);
      for (const pill of await pills.all()) {
        await expect(pill).toHaveClass(/vk-pill-new/);
        await expect(pill).not.toContainText(/\d+\.\d+\.\d+/);
      }
    });
  }
});

function currentHeadings(url: string): ReadonlyArray<string> {
  return [...sourceOf(url).matchAll(BADGE_UNDER_HEADING)]
    .filter((match) => isNewBadge({ version: match[2] ?? "", pkg: match[3] }))
    .map((match) => (match[1] ?? "").replace(/`/g, ""));
}

test.describe("a page with a current-line badge", () => {
  const url = "/docs/cli/translate";

  for (const sectionUrl of ["/docs/sdk/review", "/docs/error-codes", "/docs/sdk/history"]) {
    test(`${sectionUrl} puts the New pill in the heading the badge sits under`, async ({
      page,
    }) => {
      const headings = currentHeadings(sectionUrl);
      test.skip(headings.length === 0, "no current-line badge sits directly under a heading");
      await openPage(page, sectionUrl);
      for (const text of headings) {
        await expect(headingNamed(page, text).locator(".vk-pill-new"), text).toHaveCount(1);
      }
    });
  }

  test("keeps the .md output literal, with every version in full", async ({ request }) => {
    const response = await request.get(`${url}.md`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    for (const { version, pkg } of badgesOf(sourceOf(url))) {
      const attributes = pkg === undefined ? "" : ` pkg="${pkg}"`;
      expect(body).toContain(`<AvailableFrom version="${version}"${attributes} />`);
    }
    expect(body).not.toContain("vk-pill-new");
  });

  test("keeps no version choice anywhere", async ({ page }) => {
    await openPage(page, url);
    await expect(page.locator(".vk-header").first()).toBeVisible();
    await expect(page.locator("[class*='vk-version']")).toHaveCount(0);
    await expect(page.getByLabel("CLI/SDK")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("docs-version"))).toBeNull();
    expect(
      await page.evaluate(() =>
        [...document.documentElement.attributes].some((attribute) =>
          attribute.name.startsWith("data-vk-"),
        ),
      ),
    ).toBe(false);
  });

  for (const width of [1440, 1024, 768, 375]) {
    test(`has no version picker in the header at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openPage(page, url);
      await expect(page.locator("#nd-subnav select, #nd-subnav details")).toHaveCount(0);
      await expect(page.locator("#nd-subnav")).not.toContainText(/CLI\/SDK/);
    });
  }

  for (const theme of THEMES) {
    test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
      await openInTheme(page, pageUrl("en", url), theme);
      await expectNoAxeViolations(page);
    });
  }
});

test.describe("a heading whose badge renders nothing", () => {
  const url = "/docs/cli/translate";

  for (const width of [320, 375, 1280]) {
    test(`is as tall as the same heading without a badge at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const unrendered = [...sourceOf(url).matchAll(BADGE_UNDER_HEADING)]
        .filter((match) => !isNewBadge({ version: match[2] ?? "", pkg: match[3] }))
        .map((match) => (match[1] ?? "").replace(/`/g, ""));
      expect(unrendered.length).toBeGreaterThan(0);
      await openPage(page, url);
      for (const text of unrendered) {
        const sizes = await headingNamed(page, text).evaluate((node) => {
          const probe = node.cloneNode(true) as HTMLElement;
          const anchor = probe.querySelector("a");
          if (anchor === null) throw new Error("heading without an anchor");
          anchor.textContent = (node.querySelector("a")?.textContent ?? "").trim();
          probe.removeAttribute("id");
          node.after(probe);
          const result = {
            actual: node.getBoundingClientRect().height,
            plain: probe.getBoundingClientRect().height,
            children: [...(node.querySelector("a")?.childNodes ?? [])].map(
              (child) => child.nodeType,
            ),
          };
          probe.remove();
          return result;
        });
        expect(Math.abs(sizes.actual - sizes.plain), text).toBeLessThanOrEqual(0.5);
        expect(sizes.children, text).toEqual([TEXT_NODE]);
      }
    });
  }

  test("fits a New pill inside the heading at 320px without overflow or a broken word", async ({
    page,
  }) => {
    const sectionUrl = "/docs/sdk/review";
    test.skip(currentHeadings(sectionUrl).length === 0, "no current-line badge under a heading");
    await page.setViewportSize({ width: 320, height: 900 });
    await openPage(page, sectionUrl);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const pills = await page.locator("#nd-page :is(h2, h3, h4) .vk-pill-new").all();
    expect(pills.length).toBeGreaterThan(0);
    for (const pill of pills) {
      const box = await pill.boundingBox();
      expect(box?.x ?? 0).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    }
    const split = await page.evaluate(
      brokenWordsIn,
      "#nd-page :is(h2, h3, h4):has(.vk-pill-new) > a[data-card]",
    );
    expect(split.found).toEqual([]);
  });
});
