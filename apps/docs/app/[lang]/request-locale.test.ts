import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const LANG_ROOT = join(process.cwd(), "app/[lang]");

function routeModules(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeModules(path);
    return name === "layout.tsx" || name === "page.tsx" ? [path] : [];
  });
}

const modules = routeModules(LANG_ROOT).map((path) => relative(process.cwd(), path));

describe("the request locale", () => {
  it("finds the localized layouts and pages", () => {
    expect(modules.length).toBeGreaterThanOrEqual(8);
  });

  it.each(modules)(
    "%s sets it itself, since layouts and pages render in parallel and none may rely on another",
    (path) => {
      expect(readFileSync(path, "utf8")).toMatch(/setRequestLocale\(\w+\);/);
    },
  );

  it("hands the client provider its time zone explicitly instead of reading the request", () => {
    const source = readFileSync("components/site-providers.tsx", "utf8");
    expect(source).toMatch(/<NextIntlClientProvider[^>]*timeZone=\{timeZone\}/);
  });
});
