import { describe, expect, it } from "vitest";
import { defaultAdapterRegistry, makeContext, makeProject, nodeFs } from "../test-support.js";
import { statusCheckTool } from "./status-check.js";

describe("status.check", () => {
  it("reports missing keys per target locale", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });

    const outcome = await statusCheckTool.execute(
      {},
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { locales: [{ locale: "de", missing: 1, stale: 0, upToDate: 0, inSync: false }] },
    });
  });

  it("reports a locale in sync once every key is translated", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });

    const outcome = await statusCheckTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { locales: [{ locale: "de", missing: 0, stale: 0, upToDate: 1, inSync: true }] },
    });
  });

  it("returns isError with the offending field for an out-of-range locales list", async () => {
    const dir = await makeProject({ greeting: "Hello" });

    const outcome = await statusCheckTool.execute({ locales: [] }, makeContext({ cwd: dir }));

    expect(outcome.kind).toBe("invalid");
    expect(outcome).toMatchObject({ message: expect.stringContaining("locales") });
  });

  it("maps a whole-run SdkError to an error outcome", async () => {
    const dir = await makeProject({ greeting: "Hello" });

    const outcome = await statusCheckTool.execute({ locales: ["fr"] }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("UNKNOWN_LOCALE"),
    });
  });
});
