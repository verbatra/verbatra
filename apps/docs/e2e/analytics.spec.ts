import { expect, type Page, test } from "playwright/test";
import { UMAMI_ORIGIN } from "../lib/umami-config.mjs";
import { stubUmami } from "../scripts/umami-stub.mjs";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  LOCALES,
  openInTheme,
  pageUrl,
  THEMES,
} from "./support";

const NO_CHOICE = { cookies: [], origins: [] };
const FULL_CHOICE = {
  cookies: [
    {
      name: "verbatra_analytics",
      value: "full",
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    },
  ],
  origins: [],
};

const PROMPT_NAME = "Analytics choice";

function prompt(page: Page) {
  return page.getByRole("region", { name: PROMPT_NAME });
}

async function choiceCookie(page: Page): Promise<string | undefined> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "verbatra_analytics")?.value;
}

function sentPayloads(requests: Awaited<ReturnType<typeof stubUmami>>) {
  return requests
    .filter((request) => request.pathname === "/api/send")
    .map((request) => JSON.parse(request.body ?? "{}").payload as Record<string, unknown>);
}

test.describe("analytics before a choice", () => {
  test.use({ storageState: NO_CHOICE });

  test("asks once, and talks to Umami not at all", async ({ page, context }) => {
    const requests = await stubUmami(context);
    await page.goto("/");
    await expect(prompt(page)).toBeVisible();
    await expect(prompt(page).getByRole("button", { name: "Allow" })).toBeVisible();
    await expect(prompt(page).getByRole("button", { name: "No thanks" })).toBeVisible();
    expect(await page.evaluate(() => "umami" in window)).toBe(false);
    expect(
      await page
        .locator("script[src]")
        .evaluateAll((nodes) => nodes.map((n) => (n as HTMLScriptElement).src)),
    ).not.toContain(`${UMAMI_ORIGIN}/script.js`);
    expect(requests).toEqual([]);
  });

  test("No thanks stores default, sends nothing and never asks again", async ({
    page,
    context,
  }) => {
    const requests = await stubUmami(context);
    await page.goto("/");
    await prompt(page).getByRole("button", { name: "No thanks" }).click();
    await expect(prompt(page)).toHaveCount(0);
    expect(await choiceCookie(page)).toBe("default");
    await page.reload();
    await page.goto("/docs");
    await expect(prompt(page)).toHaveCount(0);
    expect(requests).toEqual([]);
  });

  test("Allow loads the tracker and the recorder without a reload and counts the page", async ({
    page,
    context,
  }) => {
    const requests = await stubUmami(context);
    await page.goto("/");
    await prompt(page).getByRole("button", { name: "Allow" }).click();
    await expect(prompt(page)).toHaveCount(0);
    expect(await choiceCookie(page)).toBe("full");
    await expect
      .poll(() => requests.map((request) => request.pathname))
      .toEqual(expect.arrayContaining(["/script.js", "/recorder.js", "/api/send"]));
    await expect.poll(() => page.evaluate(() => "umami" in window)).toBe(true);
  });
});

