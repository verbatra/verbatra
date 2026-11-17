import { expect, type Page, test } from "playwright/test";
import { UMAMI_ORIGIN } from "../lib/umami-config.mjs";
import { LOCALES, pageUrl } from "./support";

interface Reported {
  readonly e: string;
  readonly p?: Record<string, unknown>;
  readonly u: string;
}

const HYDRATED = () =>
  Object.keys(document.body ?? {}).some((key) => key.startsWith("__reactFiber$"));

async function captureRelay(page: Page): Promise<Reported[]> {
  const reports: Reported[] = [];
  await page.route("**/api/e", async (route) => {
    reports.push(JSON.parse(route.request().postData() ?? "{}") as Reported);
    await route.fulfill({ status: 204 });
  });
  return reports;
}

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(HYDRATED);
}

async function keepClicksOnThePage(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.addEventListener("click", (event) => event.preventDefault(), { capture: true }),
  );
}

function watchForeignRequests(page: Page, baseURL: string | undefined): string[] {
  const foreign: string[] = [];
  const own = new URL(baseURL ?? "").origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== own) foreign.push(url.origin);
  });
  return foreign;
}

test.describe("analytics has no consent surface", () => {
  for (const locale of LOCALES) {
    test(`the ${locale} home page shows no prompt, no switch and no Umami script`, async ({
      page,
    }) => {
      await open(page, pageUrl(locale, "/"));
      await expect(page.getByRole("region", { name: /analytics/i })).toHaveCount(0);
      await expect(page.locator("[data-analytics-prompt]")).toHaveCount(0);
      expect(await page.evaluate(() => "umami" in window)).toBe(false);
      expect(
        await page
          .locator("script[src]")
          .evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).src)),
      ).not.toContainEqual(expect.stringContaining("umami"));
    });
  }

  test("the privacy page has no analytics form or button, and the footer no settings link", async ({
    page,
  }) => {
    await open(page, "/privacy");
    await expect(page.locator("main form, main button")).toHaveCount(0);
    await expect(page.locator('a[href$="/privacy#analytics"]')).toHaveCount(0);
    await expect(page.locator("#analytics")).toBeVisible();
    await expect(page.locator("#right-to-object")).toBeVisible();
  });

  test("a visit and its interactions set no cookie and talk to no other origin", async ({
    page,
    context,
    baseURL,
  }) => {
    const foreign = watchForeignRequests(page, baseURL);
    await captureRelay(page);
    await open(page, "/docs");
    await page.locator("header a[href='/'], header a[href$='/']").first().click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/privacy");
    expect(await context.cookies()).toEqual([]);
    expect(foreign.filter((origin) => origin === UMAMI_ORIGIN)).toEqual([]);
    expect(foreign).toEqual([]);
  });

  test("the relay answers 204 without a cookie, whatever it is sent", async ({
    request,
    baseURL,
  }) => {
    for (const data of [{ e: "pageview", u: "/docs" }, { e: "unknown", u: "/docs" }, "not json"]) {
      const response = await request.post("/api/e", {
        data,
        headers: { "content-type": "application/json", origin: new URL(baseURL ?? "").origin },
      });
      expect(response.status()).toBe(204);
      expect(await response.text()).toBe("");
      expect(response.headers()["set-cookie"]).toBeUndefined();
    }
  });
});

test.describe("the reporter sends only the allowlisted shape to the relay", () => {
  test("a soft navigation reports one bare pageview and the document load reports none", async ({
    page,
  }) => {
    const reports = await captureRelay(page);
    await open(page, "/docs");
    await page.locator("header a[href='/'], header a[href$='/']").first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => reports.length).toBe(1);
    expect(reports).toEqual([{ e: "pageview", u: "/" }]);
  });

  test("a hash or query change is not a page and reports nothing", async ({ page }) => {
    const reports = await captureRelay(page);
    await open(page, "/docs");
    await page.evaluate(() => window.history.pushState(null, "", "/docs?x=1#frag"));
    await page.locator("header a[href='/'], header a[href$='/']").first().click();
    await expect.poll(() => reports.length).toBe(1);
    expect(reports).toEqual([{ e: "pageview", u: "/" }]);
  });

  test("a back navigation reports the page it returns to", async ({ page }) => {
    const reports = await captureRelay(page);
    await open(page, "/docs");
    await page.locator("header a[href='/'], header a[href$='/']").first().click();
    await expect.poll(() => reports.length).toBe(1);
    await page.goBack();
    await expect.poll(() => reports.length).toBe(2);
    expect(reports.map(({ u }) => u)).toEqual(["/", "/docs"]);
  });

  test("a privacy signal changes nothing in the browser, which never reads it", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "Sec-GPC": "1", DNT: "1" },
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const reads: string[] = [];
      Reflect.set(window, "__signalReads", reads);
      for (const key of ["globalPrivacyControl", "doNotTrack"]) {
        Object.defineProperty(Navigator.prototype, key, {
          configurable: true,
          get() {
            reads.push(key);
            return undefined;
          },
        });
      }
    });
    const reports = await captureRelay(page);
    await open(page, "/docs");
    await page.locator("header a[href='/'], header a[href$='/']").first().click();
    await expect.poll(() => reports.length).toBe(1);
    expect(reports).toEqual([{ e: "pageview", u: "/" }]);
    expect(await page.evaluate(() => Reflect.get(window, "__signalReads"))).toEqual([]);
    await context.close();
  });
});

