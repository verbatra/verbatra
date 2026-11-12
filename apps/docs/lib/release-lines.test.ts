import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readIncludedSource } from "./docs-pages";
import generated from "./release-lines.generated.json";
import {
  badgeNewerThanLine,
  changelogVersions,
  compareLines,
  lineOf,
  nextLine,
  PACKAGE_LINE,
  type PackageReleases,
  packageReleases,
  placeableLines,
  placeBadge,
  type ReleaseLines,
  releaseLines,
  VERSION_PACKAGES,
  versionPillCss,
} from "./release-lines.mjs";

const PACKAGES_DIR = join(import.meta.dirname, "../../../packages");
const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
const GENERATED_CSS = join(import.meta.dirname, "../app/version-pills.generated.css");
const BADGE = /<AvailableFrom\s+version="([^"]+)"(?:\s+pkg="([^"]+)")?\s*\/>/g;

const CHANGELOG = `# @verbatra/mcp

## 0.4.4

### Patch Changes

- Updated dependencies

## 0.5.0-next.1

## 0.4.0

## 0.3.1

## 0.3.0

## 0.0.1-next.0
`;

const RELEASES: ReleaseLines = {
  cli: { lines: ["0.13", "0.12", "0.11"] },
  studio: { lines: ["0.7", "0.6", "0.5"] },
  mcp: { lines: ["0.4", "0.3", "0.2"] },
};

describe("changelog release lines", () => {
  it("reads stable headings only, so a prerelease never invents a line", () => {
    expect(changelogVersions(CHANGELOG)).toEqual(["0.4.4", "0.4.0", "0.3.1", "0.3.0"]);
    expect(packageReleases(CHANGELOG)).toEqual({ lines: ["0.4", "0.3"] });
  });

  it("collapses patches into minor lines, newest first, with numeric ordering", () => {
    expect(releaseLines(["0.9.3", "0.10.0", "0.9.0", "0.2.1"])).toEqual(["0.10", "0.9", "0.2"]);
    expect(lineOf("0.13.4")).toBe("0.13");
    expect(compareLines("0.10", "0.9")).toBeGreaterThan(0);
  });

  it("refuses a changelog with no stable heading", () => {
    expect(() => packageReleases("## 0.1.0-next.1\n")).toThrow(/no stable release/);
  });

  it("adds the next unreleased line, which a badge may already name", () => {
    expect(nextLine("0.13")).toBe("0.14");
    expect(nextLine("1.4")).toBe("2.0");
    expect(placeableLines({ lines: ["0.13", "0.12"] })).toEqual(["0.14", "0.13", "0.12"]);
  });
});

describe("the comparison rule", () => {
  it("shows a badge only when its version is above the first release of the picked line", () => {
    expect(badgeNewerThanLine("0.12.0", "0.12")).toBe(false);
    expect(badgeNewerThanLine("0.11.0", "0.12")).toBe(false);
    expect(badgeNewerThanLine("0.9.0", "0.12")).toBe(false);
    expect(badgeNewerThanLine("0.13.0", "0.12")).toBe(true);
    expect(badgeNewerThanLine("0.10.0", "0.9")).toBe(true);
  });

  it("treats a patch badge as newer than a reader on the same minor line", () => {
    expect(badgeNewerThanLine("0.5.1", "0.5")).toBe(true);
    expect(badgeNewerThanLine("0.5.1", "0.6")).toBe(false);
    expect(badgeNewerThanLine("0.2.1", "0.2")).toBe(true);
    expect(badgeNewerThanLine("0.5.0", "0.5")).toBe(false);
  });
});

describe("placeBadge", () => {
  it("places a badge on its package line, the sdk and an absent pkg on the cli line", () => {
    expect(placeBadge(undefined, "0.12.0", RELEASES)).toEqual({
      package: "cli",
      line: "0.12",
      patch: 0,
    });
    expect(placeBadge("@verbatra/sdk", "0.13.2", RELEASES)).toEqual({
      package: "cli",
      line: "0.13",
      patch: 2,
    });
    expect(placeBadge("@verbatra/studio", "0.6.0", RELEASES)?.package).toBe("studio");
    expect(placeBadge("@verbatra/mcp", "0.4.0", RELEASES)?.package).toBe("mcp");
  });

  it("places a badge on the next unreleased line", () => {
    expect(placeBadge(undefined, "0.14.0", RELEASES)?.line).toBe("0.14");
  });

  it("cannot place an unknown package, a line the package never had or a malformed version", () => {
    expect(placeBadge("@verbatra/core", "0.12.0", RELEASES)).toBeUndefined();
    expect(placeBadge("@verbatra/mcp", "0.9.0", RELEASES)).toBeUndefined();
    expect(placeBadge(undefined, "0.12", RELEASES)).toBeUndefined();
    expect(placeBadge(undefined, "0.20.0", RELEASES)).toBeUndefined();
  });
});

function parseRules(css: string): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? "").trim(),
    body: (match[2] ?? "").trim(),
  }));
}