test.describe("analytics after the full choice", () => {
  test.use({ storageState: FULL_CHOICE });

  test("counts client navigations and reports a copy event", async ({ page, context }) => {
    const requests = await stubUmami(context);
    await page.goto("/");
    await expect.poll(() => sentPayloads(requests).length).toBeGreaterThanOrEqual(1);
    const before = sentPayloads(requests).length;
    await page.locator("header a[href='/docs'], header a[href$='/docs']").first().click();
    await expect(page).toHaveURL(/\/docs/);
    await expect.poll(() => sentPayloads(requests).length).toBeGreaterThan(before);
    await page.goto("/");
    await expect(async () => {
      await page.locator("[data-copy-surface='command-row']").first().click();
      expect(sentPayloads(requests).map((payload) => payload.name)).toContain("copy_code");
    }).toPass();
    const copy = sentPayloads(requests).find((payload) => payload.name === "copy_code");
    expect(copy?.data).toEqual({ surface: "command-row" });
  });

  test("the tracker never sends the screen size or a query string, and opens no other origin", async ({
    page,
    context,
    baseURL,
  }) => {
    const requests = await stubUmami(context);
    const foreign: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL ?? "").origin) {
        foreign.push(url.origin);
      }
    });
    await page.goto("/docs?q=secret&utm_source=newsletter#intro");
    await expect.poll(() => sentPayloads(requests).length).toBeGreaterThanOrEqual(1);
    for (const payload of sentPayloads(requests)) {
      expect(payload).not.toHaveProperty("screen");
      expect(payload.url).toBe("/docs?utm_source=newsletter");
    }
    expect(new Set(foreign)).toEqual(new Set([UMAMI_ORIGIN]));
  });

  test("the recorder sends the full page address, which is why the policy says so", async ({
    page,
    context,
  }) => {
    const requests = await stubUmami(context);
    await page.goto("/docs?q=secret#intro");
    await expect
      .poll(() => requests.filter((request) => request.pathname === "/api/record").length)
      .toBeGreaterThanOrEqual(1);
    const recorded = requests
      .filter((request) => request.pathname === "/api/record")
      .map((request) => JSON.parse(request.body ?? "{}").url as string);
    expect(recorded.every((url) => url.includes("?q=secret#intro"))).toBe(true);
  });

  test("raises no CSP violation while the tracker and recorder run", async ({ page, context }) => {
    await stubUmami(context);
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/content security policy/i.test(message.text())) violations.push(message.text());
    });
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => "umami" in window)).toBe(true);
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });

  test("blocks the contact form and the privacy switch from replay", async ({ page, context }) => {
    await stubUmami(context);
    await page.goto("/contact");
    await expect(page.locator("form.rr-block")).toHaveCount(1);
    await page.goto("/privacy");
    await expect(page.locator('.rr-block:has(form[action="/api/analytics"])')).toHaveCount(1);
  });

  test("a privacy signal beats the full choice", async ({ page, context }) => {
    const requests = await stubUmami(context);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "globalPrivacyControl", { value: true });
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(prompt(page)).toHaveCount(0);
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => "umami" in window)).toBe(false);
  });

  test("Do Not Track beats the full choice", async ({ page, context }) => {
    const requests = await stubUmami(context);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "doNotTrack", { value: "1" });
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(requests).toEqual([]);
  });
});

async function focusedBoxesOutsidePrompt(page: Page, steps: number) {
  const overlaps: string[] = [];
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press("Tab");
    const result = await page.evaluate(() => {
      const region = document.querySelector("section.rr-block[aria-label]");
      const active = document.activeElement;
      if (!region || !active || active === document.body || region.contains(active)) return null;
      const a = active.getBoundingClientRect();
      const r = region.getBoundingClientRect();
      const control = a.height <= 200;
      const overlaps =
        control && a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top;
      return overlaps ? `${active.tagName} ${a.top}-${a.bottom} behind ${r.top}-${r.bottom}` : null;
    });
    if (result !== null) overlaps.push(result);
  }
  return overlaps;
}

test.describe("analytics prompt and keyboard focus", () => {
  test.use({ storageState: NO_CHOICE });

  for (const size of [
    { width: 375, height: 667 },
    { width: 1440, height: 900 },
  ]) {
    for (const path of ["/", "/docs/config-file"]) {
      test(`no focused element is hidden behind the prompt at ${size.width}px on ${path}`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.goto(path);
        await expect(prompt(page)).toBeVisible();
        await page.keyboard.press("Tab");
        expect(await prompt(page).evaluate((node) => node.contains(document.activeElement))).toBe(
          true,
        );
        expect(await focusedBoxesOutsidePrompt(page, 70)).toEqual([]);
      });
    }
  }

  test("Escape hides the prompt for this page view and stores nothing", async ({ page }) => {
    await page.goto("/");
    await expect(prompt(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(prompt(page)).toHaveCount(0);
    expect(await choiceCookie(page)).toBeUndefined();
    await page.reload();
    await expect(prompt(page)).toBeVisible();
  });

  test("the back-to-top button is not under the prompt while the prompt shows", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(prompt(page)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator(".vk-scroll-top")).toBeHidden();
    await prompt(page).getByRole("button", { name: "No thanks" }).click();
    await expect(page.locator(".vk-scroll-top")).toBeVisible();
  });

  test("the page leaves room below its end for the prompt", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/imprint");
    await expect(prompt(page)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const lastBottom = await page.evaluate(
      () => document.querySelector("footer")?.getBoundingClientRect().bottom ?? 0,
    );
    const promptTop = (await prompt(page).boundingBox())?.y ?? 0;
    expect(lastBottom).toBeLessThanOrEqual(promptTop);
  });

  for (const locale of LOCALES) {
    test(`the ${locale} prompt takes at most about 30 percent of a 320x640 screen`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(pageUrl(locale, "/"));
      const box = await page.locator("section.rr-block[aria-label]").boundingBox();
      expect(box?.height).toBeLessThanOrEqual(640 * 0.31);
      for (const button of await page
        .locator("section.rr-block[aria-label]")
        .getByRole("button")
        .all()) {
        expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
    });
  }
});

