import { describe, expect, it } from "vitest";
import { defaultAdapterRegistry, makeContext, makeProject, nodeFs } from "../test-support.js";
import { statusDiffTool } from "./status-diff.js";

describe("status.diff", () => {
  it("lists a missing key for a target locale that lacks it", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });

    const outcome = await statusDiffTool.execute(
      {},
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        locales: [
          {
            locale: "de",
            missing: ["greeting"],
            changed: [],
            orphaned: [],
            hasPendingChanges: true,
          },
        ],
      },
    });
  });

  it("reports no pending changes once every key is translated", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });

    const outcome = await statusDiffTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { locales: [{ locale: "de", hasPendingChanges: false }] },
    });
  });

  it("returns isError with the offending field for an out-of-range locales list", async () => {
    const dir = await makeProject({ greeting: "Hello" });

    const outcome = await statusDiffTool.execute({ locales: [] }, makeContext({ cwd: dir }));

    expect(outcome.kind).toBe("invalid");
  });
});
