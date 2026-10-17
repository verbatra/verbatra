import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GlossaryConfig } from "../config/glossary-file.js";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  realDiskReads,
  writeJsonFile,
} from "../test-support.js";
import { keyContext } from "./key-context.js";

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), {
    greeting: "Add it to your cart",
    title: "Welcome",
  });
  await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Leg es in den Korb" });
  return dir;
}

function loaded(
  overrides: Partial<VerbatraConfig> = {},
  glossary: GlossaryConfig["glossary"] = { source: "inline" },
): GlossaryConfig {
  return { config: baseConfig(overrides), glossary };
}

const CART_GLOSSARY: VerbatraConfig["glossary"] = {
  version: 2,
  terms: [
    { source: "cart", target: "Warenkorb", forbidden: { de: ["Karren"] } },
    { source: "invoice", target: "Rechnung" },
  ],
  doNotTranslate: [],
};

describe("keyContext", () => {
  it("returns the key's values with only the glossary terms its source text uses", async () => {
    const cwd = await project();

    const result = await keyContext({
      loaded: loaded({ glossary: CART_GLOSSARY }),
      cwd,
      locale: "de",
      key: "greeting",
    });

    expect(result).toEqual({
      source: "Add it to your cart",
      target: "Leg es in den Korb",
      provenance: { origin: "unrecorded", reviewState: "unreviewed" },
      glossary: {
        terms: [
          { source: "cart", target: "Warenkorb", forbidden: ["Karren"], caseSensitive: false },
        ],
        doNotTranslate: [],
      },
    });
  });

  it("checks a draft against the applying terms and reports the key's length budget", async () => {
    const cwd = await project();

    const result = await keyContext({
      loaded: loaded({ glossary: CART_GLOSSARY, maxLength: { greeting: 12 } }),
      cwd,
      locale: "de",
      key: "greeting",
      draft: "Leg es in den Karren",
    });

    expect(result.maxLength).toBe(12);
    expect(result.draftCheck).toEqual({
      terms: [
        { source: "cart", target: "Warenkorb", targetUsed: false, forbiddenUsed: ["Karren"] },
      ],
      doNotTranslate: [],
    });
  });

  it("redacts a secret-shaped glossary translation before matching", async () => {
    const cwd = await project();
    const secret = `sk-${"a1".repeat(24)}`;

    const result = await keyContext({
      loaded: loaded({ glossary: { cart: secret } }),
      cwd,
      locale: "de",
      key: "greeting",
    });

    expect(result.glossary.terms[0]?.target).toBe("[REDACTED]");
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("reports no glossary entries for a project without a glossary", async () => {
    const cwd = await project();

    const result = await keyContext({
      loaded: loaded({}, { source: "none" }),
      cwd,
      locale: "de",
      key: "title",
    });

    expect(result).toEqual({ source: "Welcome", glossary: { terms: [], doNotTranslate: [] } });
  });

  it("reads through the injected file system", async () => {
    const cwd = await project();

    await expect(
      keyContext(
        { loaded: loaded({}, { source: "none" }), cwd, locale: "de", key: "title" },
        { fs: makeFakeFs() },
      ),
    ).rejects.toMatchObject({ code: "SOURCE_UNREADABLE" });
  });

  it("fails with UNKNOWN_KEY for a key the source does not have", async () => {
    const cwd = await project();

    await expect(
      keyContext({ loaded: loaded(), cwd, locale: "de", key: "missing" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_KEY" });
  });
});

describe("keyContext: a glossary that cannot be read", () => {
  it("answers with an empty glossary and a redacted notice, keeping the key's values", async () => {
    const cwd = await project();
    const path = join(cwd, "glossary.json");
    await writeFile(path, "{ not json sk-ant-api03-abcdefghijklmnopqrstuvwxyz", "utf8");

    const result = await keyContext({
      loaded: loaded({}, { source: "file", path }),
      cwd,
      locale: "de",
      key: "greeting",
      draft: "Leg es in den Korb",
    });

    expect(result).toMatchObject({
      source: "Add it to your cart",
      target: "Leg es in den Korb",
      glossary: { terms: [], doNotTranslate: [] },
      glossaryNotice: { code: "CONFIG_INVALID", message: expect.any(String) },
    });
    expect(JSON.stringify(result)).not.toContain("sk-ant-api03");
  });

  it("names a failure without a code generically", async () => {
    const cwd = await project();
    const path = join(cwd, "glossary.json");
    const disk = realDiskReads();
    const fs = makeFakeFs({
      ...disk,
      fileExists: async () => true,
      readFileBounded: async (file, maxBytes) => {
        if (file === path) {
          throw "not an error";
        }
        return disk.readFileBounded(file, maxBytes);
      },
    });

    const result = await keyContext(
      { loaded: loaded({}, { source: "file", path }), cwd, locale: "de", key: "title" },
      { fs },
    );

    expect(result.glossaryNotice).toEqual({ code: "GLOSSARY_UNREADABLE", message: "not an error" });
  });
});
