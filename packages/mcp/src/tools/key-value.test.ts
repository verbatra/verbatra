import { describe, expect, it } from "vitest";
import { defaultAdapterRegistry, makeContext, makeProject, nodeFs } from "../test-support.js";
import { keyValueTool } from "./key-value.js";

describe("key.value", () => {
  it("returns both source and target text when the key is translated", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });

    const outcome = await keyValueTool.execute(
      { locale: "de", key: "greeting" },
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toEqual({
      kind: "ok",
      result: { source: "Hello", target: "Hallo" },
      structuredContent: { source: "Hello", target: "Hallo" },
    });
  });

  it("omits target when the key has not been translated yet", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });

    const outcome = await keyValueTool.execute(
      { locale: "de", key: "greeting" },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toEqual({
      kind: "ok",
      result: { source: "Hello" },
      structuredContent: { source: "Hello" },
    });
  });

  it("returns an error outcome for a key not present in the source", async () => {
    const dir = await makeProject({ greeting: "Hello" });

    const outcome = await keyValueTool.execute(
      { locale: "de", key: "missing" },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("UNKNOWN_KEY"),
    });
  });

  it("rejects a blank locale", async () => {
    const outcome = await keyValueTool.execute({ locale: "", key: "greeting" }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});
