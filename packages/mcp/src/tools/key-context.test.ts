import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeContext,
  makeProject,
  nodeFs,
  writeJsonFile,
} from "../test-support.js";
import { keyContextTool } from "./key-context.js";

describe("key.context", () => {
  it("returns the key's values, applying glossary terms, budget, and a draft check", async () => {
    const dir = await makeProject(
      { greeting: "Add it to your cart" },
      { de: { greeting: "Leg es in den Korb" } },
    );
    const glossaryPath = join(dir, "glossary.json");
    await writeJsonFile(glossaryPath, {
      version: 2,
      terms: [{ source: "cart", target: "Warenkorb", forbidden: { de: ["Karren"] } }],
      doNotTranslate: [],
    });
    const context = makeContext({
      cwd: dir,
      fs: nodeFs,
      config: baseLoadedConfig({
        config: baseVerbatraConfig({ maxLength: { greeting: 30 } }),
        glossary: { source: "file", path: glossaryPath },
      }),
    });

    const outcome = await keyContextTool.execute(
      { locale: "de", key: "greeting", draft: "Leg es in den Karren" },
      context,
    );

    expect(outcome).toEqual({
      kind: "ok",
      result: {
        source: "Add it to your cart",
        target: "Leg es in den Korb",
        provenance: { origin: "unrecorded", reviewState: "unreviewed" },
        glossary: {
          terms: [
            { source: "cart", target: "Warenkorb", forbidden: ["Karren"], caseSensitive: false },
          ],
          doNotTranslate: [],
        },
        maxLength: 30,
        draftCheck: {
          terms: [
            { source: "cart", target: "Warenkorb", targetUsed: false, forbiddenUsed: ["Karren"] },
          ],
          doNotTranslate: [],
        },
      },
    });
  });

  it("answers with a glossary notice when the glossary file cannot be read", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const context = makeContext({
      cwd: dir,
      config: baseLoadedConfig({ glossary: { source: "file", path: join(dir, "absent.json") } }),
    });

    const outcome = await keyContextTool.execute({ locale: "de", key: "greeting" }, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        source: "Hello",
        glossary: { terms: [], doNotTranslate: [] },
        glossaryNotice: { code: expect.any(String), message: expect.any(String) },
      },
    });
  });

  it("fails with UNKNOWN_KEY for a key the source does not have", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });

    const outcome = await keyContextTool.execute(
      { locale: "de", key: "missing" },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("UNKNOWN_KEY"),
    });
  });

  it.each([
    { locale: "de" },
    { key: "greeting" },
    { locale: "de", key: "x", draft: "a".repeat(20_001) },
  ])("rejects the invalid input %j", async (params) => {
    const outcome = await keyContextTool.execute(params, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});
