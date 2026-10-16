import { expect, test } from "playwright/test";
import { homeUrl, LEGAL_PAGES, LOCALES, pageUrl } from "./support";

const SITE = "https://verbatra.kreitz-webdev.de";

type SitemapEntry = {
  readonly loc: string;
  readonly lastmod: string;
  readonly hreflangs: string[];
};

function entries(xml: string): SitemapEntry[] {
  return Array.from(xml.matchAll(/<url>([\s\S]*?)<\/url>/g), ([, body = ""]) => ({
    loc: /<loc>([^<]+)<\/loc>/.exec(body)?.[1] ?? "",
    lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(body)?.[1] ?? "",
    hreflangs: Array.from(body.matchAll(/hreflang="([^"]+)"/g), ([, lang = ""]) => lang),
  }));
}

async function dateModified(request: import("playwright/test").APIRequestContext, url: string) {
  const html = await (await request.get(url)).text();
  const dates = Array.from(
    html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    ([, json = "{}"]) => (JSON.parse(json) as { dateModified?: string }).dateModified,
  ).filter((date): date is string => date !== undefined);
  expect(dates, url).toHaveLength(1);
  return dates[0];
}

test("lists the landing, comparison and legal pages in every locale, with all hreflangs", async ({
  request,
}) => {
  const sitemap = entries(await (await request.get("/sitemap.xml")).text());
  for (const locale of LOCALES) {
    for (const url of [
      homeUrl(locale),
      ...["/compare", ...LEGAL_PAGES].map((path) => pageUrl(locale, path)),
    ]) {
      const absolute = url === "/" ? `${SITE}/` : `${SITE}${url}`;
      const entry = sitemap.find((candidate) => candidate.loc === absolute);
      expect(entry, absolute).toBeDefined();
      expect(entry?.hreflangs.sort()).toEqual([...LOCALES].sort());
    }
  }
});

for (const locale of LOCALES) {
  for (const path of ["/", "/compare"]) {
    const url = path === "/" ? homeUrl(locale) : pageUrl(locale, path);
    test(`dates ${url} the same in the sitemap and its JSON-LD`, async ({ request }) => {
      const sitemap = entries(await (await request.get("/sitemap.xml")).text());
      const absolute = url === "/" ? `${SITE}/` : `${SITE}${url}`;
      const lastmod = sitemap.find((entry) => entry.loc === absolute)?.lastmod;
      expect(lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(await dateModified(request, url)).toBe(lastmod);
    });
  }
}
