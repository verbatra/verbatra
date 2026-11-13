import { describe, expect, it } from "vitest";
import { carriedSearch, localeSwitchHref } from "./locale-switch";

describe("localeSwitchHref", () => {
  it.each([
    ["/", "en", "/"],
    ["/", "de", "/de"],
    ["/en", "fr", "/fr"],
    ["/de", "en", "/"],
    ["/de/", "es", "/es"],
    ["/compare", "de", "/de/compare"],
    ["/fr/compare", "en", "/compare"],
    ["/es/docs/cli/check", "fr", "/fr/docs/cli/check"],
    ["/docs/providers/", "de", "/de/docs/providers"],
    ["/de/privacy", "de", "/de/privacy"],
  ] as const)("maps %s to %s as %s", (pathname, locale, href) => {
    expect(localeSwitchHref(pathname, locale)).toBe(href);
  });

  it("keeps a first segment that is not a locale", () => {
    expect(localeSwitchHref("/denmark", "fr")).toBe("/fr/denmark");
  });
});

describe("carriedSearch", () => {
  it.each([
    ["/compare", "?tool=tolgee", "?tool=tolgee"],
    ["/de/compare", "?x=1&tool=weblate&y=2", "?tool=weblate"],
    ["/fr/compare/", "?tool=a%20b", "?tool=a+b"],
    ["/compare", "?x=1", ""],
    ["/compare", "", ""],
    ["/docs/cli", "?tool=tolgee", ""],
    ["/", "?tool=tolgee", ""],
  ] as const)("keeps %s with %s as %j", (pathname, search, kept) => {
    expect(carriedSearch(pathname, search)).toBe(kept);
  });
});
