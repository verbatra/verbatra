import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";
import { MACHINE_PROVIDER_IDS } from "./landing-facts";
import { featureReleaseBadge, providerReleaseBadge, RELEASE_BADGE } from "./release-badge";

describe("release badge", () => {
  it("dates exactly the providers it names, all with the one release version", () => {
    const badged = MACHINE_PROVIDER_IDS.filter((id) => providerReleaseBadge(id) !== null);
    expect(badged).toEqual([...RELEASE_BADGE.providers]);
    for (const id of badged) expect(providerReleaseBadge(id)).toBe(RELEASE_BADGE.version);
  });

  it("names a semantic version", () => {
    expect(RELEASE_BADGE.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

function providersPage(locale: string): string {
  const suffix = locale === i18n.defaultLanguage ? "" : `.${locale}`;
  const url = new URL(`../content/docs/(configure)/providers${suffix}.mdx`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

function headingBadges(page: string): ReadonlyMap<string, string | null> {
  const badges = new Map<string, string | null>();
  for (const section of page.split(/^## /m).slice(1)) {
    const intro = section.split(/^### /m)[0] ?? "";
    const id = /\bid: "([a-z-]+)"/.exec(intro)?.[1];
    if (id === undefined) continue;
    const firstLine = section
      .split("\n")
      .slice(1)
      .find((line) => line.trim() !== "");
    const badge = /^<AvailableFrom version="([^"]+)" \/>$/.exec(firstLine?.trim() ?? "");
    badges.set(id, badge?.[1] ?? null);
  }
  return badges;
}

describe("release badge against the providers page", () => {
  it.each(i18n.languages)(
    "matches the version badge under each machine provider's heading in providers (%s)",
    (locale) => {
      const badges = headingBadges(providersPage(locale));
      for (const id of MACHINE_PROVIDER_IDS) expect(badges.has(id), id).toBe(true);
      const dated = MACHINE_PROVIDER_IDS.filter((id) => badges.get(id) === RELEASE_BADGE.version);
      expect(dated).toEqual([...RELEASE_BADGE.providers]);
    },
  );

  it("reads only the badge directly under a heading, not one later in the section", () => {
    const page = '## DeepL\n\n```ts\nid: "deepl"\n```\n\n<AvailableFrom version="0.12.0" />\n';
    expect(headingBadges(page).get("deepl")).toBeNull();
  });
});

function humanOnlyPage(locale: string): string {
  const suffix = locale === i18n.defaultLanguage ? "" : `.${locale}`;
  const url = new URL(`../content/docs/(guides)/human-only-workflow${suffix}.mdx`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

describe("release badge against the human-only workflow page", () => {
  it.each(i18n.languages)(
    "dates the none provider with the page badge of human-only-workflow (%s)",
    (locale) => {
      const body = humanOnlyPage(locale).split(/^---$/m)[2] ?? "";
      const firstLine = body.split("\n").find((line) => line.trim() !== "");
      const badge = /^<AvailableFrom version="([^"]+)" \/>$/.exec(firstLine?.trim() ?? "")?.[1];
      expect(featureReleaseBadge("provider-none")).toBe(badge ?? null);
    },
  );
});
