import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
const css = read("./fonts.css");

const FILES = [
  "geist-latin-wght-normal.woff2",
  "geist-latin-ext-wght-normal.woff2",
  "geist-mono-latin-wght-normal.woff2",
  "geist-mono-latin-ext-wght-normal.woff2",
];

describe("fonts.css", () => {
  it.each(FILES)("references the bundled file %s", (file) => {
    expect(css).toContain(`url("./fonts/${file}")`);
    const path = new URL(`./fonts/${file}`, import.meta.url);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(1000);
  });

  it("references nothing but its own bundled woff2 files", () => {
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1]);
    expect(urls.length).toBe(FILES.length);
    for (const url of urls) {
      expect(url).toMatch(/^"\.\/fonts\/[\w-]+\.woff2"$/);
    }
  });

  it("swaps the fallback in while a face loads", () => {
    const faces = css.match(/@font-face/g)?.length ?? 0;
    expect(css.match(/font-display: swap/g)?.length).toBe(faces);
  });

  it("feeds the font variables the tokens read, each with a system fallback", () => {
    expect(css).toMatch(/--font-geist-sans: "Geist Variable", [^;]*sans-serif;/);
    expect(css).toMatch(/--font-geist-mono:\s*"Geist Mono Variable", [^;]*monospace;/);
  });

  it("ships the SIL Open Font License beside the font files", () => {
    const license = read("./fonts/OFL-Geist.txt");
    expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(license).toContain("The Geist Project Authors");
  });
});
