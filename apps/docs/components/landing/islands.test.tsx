import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function imports(path: string): string[] {
  return Array.from(
    source(path).matchAll(/^import (?!type )[^;]*? from "([^"]+)";/gms),
    (match) => match[1] ?? "",
  );
}

const ISLAND_MODULES = [
  "./command-panel",
  "./hero-diff-motion",
  "./code-showcase-tabs",
  "./marquee-motion",
  "./playground-demo",
  "./flow-motion",
  "./try-it",
  "./live-stat-value",
  "./faq-accordion",
  "@/components/landing/command-panel",
  "@/components/landing/live-stat-value",
  "@/components/command-row",
  "@/components/ui/copy-button",
  "@/components/ui/shadcn/accordion",
];

const landingServerModules = readdirSync(join(ROOT, "components/landing"))
  .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
  .map((name) => `components/landing/${name}`)
  .filter((path) => !source(path).startsWith('"use client"'));

describe("the landing first load", () => {
  it.each(landingServerModules)(
    "%s reaches its client islands through the islands module, so their code loads after hydration starts",
    (path) => {
      expect(imports(path).filter((specifier) => ISLAND_MODULES.includes(specifier))).toEqual([]);
    },
  );

  it("loads the header controls with their popover, dialog and intl code on demand", () => {
    const header = imports("components/site-header.tsx");
    for (const eager of [
      "@/components/language-select",
      "@/components/theme-toggle",
      "@/components/version-pill",
      "@/components/home-mobile-menu",
      "fumadocs-ui/layouts/home",
      "fumadocs-ui/layouts/shared",
    ]) {
      expect(header).not.toContain(eager);
    }
    expect(imports("components/home-nav.tsx")).not.toContain("@/components/ui/shadcn/sheet");
  });

  it.each([
    "app/[lang]/layout.tsx",
    "app/[lang]/(home)/layout.tsx",
    "components/landing-providers.tsx",
    "lib/locale-home-layout.tsx",
  ])("keeps next-intl's client provider and the docs layout options out of %s", (path) => {
    const specifiers = imports(path);
    expect(specifiers).not.toContain("next-intl");
    expect(specifiers).not.toContain("@/lib/layout.shared");
    expect(specifiers).not.toContain("@/components/site-providers");
  });
});

const REGISTRIES = ["components/landing/islands.tsx", "components/chrome-islands.tsx"];

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? join(ROOT, dirname(from), specifier)
      : null;
  if (base === null) return null;
  const found = [".tsx", ".ts"].map((extension) => `${base}${extension}`).find(existsSync);
  return found ? relative(ROOT, found) : null;
}

function usesTranslations(path: string, seen = new Set<string>()): boolean {
  if (seen.has(path)) return false;
  seen.add(path);
  if (/\buseTranslations\(/.test(source(path))) return true;
  return imports(path).some((specifier) => {
    const local = resolveLocal(path, specifier);
    return local !== null && usesTranslations(local, seen);
  });
}

const registered = REGISTRIES.flatMap((registry) =>
  Array.from(
    source(registry).matchAll(
      /export const (\w+) = (intlIsland|island)\(\s*\(\) =>\s*import\("([^"]+)"\)/g,
    ),
    ([, name, kind, specifier]) => ({
      name: name ?? "",
      intl: kind === "intlIsland",
      module: resolveLocal(registry, specifier ?? "") ?? "",
    }),
  ),
);

describe("islands that translate", () => {
  it("finds every registered island and its module", () => {
    expect(registered.length).toBeGreaterThanOrEqual(14);
    for (const entry of registered) expect(entry.module).not.toBe("");
  });

  it.each(registered.filter((entry) => !entry.intl))(
    "$name is a plain island, so neither it nor anything it imports calls useTranslations",
    ({ module }) => {
      expect(usesTranslations(module)).toBe(false);
    },
  );

  it.each(registered.filter((entry) => entry.intl))(
    "$name is an intl island because its module tree calls useTranslations",
    ({ module }) => {
      expect(usesTranslations(module)).toBe(true);
    },
  );
});