function revealedBadges(releases: PackageReleases, pkg: string, picked: string, css: string) {
  const root = `html[data-vk-${pkg}="${picked}"] .vk-available-from[data-vk-pkg="${pkg}"]:is(`;
  const rule = parseRules(css).find(({ selector }) => selector.startsWith(root));
  if (rule === undefined) throw new Error(`no rule for ${pkg} ${picked}`);
  const selectors = rule.selector.slice(root.length, -1).split(", ");
  return selectors.map((selector) => ({
    line: /data-vk-line="([^"]+)"/.exec(selector)?.[1] ?? "",
    patchOnly: selector.includes("[data-vk-patch]"),
    releases,
  }));
}

describe("the generated stylesheet", () => {
  const css = versionPillCss(RELEASES);

  it("hides every pill that carries a version and the page notice by default", () => {
    expect(css).toMatch(
      /^\.vk-available-from\[data-vk-since\],\n\.vk-version-notice \{\n {2}display: none;/,
    );
  });

  it("holds one reveal rule per package and picked line", () => {
    const rules = parseRules(css).filter(({ selector }) => selector.startsWith("html["));
    const pills = rules.filter(({ body }) => body === "display: inline-flex;");
    const total = VERSION_PACKAGES.reduce((sum, pkg) => sum + RELEASES[pkg].lines.length, 0);
    expect(pills).toHaveLength(total);
  });

  it("never reveals a badge at or below the picked line", () => {
    for (const pkg of VERSION_PACKAGES) {
      for (const picked of RELEASES[pkg].lines) {
        for (const { line, patchOnly } of revealedBadges(RELEASES[pkg], pkg, picked, css)) {
          if (patchOnly) expect(line).toBe(picked);
          else expect(compareLines(line, picked)).toBeGreaterThan(0);
        }
      }
    }
  });

  it("reveals every placeable badge above the picked line, and only the patch releases of the line itself", () => {
    for (const pkg of VERSION_PACKAGES) {
      for (const picked of RELEASES[pkg].lines) {
        const revealed = revealedBadges(RELEASES[pkg], pkg, picked, css);
        const whole = revealed.filter(({ patchOnly }) => !patchOnly).map(({ line }) => line);
        const expected = placeableLines(RELEASES[pkg]).filter(
          (line) => compareLines(line, picked) > 0,
        );
        expect(whole).toEqual(expected);
        expect(revealed.filter(({ patchOnly }) => patchOnly)).toHaveLength(1);
      }
    }
  });

  it("reveals the page notice by the same selectors, scoped to the docs page", () => {
    const notice = parseRules(css).find(({ body }) => body === "display: block;");
    const selectors = (notice?.selector ?? "").split(",\n");
    const total = VERSION_PACKAGES.reduce((sum, pkg) => sum + RELEASES[pkg].lines.length, 0);
    expect(selectors).toHaveLength(total);
    for (const selector of selectors) {
      expect(selector).toMatch(/^html\[data-vk-(cli|studio|mcp)="[\d.]+"\] #nd-page:has\(/);
      expect(selector.endsWith(") .vk-version-notice")).toBe(true);
    }
  });

  it("injects nothing at runtime: a plain stylesheet with no em dash", () => {
    expect(css).not.toContain("\u2014");
    expect(css).not.toContain("@import");
  });
});

describe("generated release data", () => {
  it("equals what the package changelogs say, so a release without a sync fails here", () => {
    const fresh = Object.fromEntries(
      VERSION_PACKAGES.map((pkg) => [
        pkg,
        packageReleases(readFileSync(join(PACKAGES_DIR, pkg, "CHANGELOG.md"), "utf8")),
      ]),
    );
    expect(generated).toEqual(fresh);
  });

  it("keeps app/version-pills.generated.css in step with the data", () => {
    expect(readFileSync(GENERATED_CSS, "utf8")).toBe(versionPillCss(generated));
  });

  it("covers the latest release of every package", () => {
    for (const pkg of VERSION_PACKAGES) {
      const manifest = JSON.parse(readFileSync(join(PACKAGES_DIR, pkg, "package.json"), "utf8"));
      expect(generated[pkg].lines, pkg).toContain(lineOf(manifest.version));
    }
  });
});

describe("every MDX badge", () => {
  const badges = readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".mdx"))
    .flatMap((file) =>
      [...readIncludedSource(join(CONTENT_DIR, file)).matchAll(BADGE)].map((match) => ({
        file,
        version: match[1] ?? "",
        pkg: match[2],
      })),
    );

  it("finds the badges", () => {
    expect(badges.length).toBeGreaterThan(1000);
  });

  it("names a package and a version the generated data can place, so no pill stays hidden for good", () => {
    const unplaced = badges.filter(
      ({ pkg, version }) => placeBadge(pkg, version, generated) === undefined,
    );
    expect(unplaced).toEqual([]);
  });

  it("only names packages the picker knows", () => {
    const packages = new Set(badges.map(({ pkg }) => pkg).filter((pkg) => pkg !== undefined));
    for (const pkg of packages) expect(Object.keys(PACKAGE_LINE)).toContain(pkg);
  });
});
