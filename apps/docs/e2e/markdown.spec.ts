import { expect, test } from "playwright/test";
import { homeUrl, LEGAL_PAGES, LOCALES, pageUrl } from "./support";

const SITE = "https://verbatra.kreitz-webdev.de";

const PAGES = ["/", "/compare", ...LEGAL_PAGES] as const;

function htmlUrl(locale: (typeof LOCALES)[number], path: string): string {
  return path === "/" ? homeUrl(locale) : pageUrl(locale, path);
}

function markdownUrl(url: string): string {
  return url === "/"
    ? "/index.md"
    : LOCALES.some((locale) => url === `/${locale}`)
      ? `${url}/index.md`
      : `${url}.md`;
}

const MARKDOWN_URLS = LOCALES.flatMap((locale) =>
  PAGES.map((path) => markdownUrl(htmlUrl(locale, path))),
);

for (const url of MARKDOWN_URLS) {
  test(`serves ${url} as markdown with its canonical page`, async ({ request }) => {
    const response = await request.get(url, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/markdown");
    expect(response.headers().link).toMatch(new RegExp(`^<${SITE}/[^>]*>; rel="canonical"$`));
    expect(await response.text()).toMatch(/^---\ntitle: /);
  });
}

for (const locale of LOCALES) {
  for (const path of PAGES) {
    const url = htmlUrl(locale, path);

    test(`negotiates markdown on ${url} and links it from the html head`, async ({
      request,
      page,
    }) => {
      const negotiated = await request.get(url, { headers: { accept: "text/markdown" } });
      expect(negotiated.status()).toBe(200);
      expect(negotiated.headers()["content-type"]).toContain("text/markdown");
      expect(negotiated.headers().vary).toContain("Accept");
      const html = await request.get(url, { headers: { accept: "text/html" } });
      expect(html.headers()["content-type"]).toContain("text/html");
      expect(html.headers().vary).toContain("Accept");
      await page.goto(url);
      await expect(
        page.locator('head link[rel="alternate"][type="text/markdown"]'),
      ).toHaveAttribute("href", `${SITE}${markdownUrl(url)}`);
    });
  }
}

test("carries every heading of the landing page into its markdown", async ({ page, request }) => {
  await page.goto("/");
  const headings = await page
    .locator("main h1, main h2:not(.sr-only), main h3, main h4")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => node.closest(".vk-island") === null)
        .map((node) => (node.textContent ?? "").trim()),
    );
  const markdown = await (await request.get("/index.md")).text();
  expect(headings.length).toBeGreaterThan(10);
  for (const heading of headings) expect(markdown, heading).toContain(heading);
});

for (const [from, to] of [
  ["/docs/quickstart.mdx", "/docs/quickstart.md"],
  ["/compare.mdx", "/compare.md"],
  ["/de/compare.mdx", "/de/compare.md"],
  ["/index.mdx", "/index.md"],
  ["/docs.mdx/formats", "/docs/formats.md"],
  ["/fr/docs.mdx/providers", "/fr/docs/providers.md"],
  ["/site.mdx/privacy", "/privacy.md"],
  ["/es/site.mdx/index", "/es/index.md"],
] as const) {
  test(`redirects ${from} to ${to} and serves it`, async ({ request }) => {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers().location ?? "", "http://localhost").pathname).toBe(to);
    const followed = await request.get(from);
    expect(followed.status()).toBe(200);
    expect(followed.headers()["content-type"]).toContain("text/markdown");
  });
}

test("ends an .mdx url without a page behind it in a 404", async ({ request }) => {
  expect((await request.get("/docs/no-such-page.mdx")).status()).toBe(404);
  expect((await request.get("/no-such-page.mdx", { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get("/xx/site.mdx/index", { maxRedirects: 0 })).status()).toBe(404);
});

test("lists every site markdown url in llms.txt, and each one it links answers 200", async ({
  request,
}) => {
  const llms = await (await request.get("/llms.txt")).text();
  for (const url of MARKDOWN_URLS) expect(llms, url).toContain(`(${SITE}${url})`);
  const linked = Array.from(
    llms.matchAll(new RegExp(`\\(${SITE.replaceAll(".", "\\.")}(/[^)\\s]*\\.md)\\)`, "g")),
    (match) => match[1] ?? "",
  );
  expect(linked.length).toBeGreaterThan(MARKDOWN_URLS.length);
  for (const path of new Set(linked)) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("text/markdown");
  }
});

test("puts the landing and the comparison before the docs in llms-full.txt", async ({
  request,
}) => {
  const full = await (await request.get("/llms-full.txt")).text();
  const landing = await (await request.get("/index.md")).text();
  const compare = await (await request.get("/compare.md")).text();
  const headline = landing.split("\n").find((line) => line.startsWith("# ")) ?? "missing";
  const heading = compare.split("\n").find((line) => line.startsWith("# ")) ?? "missing";
  expect(full.indexOf(headline)).toBeGreaterThan(0);
  expect(full.indexOf(heading)).toBeGreaterThan(full.indexOf(headline));
  expect(full.indexOf("/docs/quickstart)")).toBeGreaterThan(full.indexOf(heading));
  for (const retired of [
    "Verbatra in numbers",
    "Locale files drift every time you ship.",
    "Use it from the terminal or from your own code.",
    "Review every locale in Verbatra Studio.",
  ]) {
    expect(full).not.toContain(retired);
  }
});
