import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadProvenance } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { defaultAdapterRegistry, makeContext, makeProject, nodeFs } from "../test-support.js";
import { editEntryTool } from "./edit-entry.js";

describe("translation.editEntry", () => {
  it("records the written value's origin as agent", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });

    await editEntryTool.execute(
      { locale: "de", key: "greeting", value: "Hallo" },
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect((await loadProvenance({ cwd: dir })).locales.de?.greeting?.origin).toBe("agent");
  });

  it("writes the value and returns accepted: true when it passes the integrity gate", async () => {
    const dir = await makeProject({ greeting: "Hello {{name}}" }, { de: {} });

    const outcome = await editEntryTool.execute(
      { locale: "de", key: "greeting", value: "Hallo {{name}}" },
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toEqual({
      kind: "ok",
      result: { accepted: true, value: "Hallo {{name}}" },
      structuredContent: { accepted: true, value: "Hallo {{name}}" },
    });

    const written = JSON.parse(await readFile(join(dir, "locales", "de.json"), "utf8")) as Record<
      string,
      string
    >;
    expect(written.greeting).toBe("Hallo {{name}}");
  });

  it("rejects a value missing the source's placeholder, without writing it", async () => {
    const dir = await makeProject({ greeting: "Hello {{name}}" }, { de: {} });

    const outcome = await editEntryTool.execute(
      { locale: "de", key: "greeting", value: "Hallo" },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toEqual({
      kind: "ok",
      result: { accepted: false, reason: "placeholder", details: ["-{{name}}"], value: "Hallo" },
      structuredContent: {
        accepted: false,
        reason: "placeholder",
        details: ["-{{name}}"],
        value: "Hallo",
      },
    });
  });

  it("returns an error outcome for a key not present in the source", async () => {
    const dir = await makeProject({ greeting: "Hello" });

    const outcome = await editEntryTool.execute(
      { locale: "de", key: "missing", value: "x" },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("UNKNOWN_KEY"),
    });
  });

  it("rejects a blank key", async () => {
    const outcome = await editEntryTool.execute(
      { locale: "de", key: "", value: "x" },
      makeContext(),
    );

    expect(outcome.kind).toBe("invalid");
  });
});
