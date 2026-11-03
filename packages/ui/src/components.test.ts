import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL(".", import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, SRC), "utf8");

const tokens = read("./tokens.css");
const declared = new Set([...tokens.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]));

const APP_PROVIDED = new Set<string>(["--font-geist-sans", "--font-geist-mono"]);

const consumers = [
  "components.css",
  ...readdirSync(SRC).filter(
    (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$|test-support/.test(file),
  ),
];

describe("ui components resolve their custom properties", () => {
  it.each(consumers)("%s only reads tokens declared in tokens.css", (file) => {
    const used = [...read(`./${file}`).matchAll(/var\((--[\w-]+)/g)].map((match) => match[1] ?? "");
    const missing = used.filter((name) => !declared.has(name) && !APP_PROVIDED.has(name));
    expect(missing).toEqual([]);
  });

  it.each(consumers)("%s only reads (--token) shorthand classes declared in tokens.css", (file) => {
    const used = [...read(`./${file}`).matchAll(/-\((?:[\w-]+:)?(--[\w-]+)\)/g)].map(
      (match) => match[1] ?? "",
    );
    const missing = used.filter((name) => !declared.has(name) && !APP_PROVIDED.has(name));
    expect(missing).toEqual([]);
  });

  it("covers the component sources it is meant to guard", () => {
    expect(consumers).toEqual(
      expect.arrayContaining(["components.css", "button.tsx", "badge.tsx"]),
    );
  });

  it("gives the filled variants a forced-colors outline, outside the components layer", () => {
    const css = read("./components.css");
    const forced = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

    expect(forced).toContain(".vk-btn-primary:not(:focus-visible)");
    expect(forced).toContain(".vk-btn-danger:not(:focus-visible)");
    expect(forced).toContain("outline: 1px solid ButtonText");
  });

  it("paints the danger hover from the strong token, only where hover exists", () => {
    expect(read("./components.css")).toMatch(
      /@media \(hover: hover\) \{\s*\.vk-btn-danger:hover \{\s*background: var\(--status-danger-strong\);/,
    );
  });
});
