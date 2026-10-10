import type { LocaleResource } from "@verbatra/core";
import type { FormatAdapter, ReadResult } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { baseConfig, makeFakeFs } from "../test-support.js";
import { readSource } from "./source.js";

const resource: LocaleResource = {
  locale: "en",
  namespace: "",
  format: "i18next-json",
  entries: new Map(),
};
const readResult: ReadResult = { resource, invalidIcuKeys: [], excludedLeafPaths: [] };

function makeAdapter(read: FormatAdapter["read"]): FormatAdapter {
  return {
    format: "i18next-json",
    canHandle: () => true,
    read,
    write: async () => {},
    extractPlaceholders: () => [],
    validateMessage: () => true,
  };
}

const config = baseConfig();
const cwd = "/workspace";

describe("readSource", () => {
  it("returns the adapter's ReadResult on the success path", async () => {
    let readPath = "";
    const adapter = makeAdapter(async (path) => {
      readPath = path;
      return readResult;
    });
    const fs = makeFakeFs({ fileExists: async () => true });

    const result = await readSource(config, cwd, fs, adapter);

    expect(result).toBe(readResult);
    expect(readPath).toBe("/workspace/locales/en.json");
  });

  it("throws SOURCE_UNREADABLE when the source file is absent and never reads", async () => {
    let read = false;
    const adapter = makeAdapter(async () => {
      read = true;
      return readResult;
    });
    const fs = makeFakeFs({ fileExists: async () => false });

    await expect(readSource(config, cwd, fs, adapter)).rejects.toMatchObject({
      code: "SOURCE_UNREADABLE",
      message: expect.stringContaining("/workspace/locales/en.json"),
    });
    expect(read).toBe(false);
  });

  it("wraps an Error thrown by the adapter read as SOURCE_INVALID with its message and cause", async () => {
    const thrown = new Error("unexpected token");
    const adapter = makeAdapter(async () => {
      throw thrown;
    });
    const fs = makeFakeFs({ fileExists: async () => true });

    await expect(readSource(config, cwd, fs, adapter)).rejects.toMatchObject({
      code: "SOURCE_INVALID",
      message: expect.stringContaining("unexpected token"),
      cause: thrown,
    });
  });

  it("wraps a non-Error thrown by the adapter read as SOURCE_INVALID via String()", async () => {
    const adapter = makeAdapter(async () => {
      throw "raw failure";
    });
    const fs = makeFakeFs({ fileExists: async () => true });

    await expect(readSource(config, cwd, fs, adapter)).rejects.toMatchObject({
      code: "SOURCE_INVALID",
      message: expect.stringContaining("raw failure"),
    });
  });
});
