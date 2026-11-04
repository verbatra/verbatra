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
      expect.arrayContaining([
        "components.css",
        "button.tsx",
        "badge.tsx",
        "input.tsx",
        "select.tsx",
        "table.tsx",
        "sheet.tsx",
        "section.tsx",
      ]),
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

  it("stacks the reserved text invisibly in the label's grid cell", () => {
    const css = read("./components.css");
    const rule = /\.vk-btn-reserve::after \{([^}]*)\}/.exec(css)?.[1] ?? "";

    expect(css).toMatch(/\.vk-btn-reserve \{\s*display: inline-grid;/);
    expect(rule).toContain("content: attr(data-reserve)");
    expect(rule).toContain("grid-area: 1 / 1");
    expect(rule).toContain("visibility: hidden");
    expect(rule).toContain("height: 0");
  });

  it("gives fields the focus ring of the buttons", () => {
    const css = read("./components.css");
    const field = /\.vk-field:focus-visible \{([^}]*)\}/.exec(css)?.[1] ?? "";
    const button = /\.vk-btn:focus-visible \{([^}]*)\}/.exec(css)?.[1] ?? "";

    expect(field).toContain("outline: 2px solid var(--focus-ring)");
    expect(field.replace(/\s+/g, "")).toBe(button.replace(/\s+/g, ""));
  });

  it.each(consumers.filter((file) => file.endsWith(".tsx")))(
    "%s uses no app-defined theme alias a host may lack",
    (file) => {
      const aliases =
        /(?<![-\w(])(?:bg|text|border|divide|ring|accent|shadow)-(?:background|foreground|muted-foreground|card|popover|border|input|primary|danger|success|warning|overlay|neutral-soft|panel(?:-lg)?)\b/;

      expect(aliases.exec(read(`./${file}`))?.[0]).toBeUndefined();
    },
  );
});
