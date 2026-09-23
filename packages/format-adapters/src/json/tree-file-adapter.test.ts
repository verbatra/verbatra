import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { parseJsonObject, serializeJsonTree } from "./json-tree.js";
import { createTreeFileAdapter, type TreeFileAdapterOptions } from "./tree-file-adapter.js";

const baseOptions: TreeFileAdapterOptions = {
  format: "yaml",
  extensions: [".tree", ".tr"],
  parse: parseJsonObject,
  serialize: serializeJsonTree,
  deriveEntry: () => ({ placeholders: [], isPlural: false }),
  extractPlaceholders: () => [],
};

function makeAdapter(overrides: Partial<TreeFileAdapterOptions> = {}) {
  return createTreeFileAdapter({ ...baseOptions, ...overrides });
}

async function tempFile(name: string, content: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "verbatra-tree-")), name);
  await writeFile(path, content);
  return path;
}

async function readError(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

function entry(key: string, value: string): TranslationEntry {
  return { key, namespace: "f", value, placeholders: [], isPlural: false };
}

describe("createTreeFileAdapter canHandle", () => {
  it("accepts every configured extension, case-insensitively", () => {
    const adapter = makeAdapter();
    expect(adapter.canHandle("a.tree")).toBe(true);
    expect(adapter.canHandle("a.TR")).toBe(true);
    expect(adapter.canHandle("a.json")).toBe(false);
  });

  it("applies the sniff only when a sample is provided", () => {
    const adapter = makeAdapter({ sniff: (sample) => sample.startsWith("ok") });
    expect(adapter.canHandle("a.tree")).toBe(true);
    expect(adapter.canHandle("a.tree", "ok content")).toBe(true);
    expect(adapter.canHandle("a.tree", "no")).toBe(false);
  });
});

describe("createTreeFileAdapter read", () => {
  it("uses the injected parse and flattens the result", async () => {
    const adapter = makeAdapter();
    const path = await tempFile("f.tree", JSON.stringify({ a: { b: "x" }, c: "y" }));
    const { resource } = await adapter.read(path, "en");
    expect([...resource.entries.keys()]).toEqual(["a.b", "c"]);
    expect(resource.format).toBe("yaml");
    expect(resource.namespace).toBe("f");
  });

  it("wraps a non-AdapterError from parse as INVALID_STRUCTURE", async () => {
    const adapter = makeAdapter({
      parse: () => {
        throw new Error("raw /secret parse failure");
      },
    });
    const error = await readError(adapter.read(await tempFile("f.tree", "x"), "en"));
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).not.toContain("/secret");
  });

  it("passes an AdapterError from parse through unchanged", async () => {
    const adapter = makeAdapter({
      parse: () => {
        throw new AdapterError("INVALID_YAML", "bad");
      },
    });
    const error = await readError(adapter.read(await tempFile("f.tree", "x"), "en"));
    expect((error as AdapterError).code).toBe("INVALID_YAML");
  });

  it("runs a supplied validateTree before flattening", async () => {
    const adapter = makeAdapter({
      validateTree: () => {
        throw new AdapterError("MIXED_STRUCTURE", "mixed");
      },
    });
    const error = await readError(adapter.read(await tempFile("f.tree", "{}"), "en"));
    expect((error as AdapterError).code).toBe("MIXED_STRUCTURE");
  });

  it("reports invalidIcuKeys from a supplied computeInvalidIcuKeys", async () => {
    const adapter = makeAdapter({
      computeInvalidIcuKeys: (entries) => [...entries.keys()],
    });
    const { invalidIcuKeys } = await adapter.read(await tempFile("f.tree", '{"k":"v"}'), "en");
    expect(invalidIcuKeys).toEqual(["k"]);
  });
});

