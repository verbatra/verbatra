import { describe, expect, it } from "vitest";
import {
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

  it("rejects a blank locale", async () => {
    const outcome = await retranslateEntryTool.execute(
      { locale: "", key: "greeting" },
      makeContext(),
    );

    expect(outcome.kind).toBe("invalid");
  });
});
