import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { AdapterRegistry } from "../registry.js";
import { createFlatFileAdapter, type FlatParseOutcome } from "./flat-file-adapter.js";

const good = { key: "a", namespace: "f", value: "A", placeholders: [], isPlural: false };

function pluginReturning(outcome: unknown) {
  return createFlatFileAdapter({
    format: "custom:flat",
    extensions: [".flat"],
    parseEntries: () => outcome as FlatParseOutcome,
    serializeEntries: () => "",
    extractPlaceholders: () => [],
  });
}

async function flatFile(): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "verbatra-flat-")), "f.flat");
  await writeFile(path, "a=A");
  return path;
}

describe("createFlatFileAdapter: malformed parseEntries results", () => {
  it.each([
    ["undefined", undefined, "neither a Map nor an object with an entries Map"],
    ["a plain object of entries", { a: good }, "entries that are not a Map"],
    ["a result without an entries Map", { entries: [good] }, "entries that are not a Map"],
    ["an empty key", new Map([["", { ...good, key: "" }]]), "map key is not a non-empty string"],
    ["a non-object entry", new Map([["a", "A"]]), 'a non-object entry for "a"'],
    ["a mismatched key field", new Map([["a", { ...good, key: "b" }]]), "key field does not match"],
    ["a numeric value", new Map([["a", { ...good, value: 1 }]]), '"a" whose value is not a string'],
    ["a missing namespace", new Map([["a", { ...good, namespace: undefined }]]), "namespace"],
    ["placeholders of numbers", new Map([["a", { ...good, placeholders: [1] }]]), "placeholders"],
    ["a string isPlural", new Map([["a", { ...good, isPlural: "no" }]]), "isPlural"],
    ["a numeric description", new Map([["a", { ...good, description: 1 }]]), "description"],
    ["a numeric meaning", new Map([["a", { ...good, meaning: 1 }]]), "meaning"],
    [
      "excluded paths that are not strings",
      { entries: new Map([["a", good]]), excludedLeafPaths: [1] },
      "excludedLeafPaths",
    ],
  ])("refuses %s with an AdapterError naming the format", async (_label, outcome, fragment) => {
    const error = await pluginReturning(outcome)
      .read(await flatFile(), "de")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdapterError);
    expect(error).toMatchObject({ code: "ADAPTER_FAILED" });
    expect((error as Error).message).toContain('The "custom:flat" adapter\'s parseEntries()');
    expect((error as Error).message).toContain(fragment);
  });

  it("keeps the attribution when the adapter is reached through a registry", async () => {
    const registry = new AdapterRegistry();
    registry.register(pluginReturning({ a: good }));

    const path = await flatFile();
    const resolved = registry.resolve(path, { format: "custom:flat" });
    const adapter = resolved.status === "resolved" ? resolved.adapter : undefined;
    const error = await adapter?.read(path, "de").catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "ADAPTER_FAILED" });
    expect((error as Error).message).toContain('"custom:flat"');
  });

  it("accepts a well-formed result with optional fields", async () => {
    const entry = { ...good, description: "d", meaning: "m" };
    const read = await pluginReturning({
      entries: new Map([["a", entry]]),
      excludedLeafPaths: ["x"],
    }).read(await flatFile(), "de");

    expect(read.resource.entries.get("a")).toEqual(entry);
    expect(read.excludedLeafPaths).toEqual(["x"]);
  });
});
