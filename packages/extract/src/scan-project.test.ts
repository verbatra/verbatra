// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are source text under test, not templates
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createI18nextExtractor } from "./i18next/i18next-extractor.js";
import { scanProject } from "./scan-project.js";
import type { SourceFs } from "./source-fs-port.js";

const cwd = join("/", "project");
const root = join(cwd, "src");

function fakeFs(files: Readonly<Record<string, string>>): SourceFs {
  return {
    listDirectory: async (path) =>
      Object.keys(files)
        .filter((file) => file.startsWith(`${path}/`) && !file.slice(path.length + 1).includes("/"))
        .map((file) => ({ name: file.slice(path.length + 1), kind: "file" as const })),
    readTextBounded: async (path, maxBytes) => {
      const content = files[path];
      if (content === undefined) {
        return { kind: "missing" };
      }
      return content.length > maxBytes ? { kind: "too-large" } : { kind: "ok", content };
    },
  };
}

function scan(files: Readonly<Record<string, string>>, maxFileBytes?: number) {
  return scanProject(
    {
      cwd,
      roots: [root],
      extractor: createI18nextExtractor(),
      ...(maxFileBytes !== undefined ? { maxFileBytes } : {}),
    },
    fakeFs(files),
  );
}

describe("scanProject", () => {
  it("collects keys with their default values and file-relative locations", async () => {
    const result = await scan({
      [join(root, "nav.ts")]: 't("nav.home", "Home");\nt("nav.away");',
    });

    expect(result.scannedFiles).toBe(1);
    expect(result.keys).toEqual([
      { key: "nav.home", value: "Home", hasDefault: true, file: "src/nav.ts", line: 1 },
      { key: "nav.away", value: "", hasDefault: false, file: "src/nav.ts", line: 2 },
    ]);
  });

  it("keeps the first location when one key appears twice with the same default", async () => {
    const result = await scan({
      [join(root, "a.ts")]: 't("nav.home", "Home")',
      [join(root, "b.ts")]: 't("nav.home", "Home")',
    });

    expect(result.keys).toEqual([
      { key: "nav.home", value: "Home", hasDefault: true, file: "src/a.ts", line: 1 },
    ]);
    expect(result.conflicts).toEqual([]);
  });

  it("reports a key found twice with two different defaults as a conflict", async () => {
    const result = await scan({
      [join(root, "a.ts")]: 't("nav.home", "Home")',
      [join(root, "b.ts")]: 't("nav.home", "Start")',
    });

    expect(result.conflicts).toEqual([
      {
        key: "nav.home",
        values: ["Home", "Start"],
        locations: [
          { file: "src/a.ts", line: 1 },
          { file: "src/b.ts", line: 1 },
        ],
      },
    ]);
  });

  it("keeps a conflicted key out of the key list, so neither value can be written", async () => {
    const result = await scan({
      [join(root, "a.ts")]: 't("nav.home", "Home")',
      [join(root, "b.ts")]: 't("nav.home", "Start")\nt("nav.away", "Away")',
    });

    expect(result.keys.map((entry) => entry.key)).toEqual(["nav.away"]);
  });

  it("lets a defined default fill in for a call site that carries none", async () => {
    const result = await scan({
      [join(root, "a.ts")]: 't("nav.home")',
      [join(root, "b.ts")]: 't("nav.home", "Home")',
    });

    expect(result.keys).toEqual([
      { key: "nav.home", value: "Home", hasDefault: true, file: "src/a.ts", line: 1 },
    ]);
    expect(result.conflicts).toEqual([]);
  });

  it("reports dynamic call sites with their locations", async () => {
    const result = await scan({ [join(root, "a.ts")]: "\nt(key)" });

    expect(result.dynamic).toEqual([{ file: "src/a.ts", line: 2 }]);
  });

  it("aggregates key usage across files with file-relative locations", async () => {
    const result = await scan({
      [join(root, "a.tsx")]:
        'const { t } = useTranslation("common", { keyPrefix: "nav" });\nt("home");\nt(`item.${id}`);',
      [join(root, "b.ts")]: 't("nav.home");\nt(key);\nthis.tr = t;\n<Trans />',
    });

    expect(result.usage).toEqual({
      referencedKeys: ["home", "nav.home"],
      dynamic: [{ file: "src/b.ts", line: 2 }],
      prefixes: [
        { prefix: "item.", file: "src/a.tsx", line: 3 },
        { prefix: "nav.item.", file: "src/a.tsx", line: 3 },
      ],
      unresolved: [
        { reason: "aliased-translate-function", file: "src/b.ts", line: 3 },
        { reason: "translate-function-escapes", file: "src/b.ts", line: 3 },
        { reason: "trans-without-key", file: "src/b.ts", line: 4 },
      ],
      templateFiles: [],
    });
  });

  it("falls back to the calls and dynamic sites of an extractor that reports no usage", async () => {
    const plain = {
      framework: "i18next" as const,
      extensions: [".ts"],
      extract: () => ({ calls: [{ key: "nav.home", line: 1 }], dynamic: [{ line: 2 }] }),
    };

    const result = await scanProject(
      { cwd, roots: [root], extractor: plain },
      fakeFs({ [join(root, "a.ts")]: "x" }),
    );

    expect(result.usage).toEqual({
      referencedKeys: ["nav.home"],
      dynamic: [{ file: "src/a.ts", line: 2 }],
      prefixes: [],
      unresolved: [],
      templateFiles: [],
    });
    expect(result.keys.map((entry) => entry.key)).toEqual(["nav.home"]);
  });

  it("lists template files the extractor cannot read, sorted, without reading them", async () => {
    const result = await scan({
      [join(root, "App.vue")]: '{{ $t("a") }}',
      [join(root, "page.mdx")]: "x",
      [join(root, "a.ts")]: 't("b")',
      [join(root, "notes.md")]: "x",
    });

    expect(result.usage.templateFiles).toEqual(["src/App.vue", "src/page.mdx"]);
    expect(result.scannedFiles).toBe(1);
  });

  it("does not list a template extension the extractor itself reads", async () => {
    const vue = {
      framework: "i18next" as const,
      extensions: [".vue"],
      extract: () => ({ calls: [], dynamic: [] }),
    };

    const result = await scanProject(
      { cwd, roots: [root], extractor: vue },
      fakeFs({ [join(root, "App.vue")]: "x", [join(root, "index.html")]: "x" }),
    );

    expect(result.usage.templateFiles).toEqual(["src/index.html"]);
  });

  it("reports an oversized file as a diagnostic and carries on with the rest", async () => {
    const result = await scan(
      {
        [join(root, "big.ts")]: `t("${"x".repeat(80)}")`,
        [join(root, "small.ts")]: 't("nav.home")',
      },
      32,
    );

    expect(result.diagnostics).toEqual([{ file: "src/big.ts", reason: "too-large" }]);
    expect(result.keys.map((entry) => entry.key)).toEqual(["nav.home"]);
    expect(result.scannedFiles).toBe(1);
  });

  it("reports a file that vanished between discovery and read as a diagnostic", async () => {
    const fs: SourceFs = {
      listDirectory: async () => [{ name: "gone.ts", kind: "file" }],
      readTextBounded: async () => ({ kind: "missing" }),
    };

    const result = await scanProject(
      { cwd, roots: [root], extractor: createI18nextExtractor() },
      fs,
    );

    expect(result.diagnostics).toEqual([{ file: "src/gone.ts", reason: "unreadable" }]);
  });

  it("reports an unreadable directory as a diagnostic rather than failing", async () => {
    const fs: SourceFs = {
      listDirectory: async () => {
        throw new Error("EACCES");
      },
      readTextBounded: async () => ({ kind: "missing" }),
    };

    const result = await scanProject(
      { cwd, roots: [root], extractor: createI18nextExtractor() },
      fs,
    );

    expect(result.diagnostics).toEqual([{ file: "src", reason: "unreadable-directory" }]);
  });

  it("reports a file the extractor throws on as a diagnostic and keeps scanning", async () => {
    const failing = {
      framework: "i18next" as const,
      extensions: [".ts"],
      extract: (file: { path: string }) => {
        if (file.path.endsWith("bad.ts")) {
          throw new Error("unhandled shape");
        }
        return { calls: [], dynamic: [] };
      },
    };

    const result = await scanProject(
      { cwd, roots: [root], extractor: failing },
      fakeFs({ [join(root, "bad.ts")]: "x", [join(root, "good.ts")]: "y" }),
    );

    expect(result.diagnostics).toEqual([{ file: "src/bad.ts", reason: "unparseable" }]);
    expect(result.scannedFiles).toBe(1);
  });

  it("only reads the extensions the extractor declares", async () => {
    const result = await scanProject(
      { cwd, roots: [root], extractor: { ...createI18nextExtractor(), extensions: [".tsx"] } },
      fakeFs({ [join(root, "a.ts")]: 't("skipped")', [join(root, "b.tsx")]: 't("kept")' }),
    );

    expect(result.keys.map((entry) => entry.key)).toEqual(["kept"]);
  });
});

