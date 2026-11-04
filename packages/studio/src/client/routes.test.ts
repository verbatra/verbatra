import { describe, expect, it } from "vitest";
import {
  canonicalAliasHash,
  DEFAULT_PAGE,
  PAGE_IDS,
  pageHash,
  parsePageHash,
  parseRoute,
  routeHash,
  routeParams,
} from "./routes.js";

describe("parsePageHash", () => {
  it.each(PAGE_IDS)("parses the canonical #/%s form", (page) => {
    expect(parsePageHash(`#/${page}`)).toBe(page);
  });

  it.each(PAGE_IDS)("accepts the bare #%s form", (page) => {
    expect(parsePageHash(`#${page}`)).toBe(page);
  });

  it("falls back to the default workspace for an empty hash", () => {
    expect(parsePageHash("")).toBe(DEFAULT_PAGE);
    expect(parsePageHash("#")).toBe(DEFAULT_PAGE);
    expect(parsePageHash("#/")).toBe(DEFAULT_PAGE);
  });

  it("falls back to the default workspace for an unknown or stale hash", () => {
    expect(parsePageHash("#/diff")).toBe(DEFAULT_PAGE);
    expect(parsePageHash("#/status")).toBe(DEFAULT_PAGE);
    expect(parsePageHash("#/nonsense")).toBe(DEFAULT_PAGE);
  });

  it("treats names inherited from Object as unknown pages", () => {
    expect(parsePageHash("#/constructor")).toBe(DEFAULT_PAGE);
    expect(parsePageHash("#/__proto__")).toBe(DEFAULT_PAGE);
    expect(canonicalAliasHash("#/constructor")).toBeNull();
  });

  it("ignores the query string when naming the page", () => {
    expect(parsePageHash("#/review?locale=de")).toBe("review");
    expect(parsePageHash("#/nonsense?locale=de")).toBe(DEFAULT_PAGE);
  });
});

describe("page ids", () => {
  it("names the overview, translations, review, glossary and settings pages", () => {
    expect([...PAGE_IDS]).toEqual(["overview", "translations", "review", "glossary", "settings"]);
  });

  it("keeps the translations workspace as the default page", () => {
    expect(DEFAULT_PAGE).toBe("translations");
    expect(PAGE_IDS).toContain(DEFAULT_PAGE);
  });
});

describe("activity alias", () => {
  it.each(["#/activity", "#activity", "#/activity?locale=de"])(
    "resolves %s to overview",
    (hash) => {
      expect(parseRoute(hash).page).toBe("overview");
    },
  );

  it("names the canonical hash an alias should be rewritten to", () => {
    expect(canonicalAliasHash("#/activity")).toBe("#/overview");
    expect(canonicalAliasHash("#activity")).toBe("#/overview");
  });

  it("does not rewrite a canonical, unknown or empty hash", () => {
    expect(canonicalAliasHash("#/overview")).toBeNull();
    expect(canonicalAliasHash("#/translations?locale=de")).toBeNull();
    expect(canonicalAliasHash("#/nonsense")).toBeNull();
    expect(canonicalAliasHash("")).toBeNull();
  });
});

describe("parseRoute params", () => {
  it("reads locale, status filters and key from a translations deep link", () => {
    expect(parseRoute("#/translations?locale=de&status=missing&key=a.b")).toEqual({
      page: "translations",
      params: { locale: "de", statuses: ["missing"], key: "a.b" },
    });
  });

  it("reads repeated and comma separated status values in filter order", () => {
    const expected = ["missing", "changed"];
    expect(parseRoute("#/translations?status=changed&status=missing").params.statuses).toEqual(
      expected,
    );
    expect(parseRoute("#/translations?status=changed,missing").params.statuses).toEqual(expected);
  });

  it("reads the locale of a review deep link", () => {
    expect(parseRoute("#/review?locale=de")).toEqual({
      page: "review",
      params: { locale: "de" },
    });
  });

  it("decodes percent encoded keys", () => {
    expect(parseRoute("#/translations?key=nav%20bar%2Ftitle").params.key).toBe("nav bar/title");
  });

  it("ignores unknown status values and keeps the valid ones", () => {
    expect(parseRoute("#/translations?status=bogus,missing,").params.statuses).toEqual(["missing"]);
    expect(parseRoute("#/translations?status=bogus").params).toEqual({});
  });

  it("ignores empty values and unknown parameters", () => {
    expect(parseRoute("#/translations?locale=&key=&other=1&status=").params).toEqual({});
  });

  it("ignores parameters a page does not take", () => {
    expect(parseRoute("#/review?status=missing&key=a").params).toEqual({});
    expect(parseRoute("#/settings?locale=de").params).toEqual({});
    expect(parseRoute("#/overview?locale=de").params).toEqual({});
    expect(parseRoute("#/glossary?key=a").params).toEqual({});
  });

  it("does not throw on malformed input", () => {
    for (const hash of ["#/translations?", "#/translations?%", "#/translations?=&&=", "#?x", "?"]) {
      expect(() => parseRoute(hash)).not.toThrow();
    }
    expect(parseRoute("#/translations?%E0%A4%A").page).toBe("translations");
  });
});

describe("routeParams", () => {
  it("drops empty and missing fields", () => {
    expect(routeParams({ locale: "", key: null, statuses: [] })).toEqual({});
    expect(routeParams({})).toEqual({});
  });

  it("orders statuses by the filter order and removes duplicates", () => {
    expect(routeParams({ statuses: new Set(["review", "missing", "changed"]) }).statuses).toEqual([
      "missing",
      "changed",
      "review",
    ]);
  });
});

describe("routeHash", () => {
  it.each(PAGE_IDS)("writes the bare canonical form for %s", (page) => {
    expect(routeHash({ page, params: {} })).toBe(`#/${page}`);
    expect(pageHash(page)).toBe(`#/${page}`);
  });

  it("writes translations params and round-trips them", () => {
    const route = {
      page: "translations",
      params: { locale: "de", statuses: ["missing", "changed"], key: "nav bar/title" },
    } as const;
    expect(routeHash(route)).toBe(
      "#/translations?locale=de&status=missing&status=changed&key=nav+bar%2Ftitle",
    );
    expect(parseRoute(routeHash(route))).toEqual(route);
  });

  it("writes review locale and round-trips it", () => {
    const route = { page: "review", params: { locale: "pt-BR" } } as const;
    expect(routeHash(route)).toBe("#/review?locale=pt-BR");
    expect(parseRoute(routeHash(route))).toEqual(route);
  });

  it("omits params a page does not take", () => {
    expect(routeHash({ page: "settings", params: { locale: "de", key: "a" } })).toBe("#/settings");
    expect(routeHash({ page: "review", params: { locale: "de", key: "a" } })).toBe(
      "#/review?locale=de",
    );
  });
});
