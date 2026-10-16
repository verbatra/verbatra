import { describe, expect, it } from "vitest";
import { localeSwitchHref } from "./locale-switch";

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