test.describe("each marked control reports its own event", () => {
  async function reported(page: Page, url: string, act: () => Promise<void>): Promise<Reported[]> {
    const reports = await captureRelay(page);
    await open(page, url);
    await keepClicksOnThePage(page);
    await expect(async () => {
      await act();
      expect(reports.length).toBeGreaterThanOrEqual(1);
    }).toPass();
    return reports;
  }

  for (const surface of ["code-block", "page-markdown"]) {
    test(`the ${surface} copy control reports copy_code`, async ({ page }) => {
      const reports = await reported(page, "/docs/config-file", () =>
        page
          .locator(
            `[data-copy-surface="${surface}"] button, button[data-copy-surface="${surface}"]`,
          )
          .first()
          .click(),
      );
      expect(reports).toContainEqual({
        e: "copy_code",
        p: { surface },
        u: "/docs/config-file",
      });
    });
  }

  test("the install command row reports copy_code for the command-row surface", async ({
    page,
  }) => {
    const reports = await reported(page, "/", () =>
      page.locator("[data-copy-surface='command-row']").first().click(),
    );
    expect(reports).toContainEqual({ e: "copy_code", p: { surface: "command-row" }, u: "/" });
  });

  test("the hero call-to-action reports cta_click with its id and no text", async ({ page }) => {
    const reports = await reported(page, "/", () =>
      page.locator("[data-cta='hero-quickstart']").first().click(),
    );
    expect(reports).toContainEqual({ e: "cta_click", p: { id: "hero-quickstart" }, u: "/" });
  });

  test("an external link in a new tab reports outbound_click with its destination", async ({
    page,
  }) => {
    const reports = await reported(page, "/", () =>
      page.locator("footer a[target='_blank'][href*='github.com']").first().click(),
    );
    expect(reports).toContainEqual({ e: "outbound_click", p: { dest: "github" }, u: "/" });
  });

  test("the MCP install link reports mcp_install_click", async ({ page }) => {
    const reports = await reported(page, "/docs/connect-an-mcp-client", async () => {
      await page.getByRole("tab", { name: "VS Code" }).first().click();
      await page.locator("a[data-mcp-install]").first().click({ timeout: 2000 });
    });
    expect(reports).toContainEqual({
      e: "mcp_install_click",
      u: "/docs/connect-an-mcp-client",
    });
  });

  test("opening the search reports search_open and never what is typed", async ({ page }) => {
    const reports = await captureRelay(page);
    await open(page, "/docs");
    await expect(async () => {
      await page.locator("button[data-search-full]").first().click();
      await expect(page.locator('[role="dialog"] input').first()).toBeVisible();
    }).toPass();
    await page.locator('[role="dialog"] input').first().fill("secret query");
    await expect.poll(() => reports.some(({ e }) => e === "search_open")).toBe(true);
    expect(JSON.stringify(reports)).not.toContain("secret");
  });

  test("choosing a language reports locale_switch with the locale code only", async ({ page }) => {
    const reports = await captureRelay(page);
    await open(page, "/docs");
    await page
      .getByRole("button", { name: /choose a language/i })
      .first()
      .click();
    await page.locator("[data-locale-switch='de']").click();
    await expect.poll(() => reports.some(({ e }) => e === "locale_switch")).toBe(true);
    expect(reports).toContainEqual({ e: "locale_switch", p: { to: "de" }, u: "/docs" });
  });

  test("a locale switch never double counts: a /de/docs document load and a reporter page view are mutually exclusive", async ({
    page,
  }) => {
    const reports = await captureRelay(page);
    const documentLoads: string[] = [];
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.resourceType() === "document") {
        documentLoads.push(new URL(request.url()).pathname);
      }
    });
    await open(page, "/docs");
    documentLoads.length = 0;
    await page
      .getByRole("button", { name: /choose a language/i })
      .first()
      .click();
    await page.locator("[data-locale-switch='de']").click();
    await expect(page).toHaveURL(/\/de\/docs$/);
    await page.waitForLoadState("networkidle");
    const countedByReporter = reports.filter(({ e, u }) => e === "pageview" && u === "/de/docs");
    const documentLoadsOfDe = documentLoads.filter((path) => path === "/de/docs");
    expect(countedByReporter.length + documentLoadsOfDe.length).toBe(1);
    expect(reports.filter(({ e }) => e === "pageview")).toHaveLength(countedByReporter.length);
  });
});