describe("createTreeFileAdapter deriveDescriptions", () => {
  it("merges a derived description into the matching flattened entry", async () => {
    const adapter = makeAdapter({
      deriveDescriptions: () => new Map([["a.b", "context for a.b"]]),
    });
    const path = await tempFile("f.tree", JSON.stringify({ a: { b: "x" }, c: "y" }));
    const { resource } = await adapter.read(path, "en");
    expect(resource.entries.get("a.b")?.description).toBe("context for a.b");
    expect(resource.entries.get("c")?.description).toBeUndefined();
  });

  it("ignores a derived key that matches no flattened entry", async () => {
    const adapter = makeAdapter({
      deriveDescriptions: () => new Map([["no-such-key", "orphaned context"]]),
    });
    const path = await tempFile("f.tree", JSON.stringify({ a: "x" }));
    const { resource } = await adapter.read(path, "en");
    expect(resource.entries.get("a")?.description).toBeUndefined();
    expect(resource.entries.has("no-such-key")).toBe(false);
  });

  it("leaves every description undefined when no deriveDescriptions is supplied", async () => {
    const adapter = makeAdapter();
    const path = await tempFile("f.tree", JSON.stringify({ a: "x" }));
    const { resource } = await adapter.read(path, "en");
    expect(resource.entries.get("a")?.description).toBeUndefined();
  });
});

describe("createTreeFileAdapter write", () => {
  it("serializes the default nested tree through the injected serialize", async () => {
    const adapter = makeAdapter();
    const path = await tempFile("out.tree", "{}");
    await adapter.write(
      {
        locale: "en",
        namespace: "f",
        format: "yaml",
        entries: new Map([["a.b", entry("a.b", "x")]]),
      },
      path,
    );
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ a: { b: "x" } });
  });

  it("uses a supplied buildWriteTree to control the on-disk shape", async () => {
    const adapter = makeAdapter({
      buildWriteTree: (entries) => new Map([["flat", [...entries.keys()]]]),
    });
    const path = await tempFile("out.tree", "{}");
    await adapter.write(
      {
        locale: "en",
        namespace: "f",
        format: "yaml",
        entries: new Map([["k", entry("k", "v")]]),
      },
      path,
    );
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ flat: ["k"] });
  });
});

describe("createTreeFileAdapter key-order preservation", () => {
  const mixedOrder =
    '{\n  "zebra": "Z",\n  "1": "one",\n  "alpha": "A",\n  "nested": {\n    "10": "ten",\n    "b": "B",\n    "2": "two"\n  }\n}\n';

  it("reads mixed integer-like and named keys into the entries Map in document order, at root and nested levels", async () => {
    const adapter = makeAdapter();
    const path = await tempFile("f.tree", mixedOrder);
    const { resource } = await adapter.read(path, "en");
    expect([...resource.entries.keys()]).toEqual([
      "zebra",
      "1",
      "alpha",
      "nested.10",
      "nested.b",
      "nested.2",
    ]);
  });

  it("writes keys in the entries Map iteration order exactly, so the round-trip is byte-identical", async () => {
    const adapter = makeAdapter();
    const path = await tempFile("f.tree", mixedOrder);
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).toBe(mixedOrder);
  });

  it("keeps an edited key in place instead of re-sorting it", async () => {
    const adapter = makeAdapter();
    const path = await tempFile("f.tree", mixedOrder);
    const { resource } = await adapter.read(path, "en");
    const entries = new Map(resource.entries);
    const alpha = entries.get("alpha");
    expect(alpha).toBeDefined();
    if (alpha !== undefined) {
      entries.set("alpha", { ...alpha, value: "edited" });
    }
    await adapter.write({ ...resource, entries }, path);
    expect(await readFile(path, "utf8")).toBe(
      mixedOrder.replace('"alpha": "A"', '"alpha": "edited"'),
    );
  });
});

describe("createTreeFileAdapter validateMessage", () => {
  it("defaults to accepting every value", () => {
    expect(makeAdapter().validateMessage("anything")).toBe(true);
  });

  it("uses a supplied validator", () => {
    const adapter = makeAdapter({ validateMessage: (v) => v !== "bad" });
    expect(adapter.validateMessage("ok")).toBe(true);
    expect(adapter.validateMessage("bad")).toBe(false);
  });
});

describe("createTreeFileAdapter compareBranchArms", () => {
  it("omits the check when the format supplies none", () => {
    expect("compareBranchArms" in makeAdapter()).toBe(false);
  });

  it("exposes the check the format supplied", () => {
    const adapter = makeAdapter({ compareBranchArms: () => ["wrong arm"] });
    expect(adapter.compareBranchArms?.("a", "b", () => undefined)).toEqual(["wrong arm"]);
  });
});
