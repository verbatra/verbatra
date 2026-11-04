import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let outDir = "";
let htmlFiles: string[] = [];

const INLINE_SCRIPT_WITH_BODY = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
const STYLE_ELEMENT = /<style[^>]*>/i;
const EVENT_HANDLER_ATTRIBUTE = /\son[a-z]+\s*=/i;
const JAVASCRIPT_URL = /(?:href|src)\s*=\s*["']javascript:/i;
const THEME_INIT_SCRIPT =
  /<script\b(?![^>]*\btype\s*=\s*["']module["'])[^>]*\bsrc\s*=\s*["']\/theme-init\.js["'][^>]*>/i;
const DATA_URL_FONT = /url\(\s*["']?data:/i;

async function listHtmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("built SPA output", () => {
  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "verbatra-studio-csp-dist-"));
    const { build } = await import("vite");
    const configFile = fileURLToPath(new URL("../../vite.config.ts", import.meta.url));
    await build({ configFile, build: { outDir, emptyOutDir: true } });
    htmlFiles = await listHtmlFiles(outDir);
  }, 60000);

  afterAll(async () => {
    if (outDir) {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("produces at least one built html file", () => {
    expect(htmlFiles.length).toBeGreaterThan(0);
  });

  it("contains no inline script with a non-empty body", async () => {
    for (const file of htmlFiles) {
      const content = await readFile(file, "utf8");
      for (const match of content.matchAll(INLINE_SCRIPT_WITH_BODY)) {
        expect(match[1]?.trim()).toBe("");
      }
    }
  });

  it("contains no style element", async () => {
    for (const file of htmlFiles) {
      const content = await readFile(file, "utf8");
      expect(content).not.toMatch(STYLE_ELEMENT);
    }
  });

  it("contains no on* event handler attribute", async () => {
    for (const file of htmlFiles) {
      const content = await readFile(file, "utf8");
      expect(content).not.toMatch(EVENT_HANDLER_ATTRIBUTE);
    }
  });

  it("contains no javascript: URL", async () => {
    for (const file of htmlFiles) {
      const content = await readFile(file, "utf8");
      expect(content).not.toMatch(JAVASCRIPT_URL);
    }
  });

  it("ships theme-init.js and references it from a classic script in the head", async () => {
    const script = await readFile(join(outDir, "theme-init.js"), "utf8");
    expect(script).toContain("verbatra-studio-theme");
    const html = await readFile(join(outDir, "index.html"), "utf8");
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toMatch(THEME_INIT_SCRIPT);
    expect(head.indexOf("/theme-init.js")).toBeLessThan(head.indexOf('type="module"'));
  });

  it("emits the Geist fonts as files, never as data URLs", async () => {
    const assets = await readdir(join(outDir, "assets"));
    const css = await Promise.all(
      assets
        .filter((name) => name.endsWith(".css"))
        .map((name) => readFile(join(outDir, "assets", name), "utf8")),
    );
    expect(css.length).toBeGreaterThan(0);
    for (const sheet of css) {
      expect(sheet).not.toMatch(DATA_URL_FONT);
    }
    expect(assets.filter((name) => name.endsWith(".woff2")).length).toBeGreaterThanOrEqual(4);
  });

  it("ships the font license beside the app", async () => {
    const license = await readFile(join(outDir, "licenses", "OFL-Geist.txt"), "utf8");
    expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  it("compiles every utility class the shared ui fields are written with", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../../../ui/src/field.ts", import.meta.url)),
      "utf8",
    );
    const base = /FIELD_BASE =\s*"([^"]+)"/.exec(source)?.[1] ?? "";
    const assets = await readdir(join(outDir, "assets"));
    const css = (
      await Promise.all(
        assets
          .filter((name) => name.endsWith(".css"))
          .map((name) => readFile(join(outDir, "assets", name), "utf8")),
      )
    ).join("\n");
    const classes = base.split(/\s+/).filter((name) => name.length > 0 && !name.startsWith("vk-"));

    expect(classes.length).toBeGreaterThan(5);
    const missing = classes.filter(
      (name) => !css.includes(`.${name.replace(/[^\w-]/g, (char) => `\\${char}`)}`),
    );
    expect(missing).toEqual([]);
  });

  it.each([
    "popover.tsx",
    "dropdown.tsx",
    "tooltip.tsx",
    "segmented-control.tsx",
    "tabs.tsx",
    "theme-toggle.tsx",
  ])("compiles every utility class of the shared ui %s", async (file) => {
    const source = await readFile(
      fileURLToPath(new URL(`../../../ui/src/${file}`, import.meta.url)),
      "utf8",
    );
    const UTILITY =
      /^(?:[a-z-]+:)*-?(?:p[xytblrse]?|m[xytblrse]?|gap|size|w|h|min-w|max-w|max-h|z|top|bottom|start|end|text|bg|border|rounded|shadow|opacity|translate|outline|flex|inline-flex|block|absolute|relative|invisible|overflow-y|items|justify|transition|delay|font|pointer-events|data)(?:-|$|\[)/;
    const classes = [...source.matchAll(/"([^"\n]*)"/g)]
      .flatMap((match) => (match[1] ?? "").split(/\s+/))
      .filter((name) => UTILITY.test(name) && !name.includes("\u0027"));
    const assets = await readdir(join(outDir, "assets"));
    const css = (
      await Promise.all(
        assets
          .filter((name) => name.endsWith(".css"))
          .map((name) => readFile(join(outDir, "assets", name), "utf8")),
      )
    ).join("\n");

    expect(classes.length).toBeGreaterThan(1);
    const missing = classes.filter(
      (name) => !css.includes(`.${name.replace(/[^\w-]/g, (char) => `\\${char}`)}`),
    );
    expect(missing).toEqual([]);
  });
});
