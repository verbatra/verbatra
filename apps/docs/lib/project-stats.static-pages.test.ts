import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = join(import.meta.dirname, "..");
const STATS_ROUTE = "app/api/stats/route.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(join(appRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

const files = ["app", "components", "lib"].flatMap(sourceFiles);

function read(path: string): string {
  return readFileSync(join(appRoot, path), "utf8");
}

describe("the project stats keep every page static", () => {
  const readers = files.filter(
    (path) => path !== STATS_ROUTE && read(path).includes("@/lib/project-stats"),
  );

  it("finds the page code that reads the stats", () => {
    expect(readers.map((path) => relative(".", path))).toEqual(
      expect.arrayContaining(["components/static-site-header.tsx", "lib/locale-home-layout.tsx"]),
    );
  });

  it.each(readers)("%s never asks the stats fetch to revalidate", (path) => {
    const source = read(path);
    expect(source).not.toMatch(/revalidate|"hourly"|fetchProjectStats|fetchGitHubStars/);
  });

  it("leaves hourly revalidation to the same-origin stats route alone", () => {
    const hourly = files.filter((path) => read(path).includes('caching: "hourly"'));
    expect(hourly).toEqual([STATS_ROUTE]);
  });

  it("no page or layout under app/[lang] exports a revalidate interval", () => {
    const segments = files.filter(
      (path) => path.startsWith(join("app", "[lang]")) && /\/(page|layout)\.tsx$/.test(path),
    );
    expect(segments.length).toBeGreaterThan(0);
    for (const path of segments) expect(read(path)).not.toMatch(/export const revalidate/);
  });
});
