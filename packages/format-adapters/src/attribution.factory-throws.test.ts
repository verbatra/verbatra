import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FormatAdapter } from "./adapter.js";
import { AdapterError } from "./errors.js";
import { createFlatFileAdapter } from "./flat/flat-file-adapter.js";
import { parseJsonObject, serializeJsonTree } from "./json/json-tree.js";
import { createTreeFileAdapter } from "./json/tree-file-adapter.js";
import { AdapterRegistry } from "./registry.js";

async function tempFile(name: string, content: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "verbatra-attribution-")), name);
  await writeFile(path, content);
  return path;
}

function registered(adapter: FormatAdapter, file: string): FormatAdapter {
  const resolution = new AdapterRegistry().register(adapter).resolve(file);
  if (resolution.status !== "resolved") {
    throw new Error("the plugin did not resolve");
  }
  return resolution.adapter;
}

function treePlugin(parse: (content: string) => never): FormatAdapter {
  return createTreeFileAdapter({
    format: "custom:hocon",
    extensions: [".conf"],
    parse,
    serialize: serializeJsonTree,
    deriveEntry: () => ({ placeholders: [], isPlural: false }),
    extractPlaceholders: () => [],
  });
}

function flatPlugin(parseEntries: () => never): FormatAdapter {
  return createFlatFileAdapter({
    format: "custom:env",
    extensions: [".env"],
    parseEntries,
    serializeEntries: () => "",
    extractPlaceholders: () => [],
  });
}

const cases = [
  ["tree", "custom:hocon", "de.conf", treePlugin] as const,
  ["flat", "custom:env", "de.env", flatPlugin] as const,
];

describe.each(cases)("a %s-factory plugin whose parser throws", (_kind, format, name, make) => {
  it("surfaces ADAPTER_FAILED naming the custom format, with the original throw as cause", async () => {
    const original = new TypeError("cannot read properties of undefined");
    const adapter = registered(
      make(() => {
        throw original;
      }),
      name,
    );
    const path = await tempFile(name, "anything");

    const failure = await adapter.read(path, "de").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AdapterError);
    expect(failure).toMatchObject({ code: "ADAPTER_FAILED" });
    expect((failure as AdapterError).message).toContain(`"${format}"`);
    expect((failure as AdapterError).message).toContain("cannot read properties of undefined");
    expect((failure as AdapterError).cause).toBe(original);
  });

  it("keeps the code of an AdapterError the plugin raises itself", async () => {
    const own = new AdapterError("INVALID_STRUCTURE", "a nested table is not supported");
    const adapter = registered(
      make(() => {
        throw own;
      }),
      name,
    );
    const path = await tempFile(name, "anything");

    await expect(adapter.read(path, "de")).rejects.toBe(own);
  });

  it("keeps an errno failure the plugin's parser throws", async () => {
    const missing = Object.assign(new Error("ENOENT: include not found"), { code: "ENOENT" });
    const adapter = registered(
      make(() => {
        throw missing;
      }),
      name,
    );
    const path = await tempFile(name, "anything");

    await expect(adapter.read(path, "de")).rejects.toBe(missing);
  });
});

describe("a built-in adapter built on the same factory keeps its structured codes", () => {
  it("reports INVALID_STRUCTURE for a foreign parser throw, carrying it as the cause", async () => {
    const original = new SyntaxError("unexpected token");
    const adapter = createTreeFileAdapter({
      format: "yaml",
      extensions: [".tree"],
      parse: () => {
        throw original;
      },
      serialize: serializeJsonTree,
      deriveEntry: () => ({ placeholders: [], isPlural: false }),
      extractPlaceholders: () => [],
    });
    const path = await tempFile("de.tree", "anything");

    const failure = await adapter.read(path, "de").catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: "INVALID_STRUCTURE" });
    expect((failure as AdapterError).cause).toBe(original);
  });

  it("keeps INVALID_JSON from the shared JSON parser", async () => {
    const adapter = createTreeFileAdapter({
      format: "i18next-json",
      extensions: [".json"],
      parse: parseJsonObject,
      serialize: serializeJsonTree,
      deriveEntry: () => ({ placeholders: [], isPlural: false }),
      extractPlaceholders: () => [],
    });
    const path = await tempFile("de.json", "{ not json");

    await expect(adapter.read(path, "de")).rejects.toMatchObject({ code: "INVALID_JSON" });
  });
});
