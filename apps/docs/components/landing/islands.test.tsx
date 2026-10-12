import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
  "./hero-terminal",
  "./code-showcase-tabs",
  "./format-switch",
  "./try-it",
  "./live-stat-value",
  "./faq-accordion",
  "@/components/landing/command-panel",
  "@/components/landing/hero-terminal",
  "@/components/landing/live-stat-value",
  "@/components/studio-screenshot",
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
