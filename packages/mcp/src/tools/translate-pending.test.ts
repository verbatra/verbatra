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
      config: baseLoadedConfig({ config: baseVerbatraConfig({ provider: { id: "none" } }) }),
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
