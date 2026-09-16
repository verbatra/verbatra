import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSourceFiles, TEMPLATE_FILE_EXTENSIONS } from "./discovery.js";
import { createI18nextExtractor } from "./i18next/i18next-extractor.js";
import type { DirectoryEntry, SourceFs } from "./source-fs-port.js";

function fakeFs(tree: Readonly<Record<string, readonly DirectoryEntry[]>>): SourceFs {
  return {
    listDirectory: async (path) => tree[path] ?? [],
    readTextBounded: async () => ({ kind: "missing" }),
  };
}

const root = join("/", "project", "src");

const extensions = [".ts", ".tsx"];

describe("discoverSourceFiles", () => {
  it("returns matching files under a root, sorted, with absolute paths", async () => {
    const fs = fakeFs({
      [root]: [
        { name: "b.ts", kind: "file" },
        { name: "a.tsx", kind: "file" },
        { name: "notes.md", kind: "file" },
      ],
    });

    expect(await discoverSourceFiles({ roots: [root], extensions }, fs)).toEqual([
      join(root, "a.tsx"),
      join(root, "b.ts"),
    ]);
  });

  it("descends into subdirectories", async () => {
    const nested = join(root, "app");
    const fs = fakeFs({
      [root]: [{ name: "app", kind: "directory" }],
      [nested]: [{ name: "page.ts", kind: "file" }],
    });

    expect(await discoverSourceFiles({ roots: [root], extensions }, fs)).toEqual([
      join(nested, "page.ts"),
    ]);
  });

  it("never walks node_modules", async () => {
    const vendored = join(root, "node_modules");
    const fs = fakeFs({
      [root]: [{ name: "node_modules", kind: "directory" }],
      [vendored]: [{ name: "vendor.ts", kind: "file" }],
    });

    expect(await discoverSourceFiles({ roots: [root], extensions }, fs)).toEqual([]);
  });

  it("skips a directory named by exclude", async () => {
    const generated = join(root, "generated");
    const fs = fakeFs({
      [root]: [{ name: "generated", kind: "directory" }],
      [generated]: [{ name: "schema.ts", kind: "file" }],
    });

    expect(
      await discoverSourceFiles({ roots: [root], exclude: ["generated"], extensions }, fs),
    ).toEqual([]);
  });

  it("skips an entry that is neither a file nor a directory, so a symlink cannot escape the root", async () => {
    const fs = fakeFs({
      [root]: [
        { name: "elsewhere", kind: "other" },
        { name: "real.ts", kind: "file" },
      ],
    });

    expect(await discoverSourceFiles({ roots: [root], extensions }, fs)).toEqual([
      join(root, "real.ts"),
    ]);
  });

  it("reports an unreadable root as a diagnostic rather than failing the scan", async () => {
    const other = join("/", "project", "lib");
    const fs: SourceFs = {
      listDirectory: async (path) => {
        if (path === root) {
          throw new Error("ENOENT");
        }
        return path === other ? [{ name: "a.ts", kind: "file" }] : [];
      },
      readTextBounded: async () => ({ kind: "missing" }),
    };

    const unreadable: string[] = [];
    const files = await discoverSourceFiles(
      { roots: [root, other], extensions, onUnreadableDirectory: (path) => unreadable.push(path) },
      fs,
    );

    expect(files).toEqual([join(other, "a.ts")]);
    expect(unreadable).toEqual([root]);
  });

  it("reports template files by the template extensions, never under an excluded directory", async () => {
    const generated = join(root, "generated");
    const fs = fakeFs({
      [root]: [
        { name: "App.vue", kind: "file" },
        { name: "a.ts", kind: "file" },
        { name: "generated", kind: "directory" },
      ],
      [generated]: [{ name: "Page.svelte", kind: "file" }],
    });
    const templates: string[] = [];

    const files = await discoverSourceFiles(
      {
        roots: [root],
        extensions,
        exclude: ["generated"],
        templateExtensions: TEMPLATE_FILE_EXTENSIONS,
        onTemplateFile: (path) => templates.push(path),
      },
      fs,
    );

    expect(files).toEqual([join(root, "a.ts")]);
    expect(templates).toEqual([join(root, "App.vue")]);
  });

  it("names the template extensions a script extractor cannot read", () => {
    expect(TEMPLATE_FILE_EXTENSIONS).toEqual([
      ".vue",
      ".svelte",
      ".html",
      ".htm",
      ".astro",
      ".hbs",
      ".handlebars",
      ".ejs",
      ".pug",
      ".njk",
      ".liquid",
      ".mdx",
    ]);
  });

  it("yields each file once when two roots overlap", async () => {
    const fs = fakeFs({ [root]: [{ name: "a.ts", kind: "file" }] });

    expect(await discoverSourceFiles({ roots: [root, root], extensions }, fs)).toEqual([
      join(root, "a.ts"),
    ]);
  });

  it("accepts every extension the framework extractor names", async () => {
    const framework = createI18nextExtractor().extensions;
    const names = framework.map((extension, index) => `file${index}${extension}`);
    const fs = fakeFs({
      [root]: names.map((name) => ({ name, kind: "file" as const })),
    });

    const found = await discoverSourceFiles({ roots: [root], extensions: framework }, fs);

    expect(found).toHaveLength(names.length);
  });
});
