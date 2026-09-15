import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { createFlatFileAdapter, type FlatFileAdapterOptions } from "./flat-file-adapter.js";

function entry(key: string, value: string): TranslationEntry {
  return { key, namespace: "f", value, placeholders: [], isPlural: false };
}

const baseOptions: FlatFileAdapterOptions = {
  format: "xliff",
  extensions: [".flat"],
  parseEntries: (content, namespace) =>
    new Map(
      content
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => {
          const [key = "", value = ""] = line.split("=");
          return [key, entry(key, value)] as const;
        })
        .map(([key, e]) => [key, { ...e, namespace }] as const),
    ),
  serializeEntries: (entries) => [...entries.values()].map((e) => `${e.key}=${e.value}`).join("\n"),
  extractPlaceholders: () => [],
};

function makeAdapter(overrides: Partial<FlatFileAdapterOptions> = {}) {
  return createFlatFileAdapter({ ...baseOptions, ...overrides });
}

async function tempFile(name: string, content: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "verbatra-flat-")), name);
  await writeFile(path, content);
  return path;
}

async function readError(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

describe("createFlatFileAdapter", () => {
  it("detects by extension", () => {
    expect(makeAdapter().canHandle("a.flat")).toBe(true);
    expect(makeAdapter().canHandle("a.json")).toBe(false);
  });

  it("reads flat entries with the file basename as namespace", async () => {
    const adapter = makeAdapter();
    const { resource } = await adapter.read(await tempFile("msgs.flat", "a=1\nb=2"), "en");
    expect([...resource.entries.keys()]).toEqual(["a", "b"]);
    expect(resource.namespace).toBe("msgs");
    expect(resource.format).toBe("xliff");
  });

  it("rejects a non-regular path with INVALID_STRUCTURE", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verbatra-flat-dir-"));
    const error = await readError(makeAdapter().read(dir, "en"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("wraps a non-AdapterError from parseEntries as INVALID_STRUCTURE", async () => {
    const adapter = makeAdapter({
      parseEntries: () => {
        throw new Error("raw /secret failure");
      },
    });
    const error = await readError(adapter.read(await tempFile("m.flat", "x"), "en"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).not.toContain("/secret");
  });

  it("passes an AdapterError from parseEntries through unchanged", async () => {
    const adapter = makeAdapter({
      parseEntries: () => {
        throw new AdapterError("INVALID_XML", "bad xml");
      },
    });
    const error = await readError(adapter.read(await tempFile("m.flat", "x"), "en"));
    expect((error as AdapterError).code).toBe("INVALID_XML");
  });

  it("reports invalidIcuKeys from a supplied computeInvalidIcuKeys", async () => {
    const adapter = makeAdapter({ computeInvalidIcuKeys: (entries) => [...entries.keys()] });
    const { invalidIcuKeys } = await adapter.read(await tempFile("m.flat", "a=1"), "en");
    expect(invalidIcuKeys).toEqual(["a"]);
  });

  it("writes through serializeEntries atomically", async () => {
    const adapter = makeAdapter();
    const path = await tempFile("out.flat", "");
    await adapter.write(
      {
        locale: "en",
        namespace: "out",
        format: "xliff",
        entries: new Map([["k", entry("k", "v")]]),
      },
      path,
    );
    expect(await readFile(path, "utf8")).toBe("k=v");
  });

  it("defaults validateMessage to true and uses a supplied one", () => {
    expect(makeAdapter().validateMessage("x")).toBe(true);
    expect(makeAdapter({ validateMessage: (v) => v === "y" }).validateMessage("x")).toBe(false);
  });
});

describe("createFlatFileAdapter and a case-mismatched extension", () => {
  it("claims a file whose extension differs only in case from the configured one", () => {
    expect(makeAdapter({ extensions: [".FLAT"] }).canHandle("locales/de.flat")).toBe(true);
  });

  it("claims an uppercase path under a lowercase configured extension", () => {
    expect(makeAdapter({ extensions: [".flat"] }).canHandle("locales/de.FLAT")).toBe(true);
  });

  it("still refuses an extension it does not claim", () => {
    expect(makeAdapter({ extensions: [".FLAT"] }).canHandle("locales/de.json")).toBe(false);
  });
});

describe("createFlatFileAdapter reports content it skipped", () => {
  it("reports nothing when parseEntries returns a bare map", async () => {
    const path = await tempFile("a.flat", "greeting=Hello\n");

    const result = await makeAdapter().read(path, "de");

    expect(result.excludedLeafPaths).toEqual([]);
  });

  it("carries the paths parseEntries reported as skipped", async () => {
    const path = await tempFile("a.flat", "greeting=Hello\n");
    const adapter = makeAdapter({
      parseEntries: (_content, namespace) => ({
        entries: new Map([["greeting", entry("greeting", "Hello")]]),
        excludedLeafPaths: [`${namespace}.untranslatable`],
      }),
    });

    const result = await adapter.read(path, "de");

    expect(result.excludedLeafPaths).toEqual(["a.untranslatable"]);
  });

  it("still reads the entries alongside the skipped paths", async () => {
    const path = await tempFile("a.flat", "greeting=Hello\n");
    const adapter = makeAdapter({
      parseEntries: () => ({
        entries: new Map([["greeting", entry("greeting", "Hello")]]),
        excludedLeafPaths: ["skipped"],
      }),
    });

    const result = await adapter.read(path, "de");

    expect(result.resource.entries.get("greeting")?.value).toBe("Hello");
  });

  it("treats an omitted excludedLeafPaths on a result object as nothing skipped", async () => {
    const path = await tempFile("a.flat", "greeting=Hello\n");
    const adapter = makeAdapter({
      parseEntries: () => ({ entries: new Map([["greeting", entry("greeting", "Hello")]]) }),
    });

    const result = await adapter.read(path, "de");

    expect(result.excludedLeafPaths).toEqual([]);
  });

  it("accepts a promised result object, so an async parse can report too", async () => {
    const path = await tempFile("a.flat", "greeting=Hello\n");
    const adapter = makeAdapter({
      parseEntries: () =>
        Promise.resolve({
          entries: new Map([["greeting", entry("greeting", "Hello")]]),
          excludedLeafPaths: ["skipped"],
        }),
    });

    const result = await adapter.read(path, "de");

    expect(result.excludedLeafPaths).toEqual(["skipped"]);
  });
});

describe("createFlatFileAdapter and whole-value placeholder comparison", () => {
  it("defines no comparePlaceholders when the format supplies none", () => {
    expect(makeAdapter().comparePlaceholders).toBeUndefined();
  });

  it("omits the key entirely, so an optional-property check sees it absent", () => {
    expect("comparePlaceholders" in makeAdapter()).toBe(false);
  });

  it("exposes the comparison the format supplied", () => {
    const verdict = { matches: false, missing: ["{name}"], extra: [], reordered: false } as const;
    const adapter = makeAdapter({ comparePlaceholders: () => verdict });

    expect(adapter.comparePlaceholders?.("Hi {name}", "Hallo")).toEqual(verdict);
  });

  it("passes both values through in order", () => {
    const seen: string[] = [];
    const adapter = makeAdapter({
      comparePlaceholders: (source, target) => {
        seen.push(source, target);
        return { matches: true, missing: [], extra: [], reordered: false };
      },
    });

    adapter.comparePlaceholders?.("source", "target");

    expect(seen).toEqual(["source", "target"]);
  });
});
