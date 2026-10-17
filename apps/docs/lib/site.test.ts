import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  homeAlternates,
  homePath,
  localeAlternates,
  NODE_RANGE,
  ogAlternateLocales,
  ogLocale,
  PACKAGE_VERSION,
  STUDIO_VERSION,
} from "./site";

function packageVersion(name: string): string {
  const path = fileURLToPath(new URL(`../../../packages/${name}/package.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")).version;
}

describe("PACKAGE_VERSION", () => {
  it("is a semver string", () => {
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("tracks the cli package, which is version-locked with the sdk", () => {
    expect(PACKAGE_VERSION).toBe(packageVersion("cli"));
    expect(PACKAGE_VERSION).toBe(packageVersion("sdk"));
  });
});

function engineRange(name: string): string {
  const path = fileURLToPath(new URL(`../../../packages/${name}/package.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")).engines.node;
}

describe("NODE_RANGE", () => {
  it("is the cli package's engines.node range, read at build time", () => {
    expect(NODE_RANGE).toBe(engineRange("cli"));
  });

  it.each(["sdk", "studio", "mcp"])(
    "matches the %s package, so one range can stand for every published package",
    (name) => {
      expect(engineRange(name)).toBe(NODE_RANGE);
    },
  );
});

describe("STUDIO_VERSION", () => {
  it("is a semver string", () => {
    expect(STUDIO_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("tracks the studio package, which versions independently of the cli", () => {
    expect(STUDIO_VERSION).toBe(packageVersion("studio"));
  });
});

describe("homePath", () => {
  it("leaves the site root unprefixed for the default locale", () => {
    expect(homePath("en")).toBe("/");
  });

  it("returns a bare locale segment with no trailing slash for a non-default locale", () => {
    expect(homePath("de")).toBe("/de");
    expect(homePath("es")).toBe("/es");
    expect(homePath("fr")).toBe("/fr");
  });
});

describe("homeAlternates", () => {
  it("points the canonical at the requested locale's own root", () => {
    expect(homeAlternates("en").canonical).toBe("/");
    expect(homeAlternates("de").canonical).toBe("/de");
  });

  it("emits one hreflang per configured locale plus x-default", () => {
    expect(homeAlternates("de").languages).toEqual({
      en: "/",
      de: "/de",
      es: "/es",
      fr: "/fr",
      "x-default": "/",
    });
  });

  it("keeps x-default on the default locale's root", () => {
    const { languages } = homeAlternates("fr");
    expect(languages["x-default"]).toBe("/");
    expect(languages["x-default"]).toBe(homePath("en"));
  });

  it("builds the same hreflang set no matter which locale asks for it", () => {
    expect(homeAlternates("en").languages).toEqual(homeAlternates("fr").languages);
  });
});

describe("localeAlternates", () => {
  it("points the canonical at the requested locale's copy of the path", () => {
    expect(localeAlternates("en", "/privacy").canonical).toBe("/privacy");
    expect(localeAlternates("de", "/privacy").canonical).toBe("/de/privacy");
  });

  it("emits one hreflang per configured locale plus x-default", () => {
    expect(localeAlternates("es", "/privacy").languages).toEqual({
      en: "/privacy",
      de: "/de/privacy",
      es: "/es/privacy",
      fr: "/fr/privacy",
      "x-default": "/privacy",
    });
  });

  it("keeps x-default on the default locale's copy of the path", () => {
    expect(localeAlternates("fr", "/imprint").languages["x-default"]).toBe("/imprint");
  });
});

describe("ogLocale", () => {
  it("maps every supported locale to a territory-qualified Open Graph locale", () => {
    expect(ogLocale("en")).toBe("en_US");
    expect(ogLocale("de")).toBe("de_DE");
    expect(ogLocale("es")).toBe("es_ES");
    expect(ogLocale("fr")).toBe("fr_FR");
  });
});

describe("ogAlternateLocales", () => {
  it("lists every other locale in the configured order", () => {
    expect(ogAlternateLocales("en")).toEqual(["de_DE", "es_ES", "fr_FR"]);
    expect(ogAlternateLocales("es")).toEqual(["en_US", "de_DE", "fr_FR"]);
  });
});