test.describe("the privacy switch shows the stored choice", () => {
  test.use({ storageState: NO_CHOICE });

  for (const [value, pressed, status] of [
    ["full", "Allow extended analytics", /extended analytics is allowed/i],
    ["default", "Count page views only", /extended analytics stays off/i],
    ["off", "Opt out of analytics", /you have opted out/i],
  ] as const) {
    test(`the ${value} choice presses ${pressed}`, async ({ page, context }) => {
      await context.addCookies([{ name: "verbatra_analytics", value, url: "http://localhost" }]);
      await page.goto("/privacy");
      const panel = page.locator('.rr-block:has(form[action="/api/analytics"])');
      await expect(panel.getByRole("button", { pressed: true })).toHaveText(pressed);
      await expect(panel.getByRole("button", { pressed: false })).toHaveCount(2);
      await expect(panel.getByRole("status")).toHaveText(status);
      for (const button of await panel.getByRole("button").all()) {
        expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
    });
  }
});

test.describe("analytics with a stored off or default choice", () => {
  test.use({ storageState: NO_CHOICE });

  for (const value of ["off", "default"]) {
    test(`the ${value} choice loads nothing and asks nothing`, async ({ page, context }) => {
      const requests = await stubUmami(context);
      await context.addCookies([{ name: "verbatra_analytics", value, url: "http://localhost" }]);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await expect(prompt(page)).toHaveCount(0);
      expect(requests).toEqual([]);
    });
  }
});

test.describe("analytics choice without JavaScript", () => {
  test.use({ storageState: NO_CHOICE, javaScriptEnabled: false });

  for (const [button, value] of [
    ["Allow extended analytics", "full"],
    ["Count page views only", "default"],
    ["Opt out of analytics", "off"],
  ] as const) {
    test(`${button} stores ${value} and returns to the privacy page`, async ({ page }) => {
      await page.goto("/privacy");
      await page.getByRole("button", { name: button }).click();
      await expect(page).toHaveURL(new RegExp(`/privacy\\?analytics=${value}#analytics-${value}$`));
      expect(await choiceCookie(page)).toBe(value);
      await expect(page.locator(`#analytics-${value}`)).toBeVisible();
    });
  }
});

test.describe("analytics surfaces", () => {
  test.use({ storageState: NO_CHOICE });

  for (const locale of LOCALES) {
    for (const theme of THEMES) {
      test(`the ${locale} prompt has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, pageUrl(locale, "/") || "/", theme);
        await expect(page.locator("section.rr-block[aria-label]")).toHaveCount(1);
        await expectNoAxeViolations(page);
      });

      test(`the ${locale} privacy switch has no axe violations in the ${theme} theme`, async ({
        page,
      }) => {
        await openInTheme(page, pageUrl(locale, "/privacy"), theme);
        await expectNoAxeViolations(page, "#analytics");
      });
    }

    test(`the ${locale} prompt and switch reflow at 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(pageUrl(locale, "/privacy"));
      await expect(page.locator("section.rr-block[aria-label]")).toHaveCount(1);
      await expectNoHorizontalScroll(page);
      const box = await page.locator("section.rr-block[aria-label]").boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    });
  }
});

test.describe("analytics click markers on the real docs components", () => {
  test.use({ storageState: FULL_CHOICE });

  for (const surface of ["code-block", "page-markdown"]) {
    test(`a click on the ${surface} copy control reports copy_code`, async ({ page, context }) => {
      const requests = await stubUmami(context);
      await page.goto("/docs/config-file");
      await expect.poll(() => sentPayloads(requests).length).toBeGreaterThanOrEqual(1);
      await expect(async () => {
        await page
          .locator(
            `[data-copy-surface="${surface}"] button, button[data-copy-surface="${surface}"]`,
          )
          .first()
          .click();
        const copy = sentPayloads(requests).find((payload) => payload.name === "copy_code");
        expect(copy?.data).toEqual({ surface });
      }).toPass();
    });
  }
});
