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
import { retranslateEntryTool } from "./retranslate-entry.js";

describe("translation.retranslateEntry", () => {
  it("calls the provider and writes an accepted translation", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const context = makeContext({
      cwd: dir,
      fs: nodeFs,
      adapterRegistry: defaultAdapterRegistry,
      createProvider: () => makeStubProvider(),
    });

    const outcome = await retranslateEntryTool.execute({ locale: "de", key: "greeting" }, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { accepted: true, value: "[de] Hello" },
    });
  });

  it("returns an error outcome when the provider fails", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const context = makeContext({
      cwd: dir,
      createProvider: () => makeStubProvider({ error: new Error("rate limited") }),
    });

    const outcome = await retranslateEntryTool.execute({ locale: "de", key: "greeting" }, context);

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("rate limited"),
    });
  });

  it("passes the call's signal to the provider and writes nothing once it aborts", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const controller = new AbortController();
    const seen: (AbortSignal | undefined)[] = [];
    const context = {
      ...makeContext({
        cwd: dir,
        fs: nodeFs,
        createProvider: () => ({
          ...makeStubProvider(),
          translateBatch: (request) => {
            seen.push(request.signal);
            controller.abort();
            return Promise.reject(request.signal?.reason);
          },
        }),
      }),
      signal: controller.signal,
    };

    const outcome = await retranslateEntryTool.execute({ locale: "de", key: "greeting" }, context);

    expect(seen).toEqual([controller.signal]);
    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("RUN_CANCELLED"),
    });
    expect(JSON.parse(await readFile(join(dir, "locales", "de.json"), "utf8"))).toEqual({});
  });

  it("rejects a blank locale", async () => {
    const outcome = await retranslateEntryTool.execute(
      { locale: "", key: "greeting" },
      makeContext(),
    );

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

    const outcome = await retranslateEntryTool.execute({ locale: "de", key: "greeting" }, context);

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("MACHINE_TRANSLATION_DISABLED"),
    });
    expect(factoryCalls).toEqual([]);
  });
});
