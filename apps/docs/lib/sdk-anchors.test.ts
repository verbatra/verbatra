import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableOfContents } from "fumadocs-core/content/toc";
import { describe, expect, it } from "vitest";
import { i18n, type Locale, localizedPath } from "@/lib/i18n";
import {
  entryHeadings,
  forwardedUrl,
  isIdentifier,
  type SdkReferencePage,
  sdkAnchorTargets,
  tocHeading,
} from "@/lib/sdk-anchors";
import LEGACY_ANCHORS from "@/lib/sdk-legacy-anchors.json";

const SDK_DIR = join(import.meta.dirname, "../content/docs/sdk");
const PAGE_NAMES = (
  JSON.parse(readFileSync(join(SDK_DIR, "meta.json"), "utf8")) as { pages: string[] }
).pages;

function readPage(name: string, locale: Locale): string {
  const suffix = locale === i18n.defaultLanguage ? "" : `.${locale}`;
  return readFileSync(join(SDK_DIR, `${name}${suffix}.mdx`), "utf8").replace(
    /^---\n[\s\S]*?\n---\n/,
    "",
  );
}

function referencePage(name: string, locale: Locale): SdkReferencePage {
  const path = name === "index" ? "/docs/sdk" : `/docs/sdk/${name}`;
  return {
    url: localizedPath(locale, path),
    title: name,
    headings: getTableOfContents(readPage(name, locale)).map(tocHeading),
  };
}

function folder(locale: Locale): { index: SdkReferencePage; pages: SdkReferencePage[] } {
  const [indexName = "index", ...rest] = PAGE_NAMES;
  return {
    index: referencePage(indexName, locale),
    pages: rest.map((name) => referencePage(name, locale)),
  };
}

function anchorsOf(page: SdkReferencePage): Set<string> {
  return new Set(page.headings.map((heading) => heading.anchor));
}

describe("the SDK anchor forward", () => {
  const targets = { translate: "/docs/sdk/run", "übersetzungen-ausführen": "/de/docs/sdk/run" };
  const nowhere = () => false;

  it("forwards an anchor that moved to another page, keeping the hash", () => {
    expect(forwardedUrl("#translate", targets, nowhere)).toBe("/docs/sdk/run#translate");
  });

  it("decodes a percent-encoded localized anchor before the lookup", () => {
    expect(forwardedUrl("#%C3%BCbersetzungen-ausf%C3%BChren", targets, nowhere)).toBe(
      "/de/docs/sdk/run#übersetzungen-ausführen",
    );
  });

  it("leaves an empty hash, an anchor still on the page, and an unknown anchor alone", () => {
    expect(forwardedUrl("", targets, nowhere)).toBeUndefined();
    expect(forwardedUrl("#translate", targets, (anchor) => anchor === "translate")).toBeUndefined();
    expect(forwardedUrl("#nothing-here", targets, nowhere)).toBeUndefined();
    expect(forwardedUrl("#%E0%A4%A", targets, nowhere)).toBeUndefined();
  });

  it("maps an anchor to the first page that heads it", () => {
    const first = { url: "/a", title: "a", headings: [{ anchor: "x", title: "x", depth: 3 }] };
    const second = { url: "/b", title: "b", headings: [{ anchor: "x", title: "x", depth: 3 }] };

    expect(sdkAnchorTargets([first, second])).toEqual({ x: "/a" });
  });
});

describe.each(i18n.languages)("the %s SDK reference folder", (locale) => {
  const { index, pages } = folder(locale);
  const targets = sdkAnchorTargets(pages);
  const onIndex = anchorsOf(index);

  it("reads the whole folder, so the checks cannot pass vacuously", () => {
    expect(pages).toHaveLength(8);
    expect(Object.keys(targets).length).toBeGreaterThanOrEqual(80);
  });

  it.each(LEGACY_ANCHORS[locale])("keeps the old /docs/sdk#%s link working", (anchor) => {
    const url = forwardedUrl(`#${encodeURIComponent(anchor)}`, targets, (id) => onIndex.has(id));
    if (url === undefined) {
      expect(onIndex.has(anchor)).toBe(true);
      return;
    }
    const page = pages.find((candidate) => url === `${candidate.url}#${anchor}`);
    expect(page && anchorsOf(page).has(anchor)).toBe(true);
  });

  it("heads every anchor on exactly one page of the folder", () => {
    const all = [index, ...pages].flatMap((page) => [...anchorsOf(page)]);

    expect(all.filter((anchor, position) => all.indexOf(anchor) !== position)).toEqual([]);
  });

  it.each(["errorhint", "projectrelativemessage"])(
    "forwards the old /docs/sdk/exchange#%s link to the errors page",
    (anchor) => {
      const exchange = pages.find((page) => page.url.endsWith("/sdk/exchange"));
      const errors = pages.find((page) => page.url.endsWith("/sdk/errors"));
      const source = readPage("exchange", locale);

      expect(source).toContain("<SdkAnchorForward />");
      expect(exchange && anchorsOf(exchange).has(anchor)).toBe(false);
      expect(
        forwardedUrl(
          `#${anchor}`,
          targets,
          (id) => exchange !== undefined && anchorsOf(exchange).has(id),
        ),
      ).toBe(`${errors?.url}#${anchor}`);
    },
  );

  it("lists the same entries on each page as the English folder", () => {
    const english = folder(i18n.defaultLanguage).pages;

    expect(
      pages.map((page) =>
        entryHeadings(page)
          .map((heading) => heading.title)
          .filter(isIdentifier),
      ),
    ).toEqual(
      english.map((page) =>
        entryHeadings(page)
          .map((heading) => heading.title)
          .filter(isIdentifier),
      ),
    );
  });
});
