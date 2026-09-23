import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  defaultAdapterRegistry,
  makeContext,
  makeProject,
  makeStubProvider,
  nodeFs,
} from "../test-support.js";
import { translatePendingTool } from "./translate-pending.js";

describe("translation.translatePending", () => {
  it("translates every missing key across every target locale", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const context = makeContext({
      cwd: dir,
      fs: nodeFs,
      adapterRegistry: defaultAdapterRegistry,
      createProvider: () => makeStubProvider(),
    });

    const outcome = await translatePendingTool.execute({}, context);

    expect(outcome.kind).toBe("ok");
    expect(outcome).toMatchObject({ result: { succeeded: ["de"] } });
  });

  it("returns an error outcome when the provider fails for every key", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const context = makeContext({
      cwd: dir,
      createProvider: () => makeStubProvider({ error: new Error("provider unavailable") }),
    });

    const outcome = await translatePendingTool.execute({}, context);

    expect(outcome.kind).toBe("ok");
    expect(outcome).toMatchObject({ result: { failed: ["de"] } });
  });

  it("rejects an unrecognized parameter", async () => {
    const outcome = await translatePendingTool.execute({ bogus: true }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });

  it("returns a MACHINE_TRANSLATION_DISABLED error under provider none, calling no provider", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const factoryCalls: string[] = [];
    const context = makeContext({
      cwd: dir,
      config: baseLoadedConfig({
        config: baseVerbatraConfig({ provider: { id: "none", options: {} } }),
      }),
      createProvider: (config) => {
        factoryCalls.push(config.id);
        return makeStubProvider();
      },
    });

    const outcome = await translatePendingTool.execute({}, context);

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("MACHINE_TRANSLATION_DISABLED"),
    });
    expect(factoryCalls).toEqual([]);
  });
});

describe("translation.translatePending: locales and maxTokens", () => {
  it("translates only the named locales and leaves every other locale untouched", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {}, fr: {} });
    const targetLocales: string[] = [];
    const context = makeContext({
      cwd: dir,
      fs: nodeFs,
      config: baseLoadedConfig({ config: baseVerbatraConfig({ targetLocales: ["de", "fr"] }) }),
      createProvider: () => {
        const provider = makeStubProvider();
        return {
          ...provider,
          translateBatch: async (request) => {
            targetLocales.push(request.targetLocale);
            return provider.translateBatch(request);
          },
        };
      },
    });

    const outcome = await translatePendingTool.execute({ locales: ["de"] }, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { succeeded: ["de"], locales: [{ locale: "de" }] },
    });
    expect(targetLocales).toEqual(["de"]);
    expect(JSON.parse(await readFile(join(dir, "locales", "fr.json"), "utf8"))).toEqual({});
  });

  it("refuses a locale that is not a configured target with UNKNOWN_LOCALE", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const context = makeContext({ cwd: dir, createProvider: () => makeStubProvider() });

    const outcome = await translatePendingTool.execute({ locales: ["xx"] }, context);

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("UNKNOWN_LOCALE"),
    });
  });

  it("enforces maxTokens as a hard stop and reports the withheld keys", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const context = makeContext({
      cwd: dir,
      fs: nodeFs,
      adapterRegistry: defaultAdapterRegistry,
      createProvider: () => makeStubProvider(),
    });

    const outcome = await translatePendingTool.execute({ maxTokens: 1 }, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        failed: ["de"],
        budget: { maxTokens: 1, behavior: "stop", exceeded: true },
        locales: [{ locale: "de", budgetWithheld: ["greeting"] }],
      },
    });
  });

  it.each([
    { locales: [] },
    { locales: [""] },
    { maxTokens: 0 },
    { maxTokens: 1.5 },
    { maxTokens: "100" },
  ])("rejects invalid params %j", async (params) => {
    const outcome = await translatePendingTool.execute(params, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});