describe("scanProject honours the exclude list", () => {
  it("skips a directory the caller excluded", async () => {
    const fs: SourceFs = {
      listDirectory: async (path) =>
        path === root
          ? [{ name: "generated", kind: "directory" }]
          : [{ name: "schema.ts", kind: "file" }],
      readTextBounded: async () => ({ kind: "ok", content: 't("generated.key")' }),
    };

    const result = await scanProject(
      { cwd, roots: [root], extractor: createI18nextExtractor(), exclude: ["generated"] },
      fs,
    );

    expect(result.keys).toEqual([]);
  });
});

describe("scanProject on a file it cannot read to the end", () => {
  it("reports the file as unparseable and keeps the keys it did read", async () => {
    const result = await scan({
      [join(root, "nav.ts")]: 't("nav.home", "Home");\n/* never closed\nt("nav.lost");',
    });

    expect(result.diagnostics).toEqual([{ file: "src/nav.ts", reason: "unparseable" }]);
    expect(result.keys).toEqual([
      { key: "nav.home", value: "Home", hasDefault: true, file: "src/nav.ts", line: 1 },
    ]);
  });

  it("reports nothing for a file it read whole", async () => {
    const result = await scan({ [join(root, "nav.ts")]: 't("nav.home");' });

    expect(result.diagnostics).toEqual([]);
  });
});
